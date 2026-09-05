import re
import hashlib
from typing import List, Optional
import tree_sitter
from app.models.schemas import CodeChunk, SymbolDefinition
from app.ast_engine.parser import ast_manager


class CodeAwareChunker:
    """
    Slices code strictly along syntactic AST boundaries (functions, classes, blocks)
    preserving exact file paths, line ranges, signatures, and parent scopes,
    with automatic redaction of sensitive credentials, tokens, and private keys.
    """

    MAX_CHUNK_LINES = 120
    OVERLAP_LINES = 10

    # Compiled regex patterns for secret scrubbing
    _PATTERNS = [
        # AWS Access Key ID
        (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED_AWS_KEY]"),
        # Private Keys (RSA, EC, DSA, OpenSSH, Generic)
        (
            re.compile(r"-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----"),
            "[REDACTED_PRIVATE_KEY]",
        ),
        # GitHub Tokens
        (re.compile(r"gh[pousr]_[A-Za-z0-9_]{30,}"), "[REDACTED_GH_TOKEN]"),
        # OpenAI API Keys
        (re.compile(r"sk-[A-Za-z0-9_\-]{20,}"), "[REDACTED_OPENAI_KEY]"),
        # Generic high-entropy hardcoded secrets
        (
            re.compile(r"(?i)(api[_-]?key|secret|token|password|auth[_-]?token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]"),
            r'\1: "[REDACTED_SECRET]"',
        ),
    ]

    @classmethod
    def scrub_secrets(cls, text: str) -> str:
        """Scrubs secrets, tokens, and private keys from code text."""
        if not text:
            return text
        sanitized = text
        for pattern, replacement in cls._PATTERNS:
            sanitized = pattern.sub(replacement, sanitized)
        return sanitized

    def chunk_file(
        self,
        user_id: str,
        repository_id: str,
        file_path: str,
        language: str,
        code_bytes: bytes,
        symbols: List[SymbolDefinition],
        tree: Optional[tree_sitter.Tree] = None,
    ) -> List[CodeChunk]:
        chunks: List[CodeChunk] = []
        code_lines = code_bytes.decode("utf-8", errors="replace").splitlines()
        total_lines = len(code_lines)

        if total_lines == 0:
            return chunks

        # Track covered line ranges so uncovered top-level logic/configs get chunked as well
        covered_lines = set()

        # 1. Chunk from AST symbols (Functions, Classes, Methods)
        for sym in symbols:
            # We chunk standalone functions, methods, and classes that fit within MAX_CHUNK_LINES
            s_line = max(1, sym.start_line)
            e_line = min(total_lines, sym.end_line)

            # If symbol is huge (e.g. class with 400 lines), sub-methods will already be separate symbols,
            # so for the class itself we only chunk its header & declaration, or slice if needed
            if e_line - s_line > self.MAX_CHUNK_LINES:
                if sym.kind.value == "class":
                    # Chunk just the class declaration/header
                    header_end = min(e_line, s_line + 25)
                    raw_content = "\n".join(code_lines[s_line - 1 : header_end])
                    content = self.scrub_secrets(raw_content)
                    chunk_id = self._generate_chunk_id(repository_id, file_path, s_line, header_end)
                    chunks.append(
                        CodeChunk(
                            id=chunk_id,
                            user_id=user_id,
                            repository_id=repository_id,
                            file_path=file_path,
                            language=language,
                            symbol_name=sym.name,
                            node_type="class_declaration",
                            start_line=s_line,
                            end_line=header_end,
                            content=content,
                            signature=sym.signature,
                            scope=sym.parent_symbol,
                        )
                    )
                    for l in range(s_line, header_end + 1):
                        covered_lines.add(l)
                continue

            raw_content = "\n".join(code_lines[s_line - 1 : e_line])
            content = self.scrub_secrets(raw_content)
            chunk_id = self._generate_chunk_id(repository_id, file_path, s_line, e_line)

            chunks.append(
                CodeChunk(
                    id=chunk_id,
                    user_id=user_id,
                    repository_id=repository_id,
                    file_path=file_path,
                    language=language,
                    symbol_name=sym.name,
                    node_type=sym.kind.value,
                    start_line=s_line,
                    end_line=e_line,
                    content=content,
                    signature=sym.signature,
                    scope=sym.parent_symbol,
                )
            )

            for l in range(s_line, e_line + 1):
                covered_lines.add(l)

        # 2. Chunk remaining uncovered lines (imports, top-level scripts, configs, exports)
        uncovered_start = None
        for line_no in range(1, total_lines + 1):
            if line_no not in covered_lines:
                if uncovered_start is None:
                    uncovered_start = line_no
            else:
                if uncovered_start is not None:
                    self._create_block_chunks(
                        user_id, repository_id, file_path, language, code_lines, uncovered_start, line_no - 1, chunks
                    )
                    uncovered_start = None

        if uncovered_start is not None:
            self._create_block_chunks(
                user_id, repository_id, file_path, language, code_lines, uncovered_start, total_lines, chunks
            )

        return chunks

    def _create_block_chunks(
        self,
        user_id: str,
        repository_id: str,
        file_path: str,
        language: str,
        code_lines: List[str],
        start_line: int,
        end_line: int,
        chunks: List[CodeChunk],
    ) -> None:
        # Ignore trivial empty lines spans
        span_text = "\n".join(code_lines[start_line - 1 : end_line]).strip()
        if not span_text:
            return

        curr_start = start_line
        while curr_start <= end_line:
            curr_end = min(end_line, curr_start + self.MAX_CHUNK_LINES - 1)
            raw_content = "\n".join(code_lines[curr_start - 1 : curr_end])
            content = self.scrub_secrets(raw_content)
            if content.strip():
                chunk_id = self._generate_chunk_id(repository_id, file_path, curr_start, curr_end)
                node_type = "module_header" if curr_start == 1 else "code_block"
                chunks.append(
                    CodeChunk(
                        id=chunk_id,
                        user_id=user_id,
                        repository_id=repository_id,
                        file_path=file_path,
                        language=language,
                        symbol_name=None,
                        node_type=node_type,
                        start_line=curr_start,
                        end_line=curr_end,
                        content=content,
                    )
                )
            curr_start = curr_end + 1

    @staticmethod
    def _generate_chunk_id(repository_id: str, file_path: str, start: int, end: int) -> str:
        raw = f"{repository_id}:{file_path}:{start}:{end}"
        return hashlib.sha256(raw.encode()).hexdigest()[:24]


code_chunker = CodeAwareChunker()
