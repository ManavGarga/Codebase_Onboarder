import re
from typing import List
import tree_sitter
from app.models.schemas import DatabaseModelDefinition, ModelField
from app.ast_engine.parser import ast_manager


class ModelExtractor:
    """
    Extracts database schemas and ORM entities (Mongoose, Prisma, SQLAlchemy, TypeORM).
    """

    def extract_models(self, root_node: tree_sitter.Node, language: str, file_path: str, code_bytes: bytes) -> List[DatabaseModelDefinition]:
        models: List[DatabaseModelDefinition] = []
        if language == "python":
            self._extract_python_models(root_node, file_path, code_bytes, models)
        elif language in ("javascript", "typescript", "tsx"):
            self._extract_js_ts_models(root_node, file_path, code_bytes, models)
        return models

    def _extract_python_models(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        models: List[DatabaseModelDefinition],
    ) -> None:
        if node.type == "class_definition":
            # Check superclasses for Base, Model, DeclarativeBase
            superclasses_node = node.child_by_field_name("superclasses")
            super_text = ast_manager.get_node_text(superclasses_node, code_bytes) if superclasses_node else ""
            if any(term in super_text for term in ("Base", "Model", "DeclarativeBase", "SQLModel", "Document")):
                name_node = node.child_by_field_name("name")
                name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "Model"

                fields: List[ModelField] = []
                table_name = None
                body_node = node.child_by_field_name("body")
                if body_node:
                    for stmt in body_node.children:
                        if stmt.type == "expression_statement":
                            stmt_text = ast_manager.get_node_text(stmt, code_bytes)
                            if "__tablename__" in stmt_text:
                                match = re.search(r"__tablename__\s*=\s*['\"]([^'\"]+)['\"]", stmt_text)
                                if match:
                                    table_name = match.group(1)
                            elif "=" in stmt_text and any(orm in stmt_text for orm in ("Column", "Field", "mapped_column")):
                                field_name = stmt_text.split("=")[0].strip()
                                fields.append(
                                    ModelField(
                                        name=field_name,
                                        type_name="SQLColumn",
                                        is_primary_key="primary_key=True" in stmt_text,
                                        is_foreign_key="ForeignKey" in stmt_text,
                                    )
                                )

                models.append(
                    DatabaseModelDefinition(
                        id=f"model:{name}:{file_path}",
                        model_name=name,
                        table_name=table_name or name.lower() + "s",
                        file_path=file_path,
                        start_line=node.start_point.row + 1,
                        end_line=node.end_point.row + 1,
                        orm_type="sqlalchemy",
                        fields=fields,
                    )
                )

        for child in node.children:
            self._extract_python_models(child, file_path, code_bytes, models)

    def _extract_js_ts_models(
        self,
        node: tree_sitter.Node,
        file_path: str,
        code_bytes: bytes,
        models: List[DatabaseModelDefinition],
    ) -> None:
        # Check Mongoose: new Schema({ ... }) or mongoose.model('Name', ...)
        if node.type == "call_expression" or node.type == "new_expression":
            expr_text = ast_manager.get_node_text(node, code_bytes)
            if "new Schema(" in expr_text or "new mongoose.Schema(" in expr_text:
                # Find variable name holding the schema
                parent = node.parent
                schema_name = "Schema"
                if parent and parent.type == "variable_declarator":
                    name_node = parent.child_by_field_name("name")
                    if name_node:
                        schema_name = ast_manager.get_node_text(name_node, code_bytes).replace("Schema", "")
                models.append(
                    DatabaseModelDefinition(
                        id=f"model:{schema_name}:{file_path}:{node.start_point.row + 1}",
                        model_name=schema_name,
                        table_name=schema_name.lower() + "s",
                        file_path=file_path,
                        start_line=node.start_point.row + 1,
                        end_line=node.end_point.row + 1,
                        orm_type="mongoose",
                    )
                )

        # Check TypeORM: @Entity()
        if node.type == "class_declaration":
            class_text = ast_manager.get_node_text(node, code_bytes)
            if "@Entity" in class_text or "extends Model" in class_text:
                name_node = node.child_by_field_name("name")
                name = ast_manager.get_node_text(name_node, code_bytes) if name_node else "Entity"
                models.append(
                    DatabaseModelDefinition(
                        id=f"model:{name}:{file_path}:{node.start_point.row + 1}",
                        model_name=name,
                        table_name=name.lower() + "s",
                        file_path=file_path,
                        start_line=node.start_point.row + 1,
                        end_line=node.end_point.row + 1,
                        orm_type="typeorm",
                    )
                )

        for child in node.children:
            self._extract_js_ts_models(child, file_path, code_bytes, models)


model_extractor = ModelExtractor()
