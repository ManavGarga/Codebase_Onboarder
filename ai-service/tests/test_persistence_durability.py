import os
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import (
    KnowledgeGraphData,
    GraphNode,
    GraphEdge,
    GraphNodeType,
    SymbolDefinition,
    RouteDefinition,
    DatabaseModelDefinition,
    CodeChunk,
)
from app.api.routes.analysis import (
    REPO_GRAPHS,
    REPO_SYMBOLS,
    REPO_ROUTES,
    REPO_MODELS,
    REPO_FRAMEWORKS,
    REPO_STATES,
)
from app.retrieval.hybrid_search import hybrid_retriever
from app.storage.persistence import (
    get_metadata_base_dir,
    delete_all_repository_metadata,
)

client = TestClient(app)


def test_repo_graph_and_ast_persistence_survives_restart():
    """Verify that graph and AST data are persisted to disk and survive in-memory cache clear."""
    test_repo_id = "test_durability_repo_123"

    # 1. Create and store a knowledge graph
    test_node = GraphNode(
        id="file:src/index.ts",
        label="index.ts",
        type=GraphNodeType.FILE,
        file_path="src/index.ts",
        data={"lines": 100},
    )
    test_edge = GraphEdge(
        id="edge_1",
        source="file:src/index.ts",
        target="file:src/app.ts",
        type="imports",
    )
    graph_data = KnowledgeGraphData(
        nodes=[test_node],
        edges=[test_edge],
        stats={"totalFiles": 1, "totalNodes": 1, "totalEdges": 1},
    )

    REPO_GRAPHS[test_repo_id] = graph_data

    # Store symbols, routes, models, frameworks
    test_symbol = SymbolDefinition(
        id="sym_1",
        name="handleRequest",
        kind="function",
        file_path="src/index.ts",
        start_line=10,
        end_line=25,
        signature="function handleRequest(): void",
    )
    REPO_SYMBOLS[test_repo_id] = [test_symbol]

    test_route = RouteDefinition(
        id="route_1",
        http_method="GET",
        path="/api/health",
        handler_name="healthHandler",
        file_path="src/index.ts",
        start_line=5,
        end_line=8,
        framework="express",
    )
    REPO_ROUTES[test_repo_id] = [test_route]

    test_model = DatabaseModelDefinition(
        id="model_1",
        model_name="User",
        file_path="src/models/User.ts",
        start_line=1,
        end_line=20,
        orm_type="mongoose",
        fields=[{"name": "email", "type_name": "String"}],
    )
    REPO_MODELS[test_repo_id] = [test_model]
    REPO_FRAMEWORKS[test_repo_id] = ["express", "mongoose"]

    # 2. Simulate complete container/process memory restart: clear all in-memory caches
    REPO_GRAPHS._cache.clear()
    REPO_SYMBOLS._cache.clear()
    REPO_ROUTES._cache.clear()
    REPO_MODELS._cache.clear()
    REPO_FRAMEWORKS._cache.clear()

    assert len(REPO_GRAPHS._cache) == 0
    assert len(REPO_SYMBOLS._cache) == 0

    # 3. Verify data is reloaded from disk persistence via dict-like interface
    assert test_repo_id in REPO_GRAPHS
    reloaded_graph = REPO_GRAPHS[test_repo_id]
    assert len(reloaded_graph.nodes) == 1
    assert reloaded_graph.nodes[0].id == "file:src/index.ts"

    assert test_repo_id in REPO_SYMBOLS
    reloaded_symbols = REPO_SYMBOLS[test_repo_id]
    assert len(reloaded_symbols) == 1
    assert reloaded_symbols[0].name == "handleRequest"

    assert test_repo_id in REPO_ROUTES
    reloaded_routes = REPO_ROUTES[test_repo_id]
    assert len(reloaded_routes) == 1
    assert reloaded_routes[0].path == "/api/health"

    assert test_repo_id in REPO_MODELS
    reloaded_models = REPO_MODELS[test_repo_id]
    assert len(reloaded_models) == 1
    assert reloaded_models[0].model_name == "User"

    assert test_repo_id in REPO_FRAMEWORKS
    reloaded_frameworks = REPO_FRAMEWORKS[test_repo_id]
    assert "express" in reloaded_frameworks

    # 4. Verify FastAPI GET endpoints return 200 after memory clear
    REPO_GRAPHS._cache.clear()
    resp = client.get(f"/api/v1/graph/{test_repo_id}")
    assert resp.status_code == 200
    assert resp.json()["stats"]["totalNodes"] == 1

    REPO_SYMBOLS._cache.clear()
    resp = client.get(f"/api/v1/symbols/{test_repo_id}")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Cleanup
    delete_all_repository_metadata(test_repo_id)
    assert test_repo_id not in REPO_GRAPHS


def test_bm25_persistence_survives_restart():
    """Verify that BM25 index and corpus chunks persist to disk and execute searches after memory restart."""
    test_repo_id = "test_bm25_durability_repo"
    user_id = "test_user_durability"

    chunk1 = CodeChunk(
        id="c1",
        user_id=user_id,
        repository_id=test_repo_id,
        file_path="src/auth/jwt.ts",
        language="typescript",
        node_type="function",
        symbol_name="signJwtToken",
        start_line=1,
        end_line=20,
        signature="signJwtToken(payload: object): string",
        content="function signJwtToken(payload) { return jwt.sign(payload, SECRET_KEY); }",
    )
    chunk2 = CodeChunk(
        id="c2",
        user_id=user_id,
        repository_id=test_repo_id,
        file_path="src/payments/stripe.ts",
        language="typescript",
        node_type="function",
        symbol_name="processPayment",
        start_line=1,
        end_line=30,
        signature="processPayment(amount: number): Promise<void>",
        content="async function processPayment(amount) { return await stripe.charges.create({ amount }); }",
    )

    # 1. Build and persist index
    hybrid_retriever.build_bm25_index(
        repository_id=test_repo_id,
        chunks=[chunk1, chunk2],
        user_id=user_id,
    )

    key = hybrid_retriever._make_key(user_id, test_repo_id)
    assert key in hybrid_retriever._bm25_indices

    # 2. Simulate server memory clear
    hybrid_retriever._bm25_indices._cache.clear()
    hybrid_retriever._corpus_chunks._cache.clear()
    assert len(hybrid_retriever._bm25_indices._cache) == 0
    assert len(hybrid_retriever._corpus_chunks._cache) == 0

    # 3. Verify key is detected as present via disk persistence
    assert key in hybrid_retriever._bm25_indices
    assert key in hybrid_retriever._corpus_chunks

    # 4. Execute search - must rehydrate from disk and find matching chunk via BM25
    results = hybrid_retriever.search(
        user_id=user_id,
        repository_id=test_repo_id,
        query="signJwtToken",
        top_k=2,
    )

    assert len(results) > 0
    top_hit = results[0]
    assert "jwt" in top_hit["file_path"] or top_hit.get("symbol_name") == "signJwtToken"

    # Cleanup
    del hybrid_retriever._bm25_indices[key]
    del hybrid_retriever._corpus_chunks[key]
    assert key not in hybrid_retriever._bm25_indices
