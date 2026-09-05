import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import IngestionRequest
from app.api.routes.analysis import analyze_repository, get_repository_symbols, get_repository_graph

client = TestClient(app)


@pytest.fixture
def temp_repo():
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create 3 sample files
        main_py = os.path.join(temp_dir, "main.py")
        with open(main_py, "w") as f:
            f.write(
                "from utils import helper\n\n"
                "def run_app():\n"
                "    return helper()\n"
            )

        utils_py = os.path.join(temp_dir, "utils.py")
        with open(utils_py, "w") as f:
            f.write(
                "def helper():\n"
                "    return 'helping'\n"
            )

        models_py = os.path.join(temp_dir, "models.py")
        with open(models_py, "w") as f:
            f.write(
                "class User:\n"
                "    def __init__(self, name: str):\n"
                "        self.name = name\n"
            )

        yield temp_dir


def test_incremental_indexing_workflow(temp_repo):
    repo_id = f"test_inc_repo_{os.path.basename(temp_repo)}"
    user_id = "test_developer"

    # =========================================================================
    # STEP 1: Full Initial Ingestion
    # =========================================================================
    req_initial = IngestionRequest(
        user_id=user_id,
        repository_id=repo_id,
        repo_path=temp_repo,
        commit_sha="commit_sha_1",
    )
    res_initial = analyze_repository(req_initial)

    assert res_initial.success is True
    assert res_initial.is_incremental is False
    assert res_initial.total_files == 3
    assert res_initial.skipped_files == 0
    assert res_initial.embeddings_regenerated > 0
    initial_embeddings_count = res_initial.embeddings_regenerated

    # Verify initial symbols
    symbols_1 = get_repository_symbols(repo_id)
    symbol_names_1 = {s.name for s in symbols_1}
    assert "run_app" in symbol_names_1
    assert "helper" in symbol_names_1
    assert "User" in symbol_names_1

    # Verify initial knowledge graph
    graph_1 = get_repository_graph(repo_id)
    assert graph_1.stats["files_count"] == 3

    # =========================================================================
    # STEP 2: Unchanged Repository - Must Skip All Files & Regenerate 0 Embeddings
    # =========================================================================
    req_unchanged = IngestionRequest(
        user_id=user_id,
        repository_id=repo_id,
        repo_path=temp_repo,
        commit_sha="commit_sha_1",
    )
    res_unchanged = analyze_repository(req_unchanged)

    assert res_unchanged.success is True
    assert res_unchanged.is_incremental is True
    assert res_unchanged.total_files == 3
    assert res_unchanged.changed_files == 0
    assert res_unchanged.added_files == 0
    assert res_unchanged.deleted_files == 0
    assert res_unchanged.skipped_files == 3, "100% of files must be skipped when repo is unchanged"
    assert res_unchanged.embeddings_regenerated == 0, "Zero embeddings should be regenerated for unchanged repo"
    assert res_unchanged.processing_time_sec < 0.5, "Unchanged repo ingestion should be virtually instantaneous"

    # =========================================================================
    # STEP 3: Modify 1 File (utils.py) - Re-analyze only affected & Recalculate Downstream
    # =========================================================================
    utils_path = os.path.join(temp_repo, "utils.py")
    with open(utils_path, "w") as f:
        f.write(
            "def helper():\n"
            "    return 'helping_v2'\n\n"
            "def format_data(d):\n"
            "    return d.upper()\n"
        )

    req_modified = IngestionRequest(
        user_id=user_id,
        repository_id=repo_id,
        repo_path=temp_repo,
        commit_sha="commit_sha_2",
    )
    res_modified = analyze_repository(req_modified)

    assert res_modified.success is True
    assert res_modified.is_incremental is True
    assert res_modified.total_files == 3
    assert res_modified.changed_files == 1
    assert res_modified.added_files == 0
    assert res_modified.deleted_files == 0
    assert res_modified.skipped_files == 2, "Unchanged files (main.py, models.py) must be skipped"
    assert 0 < res_modified.embeddings_regenerated < initial_embeddings_count

    # Verify downstream recalculation: modifying utils.py affects main.py because main.py imports utils!
    assert "main.py" in res_modified.affected_downstream_files

    # Verify new symbol is indexed
    symbols_3 = get_repository_symbols(repo_id)
    symbol_names_3 = {s.name for s in symbols_3}
    assert "format_data" in symbol_names_3

    # =========================================================================
    # STEP 4: Add New File (service.py) - Incrementally parsed and merged into Graph
    # =========================================================================
    service_path = os.path.join(temp_repo, "service.py")
    with open(service_path, "w") as f:
        f.write(
            "def process_order(order_id: str):\n"
            "    return {'status': 'processed'}\n"
        )

    req_added = IngestionRequest(
        user_id=user_id,
        repository_id=repo_id,
        repo_path=temp_repo,
        commit_sha="commit_sha_3",
    )
    res_added = analyze_repository(req_added)

    assert res_added.success is True
    assert res_added.is_incremental is True
    assert res_added.total_files == 4
    assert res_added.added_files == 1
    assert res_added.changed_files == 0
    assert res_added.skipped_files == 3

    symbols_4 = get_repository_symbols(repo_id)
    symbol_names_4 = {s.name for s in symbols_4}
    assert "process_order" in symbol_names_4

    # =========================================================================
    # STEP 5: Delete File (models.py) - Removed from Symbols and Vectors
    # =========================================================================
    os.remove(os.path.join(temp_repo, "models.py"))

    req_deleted = IngestionRequest(
        user_id=user_id,
        repository_id=repo_id,
        repo_path=temp_repo,
        commit_sha="commit_sha_4",
    )
    res_deleted = analyze_repository(req_deleted)

    assert res_deleted.success is True
    assert res_deleted.is_incremental is True
    assert res_deleted.total_files == 3
    assert res_deleted.deleted_files == 1
    assert res_deleted.skipped_files == 3
    assert res_deleted.embeddings_regenerated == 0

    symbols_5 = get_repository_symbols(repo_id)
    symbol_names_5 = {s.name for s in symbols_5}
    assert "User" not in symbol_names_5, "Deleted file symbols must be removed from knowledge graph"
