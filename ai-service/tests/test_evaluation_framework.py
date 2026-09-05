import pytest
from app.evaluation.benchmark_dataset import BENCHMARK_DATASET, CitationRange
from app.evaluation.metrics_calculator import metrics_calculator
from app.evaluation.retrieval_evaluator import retrieval_evaluator


def test_benchmark_dataset_integrity():
    """Verify dataset meets specifications: >= 50 questions across 11 categories."""
    assert len(BENCHMARK_DATASET) >= 50, f"Expected at least 50 questions, found {len(BENCHMARK_DATASET)}"

    categories = {case.category for case in BENCHMARK_DATASET}
    required_categories = {
        "file location",
        "symbol location",
        "architecture",
        "imports",
        "dependencies",
        "API routes",
        "database models",
        "authentication",
        "frontend/backend flows",
        "execution flows",
        "impact analysis",
    }
    missing = required_categories - categories
    assert not missing, f"Missing categories: {missing}"

    for case in BENCHMARK_DATASET:
        assert case.id and len(case.id) > 2
        assert case.query and len(case.query) > 5
        assert len(case.expected_files) >= 1
        assert len(case.expected_keywords) >= 1
        assert len(case.ground_truth_summary) > 10


def test_metrics_calculator_recall_and_precision():
    retrieved = ["lib/application.js", "lib/response.js", "lib/request.js", "lib/view.js", "lib/utils.js"]
    expected = ["lib/application.js", "lib/response.js"]

    # Recall@K
    rec_2 = metrics_calculator.compute_recall_at_k(retrieved, expected, 2)
    assert rec_2 == 1.0  # both found in top 2

    rec_1 = metrics_calculator.compute_recall_at_k(retrieved, expected, 1)
    assert rec_1 == 0.5  # only 1 found in top 1

    # Precision@K
    prec_2 = metrics_calculator.compute_precision_at_k(retrieved, expected, 2)
    assert prec_2 == 1.0  # 2 relevant in top 2

    prec_5 = metrics_calculator.compute_precision_at_k(retrieved, expected, 5)
    assert prec_5 == 0.4  # 2 relevant in top 5


def test_metrics_calculator_citation_accuracy():
    expected_citations = [
        CitationRange("lib/utils.js", 20, 50),
        CitationRange("lib/response.js", 100, 150),
    ]

    # Perfect overlapping citations
    perfect_citations = [
        {"file_path": "lib/utils.js", "start_line": 25, "end_line": 40},
        {"file_path": "lib/response.js", "start_line": 110, "end_line": 130},
    ]
    res_perfect = metrics_calculator.compute_citation_accuracy(perfect_citations, expected_citations)
    assert res_perfect["citation_precision"] == 1.0
    assert res_perfect["citation_recall"] == 1.0
    assert res_perfect["citation_f1"] == 1.0

    # Non-overlapping lines in same file
    bad_lines = [
        {"file_path": "lib/utils.js", "start_line": 1, "end_line": 10},
    ]
    res_bad = metrics_calculator.compute_citation_accuracy(bad_lines, expected_citations)
    assert res_bad["citation_precision"] == 0.0
    assert res_bad["citation_recall"] == 0.0


def test_metrics_calculator_groundedness():
    chunks = [
        {
            "file_path": "lib/utils.js",
            "content": "function createETagGenerator(options) { return function generateETag(body, encoding) { return etag(buf, options); }; }",
        }
    ]

    grounded_answer = "createETagGenerator returns generateETag function using etag options."
    score_grounded = metrics_calculator.compute_groundedness(grounded_answer, chunks)
    assert score_grounded >= 0.8

    hallucinated_answer = "This component uses Kubernetes pod autoscalers and Apache Kafka messaging."
    score_unsupported = metrics_calculator.compute_groundedness(hallucinated_answer, chunks)
    assert score_unsupported <= 0.3


def test_metrics_calculator_correctness():
    expected_keywords = ["etag", "generator", "hash", "compileETag"]
    gt = "compileETag compiles etag configuration into generation functions producing hash headers."

    correct_answer = "compileETag compiles etag settings into generator functions producing hash headers."
    score_correct = metrics_calculator.compute_correctness(correct_answer, expected_keywords, gt)
    assert score_correct >= 0.7

    incorrect_answer = "Something completely unrelated."
    score_incorrect = metrics_calculator.compute_correctness(incorrect_answer, expected_keywords, gt)
    assert score_incorrect <= 0.3


def test_retrieval_strategies_interface():
    """Verify that all 5 retrieval methods return list structures."""
    # Test with empty/dummy repo to verify signature and fallback safety
    res_vec = retrieval_evaluator.retrieve_vector_only("test_user", "non_existent_repo", "router", top_k=3)
    assert isinstance(res_vec, list)

    res_bm25 = retrieval_evaluator.retrieve_bm25_only("non_existent_repo", "router", top_k=3)
    assert isinstance(res_bm25, list)

    res_rrf = retrieval_evaluator.retrieve_hybrid_rrf("test_user", "non_existent_repo", "router", top_k=3)
    assert isinstance(res_rrf, list)

    res_graph = retrieval_evaluator.retrieve_hybrid_with_graph("test_user", "non_existent_repo", "router", top_k=3)
    assert isinstance(res_graph, list)

    res_rerank = retrieval_evaluator.retrieve_hybrid_graph_reranked("test_user", "non_existent_repo", "router", top_k=3)
    assert isinstance(res_rerank, list)
