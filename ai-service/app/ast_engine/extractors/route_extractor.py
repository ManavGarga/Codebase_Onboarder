import re
from typing import List, Optional
import tree_sitter
from app.models.schemas import RouteDefinition
from app.ast_engine.parser import ast_manager


class RouteExtractor:
    """
    Detects API endpoints (Express, FastAPI, Flask, Next.js route handlers).
    """

    HTTP_METHODS = {"get", "post", "put", "delete", "patch", "options", "head"}

    def extract_routes(self, root_node: tree_sitter.Node, language: str, file_path: str, code_bytes: bytes) -> List[RouteDefinition]:
        routes: List[RouteDefinition] = []
        if language == "python":
            self._extract_python_routes(root_node, file_path, code_bytes, routes)
        elif language in ("javascript", "typescript", "tsx"):
            self._extract_js_ts_routes(root_node, file_path, code_bytes, routes)
        return routes

    def _extract_python_routes(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        routes: List[RouteDefinition],
    ) -> None:
        # Check decorated definitions: @app.get("/users"), @router.post("/items")
        if node.type == "decorated_definition":
            decorators = [c for c in node.children if c.type == "decorator"]
            fn_node = next((c for c in node.children if c.type in ("function_definition", "async_function_definition")), None)

            if fn_node and decorators:
                fn_name_node = fn_node.child_by_field_name("name")
                fn_name = ast_manager.get_node_text(fn_name_node, code_bytes) if fn_name_node else "handler"

                for dec in decorators:
                    dec_text = ast_manager.get_node_text(dec, code_bytes).strip()
                    match = re.search(r"@(?:[a-zA-Z0-9_]+)\.(" + "|".join(self.HTTP_METHODS) + r")\(\s*[\"']([^\"']+)[\"']", dec_text, re.IGNORECASE)
                    if match:
                        method = match.group(1).upper()
                        path = match.group(2)
                        routes.append(
                            RouteDefinition(
                                id=f"{method}:{path}:{file_path}:{fn_node.start_point.row + 1}",
                                http_method=method,
                                path=path,
                                handler_name=fn_name,
                                file_path=file_path,
                                start_line=fn_node.start_point.row + 1,
                                end_line=fn_node.end_point.row + 1,
                                framework="fastapi",
                            )
                        )

        for child in node.children:
            self._extract_python_routes(child, file_path, code_bytes, routes)

    def _extract_js_ts_routes(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        routes: List[RouteDefinition],
    ) -> None:
        # Check Next.js app router: app/api/.../route.ts export async function GET(...)
        if "route." in file_path.lower() or "/api/" in file_path.lower():
            if node.type in ("function_declaration", "export_statement"):
                text = ast_manager.get_node_text(node, code_bytes)
                for method in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                    if f"export async function {method}" in text or f"export function {method}" in text:
                        # derive path from file path
                        derived_path = file_path
                        if "app" in derived_path:
                            derived_path = "/" + derived_path.split("app")[-1].replace("/route.ts", "").replace("/route.js", "")
                        routes.append(
                            RouteDefinition(
                                id=f"{method}:{derived_path}:{file_path}:{node.start_point.row + 1}",
                                http_method=method,
                                path=derived_path,
                                handler_name=method,
                                file_path=file_path,
                                start_line=node.start_point.row + 1,
                                end_line=node.end_point.row + 1,
                                framework="nextjs",
                            )
                        )

        # Check Express calls: app.get('/users', ...), router.post('/login', ...)
        if node.type == "call_expression":
            fn_node = node.child_by_field_name("function")
            if fn_node and fn_node.type == "member_expression":
                prop_node = fn_node.child_by_field_name("property")
                prop_name = ast_manager.get_node_text(prop_node, code_bytes).lower() if prop_node else ""
                if prop_name in self.HTTP_METHODS:
                    args_node = node.child_by_field_name("arguments")
                    if args_node and args_node.children:
                        # Look for first string argument (path)
                        for arg in args_node.children:
                            if arg.type in ("string", "string_fragment", "template_string"):
                                raw_path = ast_manager.get_node_text(arg, code_bytes).strip('"`\'')
                                routes.append(
                                    RouteDefinition(
                                        id=f"{prop_name.upper()}:{raw_path}:{file_path}:{node.start_point.row + 1}",
                                        http_method=prop_name.upper(),
                                        path=raw_path,
                                        handler_name=f"{prop_name}_{raw_path.replace('/', '_')}",
                                        file_path=file_path,
                                        start_line=node.start_point.row + 1,
                                        end_line=node.end_point.row + 1,
                                        framework="express",
                                    )
                                )
                                break

        for child in node.children:
            self._extract_js_ts_routes(child, file_path, code_bytes, routes)


route_extractor = RouteExtractor()
