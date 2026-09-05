import time
from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Okapi

from app.retrieval.vector_store import vector_store
from app.retrieval.hybrid_search import hybrid_retriever
from app.api.routes.analysis import REPO_GRAPHS
from app.core.logging import logger


class RetrievalEvaluator:
    """
    Implements and compares 5 distinct retrieval strategies:
    A. Vector-only retrieval
    B. BM25-only retrieval
    C. Hybrid RRF retrieval
    D. Hybrid retrieval + graph context
    E. Hybrid retrieval + graph context + reranking
    """

    def retrieve_vector_only(
        self,
        user_id: str,
        repository_id: str,
        query: str,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """Strategy A: Pure dense vector search via Qdrant."""
        return vector_store.search(
            user_id=user_id,
            repository_id=repository_id,
            query=query,
            limit=top_k,
        )

    def retrieve_bm25_only(
        self,
        repository_id: str,
        query: str,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """Strategy B: Pure sparse lexical search via BM25."""
        bm25 = hybrid_retriever._bm25_indices.get(repository_id)
        corpus = hybrid_retriever._corpus_chunks.get(repository_id, [])
        if not bm25 or not corpus:
            return []

        tokens = query.lower().split()
        scores = bm25.get_scores(tokens)

        scored = []
        for idx, score in enumerate(scores):
            if score > 0:
                item = dict(corpus[idx])
                item["score"] = float(score)
                scored.append(item)

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def retrieve_hybrid_rrf(
        self,
        user_id: str,
        repository_id: str,
        query: str,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """Strategy C: Hybrid Dense + BM25 fused with Reciprocal Rank Fusion."""
        return hybrid_retriever.search(
            user_id=user_id,
            repository_id=repository_id,
            query=query,
            top_k=top_k,
        )

    def retrieve_hybrid_with_graph(
        self,
        user_id: str,
        repository_id: str,
        query: str,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Strategy D: Hybrid RRF expanded with 1-hop Knowledge Graph context.
        Expands initial top hits by following file dependencies, imports, and declared symbols.
        """
        initial_hits = self.retrieve_hybrid_rrf(user_id, repository_id, query, top_k=top_k)
        graph_data = REPO_GRAPHS.get(repository_id)

        if not graph_data or not initial_hits:
            return initial_hits

        # Collect 1-hop related file paths from graph edges
        hit_files = {h.get("file_path") for h in initial_hits if h.get("file_path")}
        related_files = set()

        for edge in graph_data.edges:
            src = edge.source
            tgt = edge.target
            # Check file node matches
            src_file = src.replace("file:", "") if src.startswith("file:") else None
            tgt_file = tgt.replace("file:", "") if tgt.startswith("file:") else None

            if src_file in hit_files and tgt_file:
                related_files.add(tgt_file)
            elif tgt_file in hit_files and src_file:
                related_files.add(src_file)

        # Retrieve additional chunks from related files if available
        corpus = hybrid_retriever._corpus_chunks.get(repository_id, [])
        expanded_chunks = list(initial_hits)
        seen_ids = {c.get("chunk_id") or f"{c['file_path']}:{c['start_line']}" for c in initial_hits}

        for c in corpus:
            if c.get("file_path") in related_files:
                cid = c.get("chunk_id") or f"{c['file_path']}:{c['start_line']}"
                if cid not in seen_ids:
                    seen_ids.add(cid)
                    c_copy = dict(c)
                    c_copy["graph_expanded"] = True
                    expanded_chunks.append(c_copy)
                    if len(expanded_chunks) >= top_k + 4:
                        break

        return expanded_chunks[: top_k + 4]

    def retrieve_hybrid_graph_reranked(
        self,
        user_id: str,
        repository_id: str,
        query: str,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Strategy E: Hybrid RRF + Graph Expansion + Cross-relevance Reranking.
        Combines semantic similarity, lexical density, symbol matches, and path weighting.
        """
        candidates = self.retrieve_hybrid_with_graph(user_id, repository_id, query, top_k=top_k * 2)
        if not candidates:
            return []

        query_terms = set(query.lower().split())

        def score_candidate(chunk: Dict[str, Any]) -> float:
            content = (chunk.get("content") or "").lower()
            file_path = (chunk.get("file_path") or "").lower()
            symbol_name = (chunk.get("symbol_name") or "").lower()

            score = 0.0
            # 1. Base RRF score or BM25 score
            if "rrf_score" in chunk:
                score += chunk["rrf_score"] * 50.0
            elif "score" in chunk:
                score += chunk["score"] * 0.5
            else:
                score += 0.5

            # 2. Exact symbol match bonus
            for term in query_terms:
                if len(term) > 2:
                    if term == symbol_name:
                        score += 3.0
                    elif term in symbol_name:
                        score += 1.5

                    if term in file_path:
                        score += 2.0

            # 3. Term frequency in content
            content_hits = sum(1 for t in query_terms if t in content)
            score += (content_hits / max(1, len(query_terms))) * 2.0

            # 4. Graph expansion dampening (boost root hits slightly over 1-hop expansion)
            if chunk.get("graph_expanded"):
                score *= 0.85

            return score

        scored_candidates = []
        for cand in candidates:
            sc = score_candidate(cand)
            cand_copy = dict(cand)
            cand_copy["rerank_score"] = round(sc, 4)
            scored_candidates.append(cand_copy)

        scored_candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored_candidates[:top_k]


retrieval_evaluator = RetrievalEvaluator()
