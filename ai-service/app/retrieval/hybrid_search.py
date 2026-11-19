import os
import re
import json
import pickle
import hashlib
from collections.abc import MutableMapping
from typing import List, Dict, Any, Optional, Iterator
from rank_bm25 import BM25Plus, BM25Okapi
from app.retrieval.vector_store import vector_store
from app.models.schemas import CodeChunk
from app.core.logging import logger
from app.storage.persistence import get_metadata_base_dir, _atomic_write_file


def _safe_key_file(prefix: str, key: str, ext: str) -> str:
    """Generates a collision-free, filesystem-safe filename for a tenant key."""
    clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", key.strip())[:48]
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
    filename = f"{prefix}_{clean}_{digest}.{ext}"
    return os.path.join(get_metadata_base_dir(), filename)


def tokenize_code(text: str) -> List[str]:
    """Extracts identifiers, words, and symbols for robust lexical matching."""
    if not text:
        return []
    # Match alphanumeric sequences including underscores (typical for code identifiers)
    tokens = re.findall(r"[a-zA-Z0-9_]+", text.lower())
    return [t for t in tokens if len(t) > 1]


class PersistentBM25IndexStore(MutableMapping):
    """Persists BM25 index models to disk across server restarts."""

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def _file_path(self, key: str) -> str:
        return _safe_key_file("bm25", key, "pkl")

    def __getitem__(self, key: str) -> Any:
        if key in self._cache:
            return self._cache[key]
        path = self._file_path(key)
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    model = pickle.load(f)
                self._cache[key] = model
                return model
            except Exception as e:
                logger.warning(f"Failed to load persisted BM25 index for '{key}': {e}")
        raise KeyError(key)

    def __setitem__(self, key: str, value: Any) -> None:
        self._cache[key] = value
        try:
            raw = pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)
            _atomic_write_file(self._file_path(key), raw)
        except Exception as e:
            logger.error(f"Failed to persist BM25 index for '{key}': {e}")

    def __delitem__(self, key: str) -> None:
        self._cache.pop(key, None)
        path = self._file_path(key)
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass

    def __iter__(self) -> Iterator[str]:
        return iter(list(self._cache.keys()))

    def __len__(self) -> int:
        return len(self._cache)

    def __contains__(self, key: object) -> bool:
        if not isinstance(key, str):
            return False
        if key in self._cache:
            return True
        return os.path.exists(self._file_path(key))

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self.__getitem__(key)
        except KeyError:
            return default

    def clear(self) -> None:
        self._cache.clear()
        base_dir = get_metadata_base_dir()
        if os.path.exists(base_dir):
            for fname in os.listdir(base_dir):
                if fname.startswith("bm25_") and fname.endswith(".pkl"):
                    try:
                        os.remove(os.path.join(base_dir, fname))
                    except Exception:
                        pass


class PersistentCorpusStore(MutableMapping):
    """Persists tokenized chunk corpus to disk across server restarts."""

    def __init__(self):
        self._cache: Dict[str, List[Dict[str, Any]]] = {}

    def _file_path(self, key: str) -> str:
        return _safe_key_file("corpus", key, "json")

    def __getitem__(self, key: str) -> List[Dict[str, Any]]:
        if key in self._cache:
            return self._cache[key]
        path = self._file_path(key)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    corpus = json.load(f)
                self._cache[key] = corpus
                return corpus
            except Exception as e:
                logger.warning(f"Failed to load persisted corpus chunks for '{key}': {e}")
        raise KeyError(key)

    def __setitem__(self, key: str, value: List[Dict[str, Any]]) -> None:
        self._cache[key] = value
        try:
            raw = json.dumps(value, ensure_ascii=False).encode("utf-8")
            _atomic_write_file(self._file_path(key), raw)
        except Exception as e:
            logger.error(f"Failed to persist corpus chunks for '{key}': {e}")

    def __delitem__(self, key: str) -> None:
        self._cache.pop(key, None)
        path = self._file_path(key)
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass

    def __iter__(self) -> Iterator[str]:
        return iter(list(self._cache.keys()))

    def __len__(self) -> int:
        return len(self._cache)

    def __contains__(self, key: object) -> bool:
        if not isinstance(key, str):
            return False
        if key in self._cache:
            return True
        return os.path.exists(self._file_path(key))

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self.__getitem__(key)
        except KeyError:
            return default

    def clear(self) -> None:
        self._cache.clear()
        base_dir = get_metadata_base_dir()
        if os.path.exists(base_dir):
            for fname in os.listdir(base_dir):
                if fname.startswith("corpus_") and fname.endswith(".json"):
                    try:
                        os.remove(os.path.join(base_dir, fname))
                    except Exception:
                        pass


class HybridRetriever:
    """
    Implements Hybrid Retrieval combining Dense Vector Embeddings (Qdrant)
    with Sparse Lexical Search (BM25) and Reciprocal Rank Fusion (RRF).
    Backed by persistent on-disk storage across restarts.
    """

    def __init__(self):
        self._bm25_indices: PersistentBM25IndexStore = PersistentBM25IndexStore()
        self._corpus_chunks: PersistentCorpusStore = PersistentCorpusStore()

    def _make_key(self, user_id: str, repository_id: str) -> str:
        return f"{user_id}:{repository_id}" if user_id else repository_id

    def build_bm25_index(self, repository_id: str, chunks: List[CodeChunk], user_id: str = "") -> None:
        if not user_id and chunks:
            user_id = chunks[0].user_id
        key = self._make_key(user_id, repository_id)

        tokenized_corpus = []
        raw_chunks = []
        for c in chunks:
            text = f"{c.file_path} {c.symbol_name or ''} {c.signature or ''} {c.content}"
            tokens = tokenize_code(text)
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
            # BM25Plus eliminates negative/zero IDF bounds on small or specialized code corpora
            try:
                self._bm25_indices[key] = BM25Plus(tokenized_corpus)
            except Exception:
                self._bm25_indices[key] = BM25Okapi(tokenized_corpus)
            self._corpus_chunks[key] = raw_chunks
            logger.info(f"Built and persisted BM25 index for tenant key '{key}' with {len(raw_chunks)} chunks")

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
        corpus = self._corpus_chunks.get(key)

        # Fallback to key by repository_id alone if scoped tenant key not found
        if (not bm25 or not corpus) and repository_id and repository_id != key:
            bm25 = self._bm25_indices.get(repository_id)
            corpus = self._corpus_chunks.get(repository_id, [])

        if bm25 and corpus:
            tokens = tokenize_code(query)
            if tokens:
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
