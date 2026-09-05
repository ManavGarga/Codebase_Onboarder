from app.models.schemas import RouteDefinition, DatabaseModelDefinition, ImportRelationship
from app.graph.knowledge_graph import knowledge_graph_builder


def test_knowledge_graph_and_impact_traversal():
    files = ["src/routes/userRoutes.ts", "src/services/userService.ts", "src/models/userModel.ts"]

    routes = [
        RouteDefinition(
            id="route:GET:/users",
            http_method="GET",
            path="/users",
            handler_name="getUsers",
            file_path="src/routes/userRoutes.ts",
            start_line=10,
            end_line=20,
            framework="express",
        )
    ]

    models = [
        DatabaseModelDefinition(
            id="model:User",
            model_name="User",
            table_name="users",
            file_path="src/models/userModel.ts",
            start_line=5,
            end_line=25,
            orm_type="mongoose",
        )
    ]

    # userRoute imports userService, userService imports userModel
    imports = [
        ImportRelationship(
            source_file="src/routes/userRoutes.ts",
            imported_module="./services/userService",
            resolved_target_file="src/services/userService.ts",
            line_number=2,
        ),
        ImportRelationship(
            source_file="src/services/userService.ts",
            imported_module="./models/userModel",
            resolved_target_file="src/models/userModel.ts",
            line_number=2,
        ),
    ]

    graph = knowledge_graph_builder.build_graph(
        repository_id="test_repo",
        files=files,
        symbols=[],
        routes=routes,
        models=models,
        imports=imports,
    )

    assert len(graph.nodes) >= 5
    assert len(graph.edges) >= 4

    # Test BFS impact: modifying userModel.ts should affect userService.ts, userRoutes.ts, and route GET /users
    impact = knowledge_graph_builder.compute_downstream_impact(
        target_file="src/models/userModel.ts",
        graph_data=graph,
    )

    assert "src/services/userService.ts" in impact["affected_files"]
    assert "src/routes/userRoutes.ts" in impact["affected_files"]
    assert len(impact["affected_routes"]) >= 1
    assert impact["blast_radius_score"] > 0
