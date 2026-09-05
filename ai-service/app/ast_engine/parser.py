import os
from typing import Optional, Dict, Any
import tree_sitter
import tree_sitter_python
import tree_sitter_javascript
import tree_sitter_typescript

from app.core.logging import logger

# Maximum file size for AST parsing to prevent memory exhaustion (500 KB)
MAX_AST_FILE_SIZE = 500 * 1024

# Blacklisted binary or compiled extensions
BINARY_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".zip", ".tar", ".gz",
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mp3", ".wav",
    ".pyc", ".pyo", ".pyd", ".wasm", ".class", ".o", ".obj", ".db", ".sqlite",
}


class ASTParserManager:
    """
    Manages Tree-sitter parsers and AST language runtimes with
    strict security controls against symlinks, binary files, and huge files.
    """

    def __init__(self):
        self._languages: Dict[str, tree_sitter.Language] = {}
        self._parsers: Dict[str, tree_sitter.Parser] = {}
        self._init_languages()

    def _init_languages(self) -> None:
        try:
            self._languages["python"] = tree_sitter.Language(tree_sitter_python.language())
            self._languages["javascript"] = tree_sitter.Language(tree_sitter_javascript.language())
            self._languages["typescript"] = tree_sitter.Language(tree_sitter_typescript.language_typescript())
            self._languages["tsx"] = tree_sitter.Language(tree_sitter_typescript.language_tsx())
            logger.info("Initialized Tree-sitter languages: Python, JavaScript, TypeScript, TSX")
        except Exception as e:
            logger.error(f"Failed to initialize Tree-sitter languages: {e}")
            raise

    def get_language_for_file(self, file_path: str) -> Optional[str]:
        ext = os.path.splitext(file_path)[1].lower()
        if ext in BINARY_EXTENSIONS:
            return None

        mapping = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".mjs": "javascript",
            ".cjs": "javascript",
            ".ts": "typescript",
            ".tsx": "tsx",
        }
        return mapping.get(ext)

    def is_binary_file(self, full_path: str) -> bool:
        """Sniff the first 1024 bytes for null bytes to detect binary/executable files."""
        try:
            with open(full_path, "rb") as f:
                chunk = f.read(1024)
            return b"\x00" in chunk
        except Exception:
            return True

    def parse_code(self, code_bytes: bytes, language: str) -> Optional[tree_sitter.Tree]:
        """
        Parses source code bytes into a Tree-sitter AST.
        """
        if language not in self._languages:
            return None

        if language not in self._parsers:
            self._parsers[language] = tree_sitter.Parser(self._languages[language])

        return self._parsers[language].parse(code_bytes)

    def parse_file(self, full_path: str) -> Optional[tuple[tree_sitter.Tree, str, bytes]]:
        """
        Reads and parses a file from disk with security protections:
        - Rejects symbolic links
        - Rejects files exceeding MAX_AST_FILE_SIZE (500 KB)
        - Rejects binary content (null bytes)
        Returns: (tree, language, raw_bytes) or None
        """
        # 1. Symlink defense
        if os.path.islink(full_path):
            logger.warning(f"Security: Skipping symbolic link {full_path}")
            return None

        if not os.path.isfile(full_path):
            return None

        # 2. File size ceiling defense
        try:
            file_size = os.path.getsize(full_path)
            if file_size > MAX_AST_FILE_SIZE:
                logger.warning(f"Security: Skipping large file {full_path} ({file_size} bytes > {MAX_AST_FILE_SIZE} bytes)")
                return None
        except Exception as e:
            logger.warning(f"Cannot determine file size for {full_path}: {e}")
            return None

        # 3. Language mapping
        lang = self.get_language_for_file(full_path)
        if not lang:
            return None

        # 4. Binary sniffing defense
        if self.is_binary_file(full_path):
            logger.warning(f"Security: Skipping binary file detected at {full_path}")
            return None

        # 5. Read and parse
        try:
            with open(full_path, "rb") as f:
                content = f.read(MAX_AST_FILE_SIZE + 1)

            if len(content) > MAX_AST_FILE_SIZE:
                logger.warning(f"Security: File {full_path} exceeded size limit during read.")
                return None

            tree = self.parse_code(content, lang)
            if tree:
                return tree, lang, content
        except Exception as e:
            logger.warning(f"Error parsing file {full_path}: {e}")
        return None

    @staticmethod
    def get_node_text(node: tree_sitter.Node, code_bytes: bytes) -> str:
        """Safely extract decoded text of an AST node."""
        return code_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


ast_manager = ASTParserManager()
