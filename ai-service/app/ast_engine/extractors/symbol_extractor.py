from typing import List, Optional
import tree_sitter
from app.models.schemas import SymbolDefinition, SymbolKind
from app.ast_engine.parser import ast_manager


class SymbolExtractor:
    """
    Extracts functions, methods, classes, interfaces, and type declarations
    with exact line numbers and signatures using Tree-sitter AST nodes.
    """

    def extract_symbols(self, root_node: tree_sitter.Node, language: str, file_path: str, code_bytes: bytes) -> List[SymbolDefinition]:
        symbols: List[SymbolDefinition] = []
        if language == "python":
            self._extract_python_symbols(root_node, file_path, code_bytes, symbols)
        elif language in ("javascript", "typescript", "tsx"):
            self._extract_js_ts_symbols(root_node, file_path, code_bytes, symbols)
        return symbols

    def _extract_python_symbols(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        symbols: List[SymbolDefinition],
        parent_symbol: Optional[str] = None,
    ) -> None:
        node_type = node.type

        # Function definition (def / async def)
        if node_type in ("function_definition", "async_function_definition"):
            name_node = node.child_by_field_name("name")
            params_node = node.child_by_field_name("parameters")
            return_node = node.child_by_field_name("return_type")

            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "anonymous"
            params_text = ast_manager.get_node_text(params_node, code_bytes) if params_node else "()"
            ret_text = ast_manager.get_node_text(return_node, code_bytes) if return_node else None

            # First line as signature
            sig = f"def {name}{params_text}"
            if ret_text:
                sig += f" -> {ret_text}"

            # Check for docstring
            docstring = self._extract_python_docstring(node, code_bytes)

            kind = SymbolKind.METHOD if parent_symbol else SymbolKind.FUNCTION
            symbol_id = f"{file_path}::{parent_symbol + '.' if parent_symbol else ''}{name}:{node.start_point.row + 1}"

            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=kind,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_col=node.start_point.column,
                    end_col=node.end_point.column,
                    signature=sig,
                    docstring=docstring,
                    parent_symbol=parent_symbol,
                    return_type=ret_text,
                )
            )

            # Recurse inside body with this function as parent if it has nested functions
            body_node = node.child_by_field_name("body")
            if body_node:
                for child in body_node.children:
                    self._extract_python_symbols(child, file_path, code_bytes, symbols, parent_symbol=name)
            return

        # Class definition
        elif node_type == "class_definition":
            name_node = node.child_by_field_name("name")
            superclasses_node = node.child_by_field_name("superclasses")

            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "anonymous_class"
            super_text = ast_manager.get_node_text(superclasses_node, code_bytes) if superclasses_node else ""
            sig = f"class {name}{super_text}"

            docstring = self._extract_python_docstring(node, code_bytes)
            symbol_id = f"{file_path}::{name}:{node.start_point.row + 1}"

            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=SymbolKind.CLASS,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_col=node.start_point.column,
                    end_col=node.end_point.column,
                    signature=sig,
                    docstring=docstring,
                    parent_symbol=parent_symbol,
                )
            )

            body_node = node.child_by_field_name("body")
            if body_node:
                for child in body_node.children:
                    self._extract_python_symbols(child, file_path, code_bytes, symbols, parent_symbol=name)
            return

        # Traverse other children
        for child in node.children:
            self._extract_python_symbols(child, file_path, code_bytes, symbols, parent_symbol)

    def _extract_python_docstring(self, node: tree_sitter.Node, code_bytes: bytes) -> Optional[str]:
        body = node.child_by_field_name("body")
        if body and body.children:
            first_stmt = body.children[0]
            if first_stmt.type == "expression_statement":
                for child in first_stmt.children:
                    if child.type == "string":
                        raw = ast_manager.get_node_text(child, code_bytes)
                        return raw.strip('"""').strip("'''").strip()
        return None

    def _extract_js_ts_symbols(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        symbols: List[SymbolDefinition],
        parent_symbol: Optional[str] = None,
    ) -> None:
        node_type = node.type

        # Function declaration
        if node_type == "function_declaration":
            name_node = node.child_by_field_name("name")
            params_node = node.child_by_field_name("parameters")
            return_node = node.child_by_field_name("return_type")

            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "anonymous"
            params_text = ast_manager.get_node_text(params_node, code_bytes) if params_node else "()"
            ret_text = ast_manager.get_node_text(return_node, code_bytes) if return_node else None

            sig = f"function {name}{params_text}"
            if ret_text:
                sig += f": {ret_text}"

            symbol_id = f"{file_path}::{name}:{node.start_point.row + 1}"
            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=SymbolKind.FUNCTION,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_col=node.start_point.column,
                    end_col=node.end_point.column,
                    signature=sig,
                    parent_symbol=parent_symbol,
                    return_type=ret_text,
                )
            )

        # Class declaration
        elif node_type == "class_declaration":
            name_node = node.child_by_field_name("name")
            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "AnonymousClass"
            symbol_id = f"{file_path}::{name}:{node.start_point.row + 1}"

            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=SymbolKind.CLASS,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_col=node.start_point.column,
                    end_col=node.end_point.column,
                    signature=f"class {name}",
                    parent_symbol=parent_symbol,
                )
            )

            body_node = node.child_by_field_name("body")
            if body_node:
                for child in body_node.children:
                    self._extract_js_ts_symbols(child, file_path, code_bytes, symbols, parent_symbol=name)
            return

        # Method definition inside class
        elif node_type == "method_definition":
            name_node = node.child_by_field_name("name")
            params_node = node.child_by_field_name("parameters")
            return_node = node.child_by_field_name("return_type")

            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "method"
            params_text = ast_manager.get_node_text(params_node, code_bytes) if params_node else "()"
            ret_text = ast_manager.get_node_text(return_node, code_bytes) if return_node else None

            sig = f"{name}{params_text}"
            if ret_text:
                sig += f": {ret_text}"

            symbol_id = f"{file_path}::{parent_symbol + '.' if parent_symbol else ''}{name}:{node.start_point.row + 1}"
            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=SymbolKind.METHOD,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    start_col=node.start_point.column,
                    end_col=node.end_point.column,
                    signature=sig,
                    parent_symbol=parent_symbol,
                    return_type=ret_text,
                )
            )

        # TypeScript Interface declaration
        elif node_type == "interface_declaration":
            name_node = node.child_by_field_name("name")
            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "Interface"
            symbol_id = f"{file_path}::{name}:{node.start_point.row + 1}"

            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=SymbolKind.INTERFACE,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    signature=f"interface {name}",
                    parent_symbol=parent_symbol,
                )
            )

        # TypeScript Type Alias declaration
        elif node_type == "type_alias_declaration":
            name_node = node.child_by_field_name("name")
            name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "Type"
            symbol_id = f"{file_path}::{name}:{node.start_point.row + 1}"

            symbols.append(
                SymbolDefinition(
                    id=symbol_id,
                    name=name,
                    kind=SymbolKind.TYPE_ALIAS,
                    file_path=file_path,
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    signature=f"type {name}",
                    parent_symbol=parent_symbol,
                )
            )

        # Lexical declaration (const myFunc = () => ...)
        elif node_type == "lexical_declaration" or node_type == "variable_declaration":
            for declarator in node.children:
                if declarator.type == "variable_declarator":
                    name_node = declarator.child_by_field_name("name")
                    value_node = declarator.child_by_field_name("value")
                    if name_node and value_node and value_node.type in ("arrow_function", "function_expression"):
                        name = ast_manager.get_node_text(name_node, code_bytes)
                        params_node = value_node.child_by_field_name("parameters")
                        params_text = ast_manager.get_node_text(params_node, code_bytes) if params_node else "()"
                        symbol_id = f"{file_path}::{name}:{declarator.start_point.row + 1}"

                        symbols.append(
                            SymbolDefinition(
                                id=symbol_id,
                                name=name,
                                kind=SymbolKind.FUNCTION,
                                file_path=file_path,
                                start_line=declarator.start_point.row + 1,
                                end_line=declarator.end_point.row + 1,
                                start_col=declarator.start_point.column,
                                end_col=declarator.end_point.column,
                                signature=f"const {name} = {params_text} => ...",
                                parent_symbol=parent_symbol,
                            )
                        )

        # Recurse children
        for child in node.children:
            self._extract_js_ts_symbols(child, file_path, code_bytes, symbols, parent_symbol)


symbol_extractor = SymbolExtractor()
