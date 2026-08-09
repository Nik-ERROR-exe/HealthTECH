"""
Qdrant local vector store (free — no server required).

Runs Qdrant in embedded/local mode with a persistent on-disk directory so the
knowledge index survives restarts. The data directory is gitignored
(`backend/data/`).
"""
import logging
from functools import lru_cache
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

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
    """Lazy singleton Qdrant client (local persistent mode)."""
    return QdrantClient(path=str(_data_path()))


def ensure_collection() -> None:
    """Create the knowledge collection, preserving data unless the vector size changed."""
    client = get_client()
    if client.collection_exists(settings.QDRANT_COLLECTION):
        try:
            existing = client.get_collection(settings.QDRANT_COLLECTION)
            if existing.config.params.vectors.size != settings.EMBEDDING_DIM:
                client.delete_collection(settings.QDRANT_COLLECTION)
                logger.warning("[RAG] recreated collection with new vector size")
            else:
                return  # keep existing indexed data
        except Exception:
            pass
    client.recreate_collection(
        collection_name=settings.QDRANT_COLLECTION,
        vectors_config=VectorParams(
            size=settings.EMBEDDING_DIM,
            distance=Distance.COSINE,
        ),
    )