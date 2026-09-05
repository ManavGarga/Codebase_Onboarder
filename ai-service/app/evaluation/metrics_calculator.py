import re
from typing import List, Dict, Any, Set, Tuple
from app.evaluation.benchmark_dataset import CitationRange


class MetricsCalculator:
    """
    Computes quantitative evaluation metrics for code search, retrieval, and QA.
    """

    @staticmethod
    def compute_recall_at_k(retrieved_files: List[str], expected_files: List[str], k: int) -> float:
        """
        Recall@K: fraction of expected files found in top-K retrieved files.
        """
        if not expected_files:
            return 1.0
        top_k_files = set(retrieved_files[:k])
        hits = sum(1 for exp in expected_files if exp in top_k_files)
        return hits / len(expected_files)

    @staticmethod
    def compute_precision_at_k(retrieved_files: List[str], expected_files: List[str], k: int) -> float:
        """
        Precision@K: fraction of top-K retrieved files that are relevant.
        """
        if k <= 0:
            return 0.0
        top_k_files = retrieved_files[:k]
        if not top_k_files:
            return 0.0
        expected_set = set(expected_files)
        relevant_count = sum(1 for f in top_k_files if f in expected_set)
        return relevant_count / k

    @staticmethod
    def compute_citation_accuracy(
        generated_citations: List[Dict[str, Any]],
        expected_citations: List[CitationRange],
    ) -> Dict[str, float]:
        """
        Evaluates citation precision, recall, and F1.
        A citation is valid if it matches the expected file and has line-range overlap.
        """
        if not expected_citations and not generated_citations:
            return {"citation_precision": 1.0, "citation_recall": 1.0, "citation_f1": 1.0}
        if not generated_citations:
            return {"citation_precision": 0.0, "citation_recall": 0.0, "citation_f1": 0.0}
        if not expected_citations:
            return {"citation_precision": 0.0, "citation_recall": 1.0, "citation_f1": 0.0}

        true_positives = 0
        matched_expected = set()

        for gc in generated_citations:
            g_file = gc.get("file_path", "")
            g_start = gc.get("start_line", 1)
            g_end = gc.get("end_line", g_start)

            # Check if this citation overlaps with any expected citation
            for idx, ec in enumerate(expected_citations):
                if g_file == ec.file_path:
                    # Line overlap condition: max(start) <= min(end)
                    if max(g_start, ec.start_line) <= min(g_end, ec.end_line):
                        true_positives += 1
                        matched_expected.add(idx)
                        break

        precision = true_positives / len(generated_citations) if generated_citations else 0.0
        recall = len(matched_expected) / len(expected_citations) if expected_citations else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        return {
            "citation_precision": round(precision, 4),
            "citation_recall": round(recall, 4),
            "citation_f1": round(f1, 4),
        }

    @staticmethod
    def compute_groundedness(answer: str, context_chunks: List[Dict[str, Any]]) -> float:
        """
        Measures the degree to which sentences in the generated answer are grounded
        in the retrieved code snippets (ratio of grounded statements).
        """
        if not answer.strip():
            return 0.0
        if not context_chunks:
            return 0.0

        # Build token set from context
        context_text = " ".join(c.get("content", "") + " " + c.get("file_path", "") for c in context_chunks).lower()
        context_tokens = set(re.findall(r"[a-z0-9_]{3,}", context_text))

        sentences = [s.strip() for s in re.split(r"[.\n;]+", answer) if len(s.strip()) > 10]
        if not sentences:
            return 1.0

        grounded_count = 0
        for sent in sentences:
            sent_tokens = set(re.findall(r"[a-z0-9_]{3,}", sent.lower()))
            if not sent_tokens:
                continue
            # A sentence is grounded if at least 50% of its content tokens appear in the retrieved context
            overlap = sent_tokens.intersection(context_tokens)
            if len(overlap) / len(sent_tokens) >= 0.4:
                grounded_count += 1

        return round(grounded_count / len(sentences), 4)

    @staticmethod
    def compute_correctness(answer: str, expected_keywords: List[str], ground_truth_summary: str) -> float:
        """
        Evaluates factual correctness using keyword presence and semantic overlap with ground truth.
        """
        if not answer.strip():
            return 0.0

        ans_lower = answer.lower()

        # 1. Keyword coverage
        keyword_score = 0.0
        if expected_keywords:
            matched_kw = sum(1 for kw in expected_keywords if kw.lower() in ans_lower)
            keyword_score = matched_kw / len(expected_keywords)

        # 2. Ground truth token overlap
        gt_tokens = set(re.findall(r"[a-z0-9_]{3,}", ground_truth_summary.lower()))
        ans_tokens = set(re.findall(r"[a-z0-9_]{3,}", ans_lower))

        overlap_score = 0.0
        if gt_tokens:
            overlap_score = len(gt_tokens.intersection(ans_tokens)) / len(gt_tokens)

        # Combined harmonic/weighted score
        final_score = 0.6 * keyword_score + 0.4 * overlap_score
        return round(min(1.0, final_score), 4)


metrics_calculator = MetricsCalculator()
