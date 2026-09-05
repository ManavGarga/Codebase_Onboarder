from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Okapi
from app.retrieval.vector_store import vector_store
from app.models.schemas import CodeChunk
from app.core.logging import logger


class HybridRetriever:
    """
    Implements Hybrid Retrieval combining Dense Vector Embeddings (Qdrant)
    with Sparse Lexical Search (BM25) and Reciprocal Rank Fusion (RRF).
    """

    def __init__(self):
        self._bm25_indices: Dict[str, BM25Okapi] = {}
        self._corpus_chunks: Dict[str, List[Dict[str, Any]]] = {}

    def _make_key(self, user_id: str, repository_id: str) -> str:
        return f"{user_id}:{repository_id}" if user_id else repository_id

    def build_bm25_index(self, repository_id: str, chunks: List[CodeChunk], user_id: str = "") -> None:
        if not user_id and chunks:
            user_id = chunks[0].user_id
        key = self._make_key(user_id, repository_id)

        tokenized_corpus = []
        raw_chunks = []
        for c in chunks:
            text = f"{c.file_path} {c.symbol_name or ''} {c.signature or ''} {c.content}".lower()
            tokens = text.split()
            tokenized_corpus.append(tokens)
            raw_chunks.append({
                "chunk_id": c.id,
                "user_id": c.user_id,
                "repository_id": c.repository_id,
                "file_path": c.file_path,
                "language": c.language,
                "symbol_name": c.symbol_name,
                "node_type": c.node_type,
                "start_line": c.start_line,
                "end_line": c.end_line,
                "signature": c.signature,
                "content": c.content,
            })

        if tokenized_corpus:
            self._bm25_indices[key] = BM25Okapi(tokenized_corpus)
            self._corpus_chunks[key] = raw_chunks
            logger.info(f"Built BM25 index for tenant key {key} with {len(raw_chunks)} chunks")

    def search(
        self,
        user_id: str,
        repository_id: str,
        query: str,
        top_k: int = 8,
        file_path_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # 1. Dense Vector Search (Qdrant)
        dense_results = vector_store.search(
            user_id=user_id,
            repository_id=repository_id,
            query=query,
            limit=top_k * 2,
            file_path_filter=file_path_filter,
        )

        # 2. Sparse Lexical Search (BM25)
        sparse_results = []
        key = self._make_key(user_id, repository_id)
        bm25 = self._bm25_indices.get(key)
        corpus = self._corpus_chunks.get(key, [])
        if bm25 and corpus:
            tokens = query.lower().split()
            scores = bm25.get_scores(tokens)
            # Pair scores with chunk objects
            scored_chunks = []
            for idx, score in enumerate(scores):
                if score > 0:
                    item = dict(corpus[idx])
                    item["bm25_score"] = float(score)
                    if file_path_filter and item.get("file_path") != file_path_filter:
                        continue
                    scored_chunks.append(item)
            scored_chunks.sort(key=lambda x: x["bm25_score"], reverse=True)
            sparse_results = scored_chunks[: top_k * 2]

        # 3. Reciprocal Rank Fusion (RRF)
        return self._reciprocal_rank_fusion(dense_results, sparse_results, top_k=top_k)

    def _reciprocal_rank_fusion(
        self,
        dense_hits: List[Dict[str, Any]],
        sparse_hits: List[Dict[str, Any]],
        k_constant: int = 60,
        top_k: int = 8,
    ) -> List[Dict[str, Any]]:
        rrf_scores: Dict[str, float] = {}
        chunk_map: Dict[str, Dict[str, Any]] = {}

        # Dense ranking contribution
        for rank, hit in enumerate(dense_hits):
            cid = hit.get("chunk_id") or f"{hit['file_path']}:{hit['start_line']}"
            chunk_map[cid] = hit
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (k_constant + rank + 1))

        # Sparse ranking contribution
        for rank, hit in enumerate(sparse_hits):
            cid = hit.get("chunk_id") or f"{hit['file_path']}:{hit['start_line']}"
            if cid not in chunk_map:
                chunk_map[cid] = hit
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (k_constant + rank + 1))

        # Sort by final fused RRF score
        sorted_cids = sorted(rrf_scores.keys(), key=lambda c: rrf_scores[c], reverse=True)

        fused: List[Dict[str, Any]] = []
        for cid in sorted_cids[:top_k]:
            item = chunk_map[cid]
            item["rrf_score"] = rrf_scores[cid]
            fused.append(item)

        return fused


hybrid_retriever = HybridRetriever()
