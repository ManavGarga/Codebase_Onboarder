import pytest
from app.models.schemas import (
    RouteDefinition,
    DatabaseModelDefinition,
    ImportRelationship,
    SymbolDefinition,
    SymbolKind,
)
from app.graph.knowledge_graph import knowledge_graph_builder
from app.agents.impact_agent import impact_agent


def test_user_js_multi_tier_dependency_graph_and_facts():
    """
    Validates exact prompt specification:
    When clicking User.js:
                    User.js
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
     authService   profileCtrl  adminCtrl
          │            │            │
          ↓            ↓            ↓
       Login       Profile       Admin

    Direct dependents: 3
    Indirect dependents: >= 3
    Affected APIs: >= 1
    Affected components: >= 3
    Risk: HIGH / CRITICAL
    Graph-derived facts vs LLM interpretation strictly partitioned.
    """
    files = [
        "src/models/User.js",
        "src/services/authService.js",
        "src/controllers/profileCtrl.js",
        "src/controllers/adminCtrl.js",
        "src/components/Login.jsx",
        "src/components/Profile.jsx",
        "src/components/Admin.jsx",
    ]

    # Imports:
    # authService -> User.js
    # profileCtrl -> User.js
    # adminCtrl -> User.js
    # Login.jsx -> authService
    # Profile.jsx -> profileCtrl
    # Admin.jsx -> adminCtrl
    imports = [
        ImportRelationship(
            source_file="src/services/authService.js",
            imported_module="../models/User",
            resolved_target_file="src/models/User.js",
            line_number=2,
        ),
        ImportRelationship(
            source_file="src/controllers/profileCtrl.js",
            imported_module="../models/User",
            resolved_target_file="src/models/User.js",
            line_number=3,
        ),
        ImportRelationship(
            source_file="src/controllers/adminCtrl.js",
            imported_module="../models/User",
            resolved_target_file="src/models/User.js",
            line_number=1,
        ),
        ImportRelationship(
            source_file="src/components/Login.jsx",
            imported_module="../services/authService",
            resolved_target_file="src/services/authService.js",
            line_number=4,
        ),
        ImportRelationship(
            source_file="src/components/Profile.jsx",
            imported_module="../controllers/profileCtrl",
            resolved_target_file="src/controllers/profileCtrl.js",
            line_number=5,
        ),
        ImportRelationship(
            source_file="src/components/Admin.jsx",
            imported_module="../controllers/adminCtrl",
            resolved_target_file="src/controllers/adminCtrl.js",
            line_number=6,
        ),
    ]

    routes = [
        RouteDefinition(
            id="route:POST:/api/auth/login",
            http_method="POST",
            path="/api/auth/login",
            handler_name="login",
            file_path="src/services/authService.js",
            start_line=15,
            end_line=30,
            framework="express",
        ),
        RouteDefinition(
            id="route:GET:/api/profile",
            http_method="GET",
            path="/api/profile",
            handler_name="getProfile",
            file_path="src/controllers/profileCtrl.js",
            start_line=20,
            end_line=35,
            framework="express",
        ),
        RouteDefinition(
            id="route:DELETE:/api/admin/users/:id",
            http_method="DELETE",
            path="/api/admin/users/:id",
            handler_name="deleteUser",
            file_path="src/controllers/adminCtrl.js",
            start_line=40,
            end_line=60,
            framework="express",
        ),
    ]

    models = [
        DatabaseModelDefinition(
            id="model:User",
            model_name="User",
            table_name="users",
            file_path="src/models/User.js",
            start_line=5,
            end_line=45,
            orm_type="mongoose",
        )
    ]

    symbols = [
        SymbolDefinition(
            id="src/components/Login.jsx::Login:10",
            name="Login",
            kind=SymbolKind.FUNCTION,
            file_path="src/components/Login.jsx",
            start_line=10,
            end_line=50,
        ),
        SymbolDefinition(
            id="src/components/Profile.jsx::Profile:10",
            name="Profile",
            kind=SymbolKind.FUNCTION,
            file_path="src/components/Profile.jsx",
            start_line=10,
            end_line=60,
        ),
        SymbolDefinition(
            id="src/components/Admin.jsx::Admin:10",
            name="Admin",
            kind=SymbolKind.FUNCTION,
            file_path="src/components/Admin.jsx",
            start_line=10,
            end_line=70,
        ),
    ]

    graph = knowledge_graph_builder.build_graph(
        repository_id="demo_user_repo",
        files=files,
        symbols=symbols,
        routes=routes,
        models=models,
        imports=imports,
    )

    # Calculate impact targeting User.js
    impact = impact_agent.analyze_impact(
        target_file="User.js",
        graph_data=graph,
    )

    facts = impact.graph_derived_facts
    assert facts is not None
    assert facts.is_graph_derived is True

    # 1. Direct Dependents: exactly authService, profileCtrl, adminCtrl (count = 3)
    assert facts.direct_dependents_count == 3
    direct_labels = {d["label"] for d in facts.direct_dependents}
    assert any("authService" in l for l in direct_labels)
    assert any("profileCtrl" in l for l in direct_labels)
    assert any("adminCtrl" in l for l in direct_labels)

    # 2. Indirect Dependents: Login, Profile, Admin (count >= 3)
    assert facts.indirect_dependents_count >= 3

    # 3. Affected APIs and Components
    assert facts.affected_apis_count >= 3
    assert facts.affected_components_count >= 3

    # 4. Risk level must be HIGH or CRITICAL
    assert impact.risk_level in ("HIGH", "CRITICAL")

    # 5. Strict LLM Interpretation Boundary
    interp = impact.llm_interpretation
    assert interp is not None
    assert "never permitted to invent" in interp.disclaimer.lower() or "strictly prohibited" in interp.disclaimer.lower()

    # 6. Verify Visual Tiered Tree Nodes generated for ReactFlow
    tree_nodes = facts.blast_tree_nodes
    tree_edges = facts.blast_tree_edges
    assert len(tree_nodes) >= 4
    assert len(tree_edges) >= 3

    root_node = next((n for n in tree_nodes if n["data"]["tier"] == 0), None)
    assert root_node is not None
    assert "User" in root_node["data"]["label"]

    tier1_nodes = [n for n in tree_nodes if n["data"]["tier"] == 1]
    assert len(tier1_nodes) == 3

    tier2_nodes = [n for n in tree_nodes if n["data"]["tier"] == 2]
    assert len(tier2_nodes) >= 3
