"""
Qdrant vector store — local or cloud.

- Local mode (default, free): embedded/local Qdrant with a persistent on-disk
  directory so the knowledge index survives restarts (`backend/data/qdrant`,
  gitignored).
- Cloud mode: when `QDRANT_URL` + `QDRANT_API_KEY` are set (e.g. the Care-Netra
  cluster), the RAG stack reads/writes the remote collection instead. The
  keyword retriever fallback still covers outages, so this is never fatal.
"""
import logging
from functools import lru_cache
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PayloadSchemaType, VectorParams

from app.config import settings

logger = logging.getLogger(__name__)


def _data_path() -> Path:
    path = Path(settings.QDRANT_PATH)
    if not path.is_absolute():
        # repo-root relative: <repo>/backend/data/qdrant
        path = Path(__file__).resolve().parents[2] / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@lru_cache(maxsize=1)
def get_client() -> QdrantClient:
    """Lazy singleton Qdrant client — cloud when configured, else local."""
    if settings.use_cloud_qdrant:
        logger.info("[RAG] Using Qdrant Cloud")
        return QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            timeout=120,  # seconds — avoids write timeout on slow connections
        )
    return QdrantClient(path=str(_data_path()))


def ensure_collection() -> None:
    """Create the knowledge collection, preserving data unless the vector size changed."""
    client = get_client()
    name = settings.qdrant_collection_name
    recreate = not client.collection_exists(name)
    if not recreate:
        try:
            existing = client.get_collection(name)
            if existing.config.params.vectors.size != settings.EMBEDDING_DIM:
                client.delete_collection(name)
                recreate = True
                logger.warning("[RAG] recreated collection with new vector size")
        except Exception as exc:
            logger.warning(f"[RAG] collection check failed ({exc}); recreating")
            recreate = True
    if recreate:
        client.recreate_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=settings.EMBEDDING_DIM,
                distance=Distance.COSINE,
            ),
        )
    _ensure_source_payload_index(client, name)


def _ensure_source_payload_index(client: QdrantClient, name: str) -> None:
    """Keyword payload index on `source` so the curated-first retriever filter
    (see app/rag/retriever.py) can query on it. Idempotent — Qdrant errors when
    the index already exists, which we treat as success."""
    try:
        client.create_payload_index(
            collection_name=name,
            field_name="source",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        logger.info("[RAG] created keyword payload index on 'source'")
    except Exception as exc:
        logger.info(f"[RAG] source payload index already present: {exc}")