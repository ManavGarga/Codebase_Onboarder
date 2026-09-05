import os
import tempfile
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["tree_sitter"] == "active"


def test_full_ingestion_and_qa_flow():
    # Create a temporary mini-repo to ingest
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a sample python server file
        server_py = os.path.join(tmpdir, "server.py")
        with open(server_py, "w", encoding="utf-8") as f:
            f.write("""from fastapi import FastAPI

app = FastAPI()

class ItemManager:
    def list_items(self):
        return ["item1", "item2"]

@app.get("/items")
def get_items():
    mgr = ItemManager()
    return mgr.list_items()
""")

        # Ingestion
        ingest_payload = {
            "user_id": "test_user",
            "repository_id": "test_fastapi_repo",
            "repo_path": tmpdir,
            "branch": "main",
        }
        res = client.post("/api/v1/analyze", json=ingest_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["total_files_analyzed"] == 1
        assert data["total_symbols_extracted"] >= 2
        assert data["total_routes_detected"] == 1

        # Check Graph endpoint
        res_graph = client.get("/api/v1/graph/test_fastapi_repo")
        assert res_graph.status_code == 200
        graph_data = res_graph.json()
        assert len(graph_data["nodes"]) >= 2

        # Check Grounded Code QA
        qa_payload = {
            "user_id": "test_user",
            "repository_id": "test_fastapi_repo",
            "query": "Where is the items endpoint defined?",
        }
        res_qa = client.post("/api/v1/qa", json=qa_payload)
        assert res_qa.status_code == 200
        qa_data = res_qa.json()
        assert len(qa_data["citations"]) >= 1
        assert qa_data["citations"][0]["file_path"] == "server.py"

        # Check Roadmap endpoint
        res_rm = client.post("/api/v1/roadmap", json={"repository_id": "test_fastapi_repo", "repo_path": tmpdir})
        assert res_rm.status_code == 200
        rm_data = res_rm.json()
        assert len(rm_data["milestones"]) == 4

        # Check Impact endpoint
        res_imp = client.post("/api/v1/impact", json={"repository_id": "test_fastapi_repo", "target_file": "server.py"})
        assert res_imp.status_code == 200
        imp_data = res_imp.json()
        assert imp_data["blast_radius_score"] >= 0
