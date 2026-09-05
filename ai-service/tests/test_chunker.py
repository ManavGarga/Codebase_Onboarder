from app.ast_engine.parser import ast_manager
from app.ast_engine.extractors.symbol_extractor import symbol_extractor
from app.chunker.code_chunker import code_chunker


def test_code_aware_chunking_boundaries():
    code = b"""# File header comments
import sys

def calculate_tax(amount: float, rate: float = 0.2) -> float:
    \"\"\"Calculates tax based on rate.\"\"\"
    if amount <= 0:
        return 0.0
    return amount * rate

def format_currency(val: float) -> str:
    return f"${val:.2f}"
"""
    tree = ast_manager.parse_code(code, "python")
    assert tree is not None
    symbols = symbol_extractor.extract_symbols(tree.root_node, "python", "tax.py", code)

    chunks = code_chunker.chunk_file(
        user_id="user_123",
        repository_id="repo_tax",
        file_path="tax.py",
        language="python",
        code_bytes=code,
        symbols=symbols,
        tree=tree,
    )

    assert len(chunks) >= 2
    # Ensure every chunk has valid line ranges and non-empty content
    for c in chunks:
        assert c.start_line <= c.end_line
        assert c.user_id == "user_123"
        assert c.repository_id == "repo_tax"
        assert c.file_path == "tax.py"
        assert len(c.content.strip()) > 0

    # Ensure function chunk preserves symbol name
    tax_chunk = next((c for c in chunks if c.symbol_name == "calculate_tax"), None)
    assert tax_chunk is not None
    assert tax_chunk.node_type == "function"
    assert "Calculates tax" in tax_chunk.content
