import os
from typing import List, Optional
import tree_sitter
from app.models.schemas import ImportRelationship
from app.ast_engine.parser import ast_manager


class DependencyExtractor:
    """
    Extracts module imports, exports, and inter-file dependencies.
    """

    def extract_imports(self, root_node: tree_sitter.Node, language: str, file_path: str, code_bytes: bytes) -> List[ImportRelationship]:
        imports: List[ImportRelationship] = []
        if language == "python":
            self._extract_python_imports(root_node, file_path, code_bytes, imports)
        elif language in ("javascript", "typescript", "tsx"):
            self._extract_js_ts_imports(root_node, file_path, code_bytes, imports)
        return imports

    def _extract_python_imports(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        imports: List[ImportRelationship],
    ) -> None:
        if node.type == "import_statement":
            # e.g., import os, sys
            text = ast_manager.get_node_text(node, code_bytes)
            module_name = text.replace("import", "").strip().split(" as ")[0].strip()
            imports.append(
                ImportRelationship(
                    source_file=file_path,
                    imported_module=module_name,
                    imported_symbols=[],
                    is_relative=module_name.startswith("."),
                    line_number=node.start_point.row + 1,
                )
            )
        elif node.type == "import_from_statement":
            # e.g., from app.models import User, Item
            module_node = node.child_by_field_name("module_name")
            module_name = ast_manager.get_node_text(module_node, code_bytes) if module_node else ""

            # Check relative dots
            full_text = ast_manager.get_node_text(node, code_bytes)
            is_relative = full_text.startswith("from .")

            # Extract imported symbols
            symbols = []
            for child in node.children:
                if child.type in ("dotted_name", "identifier") and child != module_node:
                    symbols.append(ast_manager.get_node_text(child, code_bytes))

            imports.append(
                ImportRelationship(
                    source_file=file_path,
                    imported_module=module_name or ".",
                    imported_symbols=symbols,
                    is_relative=is_relative,
                    line_number=node.start_point.row + 1,
                )
            )

        for child in node.children:
            self._extract_python_imports(child, file_path, code_bytes, imports)

    def _extract_js_ts_imports(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        imports: List[ImportRelationship],
    ) -> None:
        # ES import: import { a, b } from './module'
        if node.type == "import_statement":
            source_node = node.child_by_field_name("source")
            if source_node:
                raw_source = ast_manager.get_node_text(source_node, code_bytes).strip('"`\'')
                is_rel = raw_source.startswith(".")

                symbols: List[str] = []
                clause = node.child_by_field_name("import_clause")
                if clause:
                    for child in clause.children:
                        if child.type == "named_imports":
                            for spec in child.children:
                                if spec.type == "import_specifier":
                                    name_node = spec.child_by_field_name("name")
                                    if name_node:
                                        symbols.append(ast_manager.get_node_text(name_node, code_bytes))
                        elif child.type == "identifier":
                            symbols.append(ast_manager.get_node_text(child, code_bytes))

                imports.append(
                    ImportRelationship(
                        source_file=file_path,
                        imported_module=raw_source,
                        imported_symbols=symbols,
                        is_relative=is_rel,
                        line_number=node.start_point.row + 1,
                    )
                )

        # CommonJS require: const x = require('./x')
        elif node.type == "call_expression":
            fn_node = node.child_by_field_name("function")
            if fn_node and ast_manager.get_node_text(fn_node, code_bytes) == "require":
                args = node.child_by_field_name("arguments")
                if args and args.children:
                    for arg in args.children:
                        if arg.type in ("string", "string_fragment"):
                            raw_mod = ast_manager.get_node_text(arg, code_bytes).strip('"`\'')
                            imports.append(
                                ImportRelationship(
                                    source_file=file_path,
                                    imported_module=raw_mod,
                                    is_relative=raw_mod.startswith("."),
                                    line_number=node.start_point.row + 1,
                                )
                            )
                            break

        for child in node.children:
            self._extract_js_ts_imports(child, file_path, code_bytes, imports)

    @staticmethod
    def resolve_relative_path(source_file: str, imported_module: str, all_repo_files: set[str]) -> Optional[str]:
        """
        Attempts to resolve an internal import path to an exact file in the repo,
        supporting both relative (./foo) and internal project imports (from utils import ...).
        """
        if not imported_module:
            return None

        source_dir = os.path.dirname(source_file)
        if imported_module.startswith("."):
            base_paths = [os.path.normpath(os.path.join(source_dir, imported_module))]
        else:
            dot_as_path = imported_module.replace(".", "/")
            base_paths = [
                os.path.normpath(os.path.join(source_dir, imported_module)),
                imported_module,
                dot_as_path,
            ]

        candidates = []
        for bp in base_paths:
            candidates.extend([
                bp,
                f"{bp}.py",
                f"{bp}/__init__.py",
                f"{bp}.ts",
                f"{bp}.tsx",
                f"{bp}.js",
                f"{bp}.jsx",
                f"{bp}/index.ts",
                f"{bp}/index.js",
            ])

        for cand in candidates:
            cleaned = cand.lstrip("./").replace("\\", "/")
            if cleaned in all_repo_files:
                return cleaned
            if cand in all_repo_files:
                return cand

        return None


dependency_extractor = DependencyExtractor()
