from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from openai import OpenAI
from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import CodeChunk


class VectorStore:
    """
    Manages Qdrant vector database operations with strict multi-tenant payload isolation.
    """

    def __init__(self):
        self.collection_name = settings.QDRANT_COLLECTION
        self.embedding_dim = settings.active_embedding_dim
        self._qdrant_client: Optional[QdrantClient] = None
        self._openai_client: Optional[OpenAI] = None

    @property
    def qdrant(self) -> QdrantClient:
        if self._qdrant_client is None:
            logger.info(f"Connecting to Qdrant at {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")
            try:
                client = QdrantClient(
                    host=settings.QDRANT_HOST,
                    port=settings.QDRANT_PORT,
                    api_key=settings.QDRANT_API_KEY,
                    timeout=1.0,
                    check_compatibility=False,
                )
                # Test connectivity
                client.get_collections()
                self._qdrant_client = client
                self._ensure_collection()
            except Exception as e:
                logger.warning(f"Remote Qdrant unavailable ({e}), falling back to in-memory Qdrant client")
                self._qdrant_client = QdrantClient(":memory:")
                self._ensure_collection()
        return self._qdrant_client

    @property
    def openai(self) -> OpenAI:
        if self._openai_client is None:
            api_key = settings.active_api_key or "dummy_key_for_offline"
            self._openai_client = OpenAI(
                api_key=api_key,
                base_url=settings.active_base_url,
            )
        return self._openai_client

    def _ensure_collection(self) -> None:
        try:
            collections = self.qdrant.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)
            if exists:
                try:
                    c_info = self.qdrant.get_collection(self.collection_name)
                    current_size = None
                    if hasattr(c_info.config.params.vectors, "size"):
                        current_size = c_info.config.params.vectors.size
                    elif isinstance(c_info.config.params.vectors, dict) and "size" in c_info.config.params.vectors:
                        current_size = c_info.config.params.vectors["size"]
                    if current_size and current_size != self.embedding_dim:
                        logger.warning(
                            f"Collection '{self.collection_name}' dimension mismatch (existing: {current_size}, needed: {self.embedding_dim}). Recreating collection for new model."
                        )
                        self.qdrant.delete_collection(self.collection_name)
                        exists = False
                except Exception as ex:
                    logger.warning(f"Could not verify collection vector size: {ex}")

            if not exists:
                self.qdrant.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=qmodels.VectorParams(
                        size=self.embedding_dim,
                        distance=qmodels.Distance.COSINE,
                    ),
                )
                # Create payload indexes for multi-tenant isolation
                self.qdrant.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="user_id",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD,
                )
                self.qdrant.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="repository_id",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD,
                )
                self.qdrant.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="file_path",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD,
                )
                logger.info(f"Created Qdrant collection '{self.collection_name}' with payload indexes (dim={self.embedding_dim})")
        except Exception as e:
            logger.error(f"Error ensuring collection: {e}")

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        # If no active LLM key is set, generate deterministic pseudo-embeddings for offline testing
        if not settings.is_llm_configured:
            logger.warning("No active LLM API key provided. Using normalized hash-based embeddings for test mode.")
            return [self._mock_embedding(t) for t in texts]

        try:
            # Batch embeddings in chunks of 50
            results: List[List[float]] = []
            for i in range(0, len(texts), 50):
                batch = texts[i : i + 50]
                try:
                    kwargs = {
                        "input": batch,
                        "model": settings.active_embedding_model,
                    }
                    if self.embedding_dim:
                        kwargs["dimensions"] = self.embedding_dim
                    resp = self.openai.embeddings.create(**kwargs)
                except Exception:
                    resp = self.openai.embeddings.create(
                        input=batch,
                        model=settings.active_embedding_model,
                    )
                results.extend([item.embedding for item in resp.data])
            return results
        except Exception as e:
            logger.error(f"Embedding error ({e}). Falling back to deterministic embeddings.")
            return [self._mock_embedding(t) for t in texts]

    def _mock_embedding(self, text: str) -> List[float]:
        import hashlib
        import math
        vec = []
        for i in range(self.embedding_dim):
            h = hashlib.sha256(f"{text}:{i}".encode()).hexdigest()
            vec.append(int(h[:4], 16) / 65535.0 - 0.5)
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    def index_chunks(self, chunks: List[CodeChunk]) -> int:
        if not chunks:
            return 0

        texts_to_embed = [
            f"File: {c.file_path}\nSymbol: {c.symbol_name or 'N/A'}\nType: {c.node_type}\nSignature: {c.signature or 'N/A'}\nCode:\n{c.content}"
            for c in chunks
        ]

        embeddings = self.generate_embeddings(texts_to_embed)

        points = []
        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            import uuid
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{chunk.user_id}:{chunk.repository_id}:{chunk.id}"))
            points.append(
                qmodels.PointStruct(
                    id=point_id,
                    vector=emb,
                    payload={
                        "chunk_id": chunk.id,
                        "user_id": chunk.user_id,
                        "repository_id": chunk.repository_id,
                        "file_path": chunk.file_path,
                        "language": chunk.language,
                        "symbol_name": chunk.symbol_name,
                        "node_type": chunk.node_type,
                        "start_line": chunk.start_line,
                        "end_line": chunk.end_line,
                        "signature": chunk.signature,
                        "content": chunk.content,
                    },
                )
            )

        # Batch upsert to Qdrant
        for i in range(0, len(points), 100):
            batch = points[i : i + 100]
            self.qdrant.upsert(
                collection_name=self.collection_name,
                points=batch,
            )

        logger.info(f"Indexed {len(points)} code chunks into Qdrant collection '{self.collection_name}'")
        return len(points)

    def search(
        self,
        user_id: str,
        repository_id: str,
        query: str,
        limit: int = 10,
        file_path_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if not user_id or not repository_id:
            raise ValueError("Tenant boundary violation: both user_id and repository_id are required.")

        query_vector = self.generate_embeddings([query])[0]

        conditions = [
            qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id)),
            qmodels.FieldCondition(key="repository_id", match=qmodels.MatchValue(value=repository_id)),
        ]
        if file_path_filter:
            conditions.append(qmodels.FieldCondition(key="file_path", match=qmodels.MatchValue(value=file_path_filter)))

        filter_query = qmodels.Filter(must=conditions)

        search_res = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=filter_query,
            limit=limit,
        )

        hits = []
        for hit in search_res.points:
            payload = hit.payload or {}
            payload["score"] = hit.score
            hits.append(payload)
        return hits

    def delete_file_chunks(self, user_id: str, repository_id: str, file_paths: List[str]) -> int:
        """
        Deletes vector points for specified files belonging to a user and repository.
        """
        if not user_id or not repository_id or not file_paths:
            return 0

        deleted_count = 0
        try:
            for file_path in file_paths:
                filter_condition = qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(key="user_id", match=qmodels.MatchValue(value=user_id)),
                        qmodels.FieldCondition(key="repository_id", match=qmodels.MatchValue(value=repository_id)),
                        qmodels.FieldCondition(key="file_path", match=qmodels.MatchValue(value=file_path)),
                    ]
                )
                self.qdrant.delete(
                    collection_name=self.collection_name,
                    points_selector=qmodels.FilterSelector(filter=filter_condition),
                )
                deleted_count += 1
            logger.info(f"Deleted vector chunks for {len(file_paths)} files in repo {repository_id}")
        except Exception as e:
            logger.warning(f"Error deleting file chunks in Qdrant: {e}")
        return deleted_count


vector_store = VectorStore()

