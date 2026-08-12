"""
Index knowledge docs (markdown) from `backend/knowledge/` into Qdrant.

Idempotent: unchanged docs (same content hash on chunk 0) are skipped so we
don't burn NVIDIA free-tier credits re-embedding. Never raises.
"""
import asyncio
import hashlib
import logging
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import models

from app.config import settings
from app.rag.embeddings import embed_texts_or_fallback
from app.rag.vector_store import ensure_collection, get_client

logger = logging.getLogger(__name__)


def knowledge_dir() -> Path:
    path = Path(settings.KNOWLEDGE_DIR)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path  # <repo>/backend/knowledge
    return path


def chunk_markdown(text: str, title: str = "untitled") -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
    )
    return [
        {"title": title, "text": chunk, "chunk_index": i}
        for i, chunk in enumerate(splitter.split_text(text))
    ]


def _point_id(doc: str, chunk_index: int) -> int:
    """Deterministic 64-bit integer point ID for a (doc, chunk) pair."""
    seed = hashlib.sha256(f"{doc}:{chunk_index}".encode()).digest()[:8]
    return int.from_bytes(seed, "big")


async def index_knowledge_base(verbose: bool = True) -> dict:
    results = {"indexed": 0, "skipped": 0, "errored": 0}
    ensure_collection()
    client = get_client()
    files = sorted(knowledge_dir().glob("*.md"))
    if not files:
        logger.warning("[RAG] no knowledge docs found (backend/knowledge/*.md)")
    for path in files:
        raw = path.read_bytes()
        content_hash = hashlib.sha1(raw).hexdigest()
        content = raw.decode("utf-8", errors="ignore")
        title = path.stem.replace("_", " ").title()

        # Skip unchanged docs (already indexed with matching content hash).
        first_pt = client.retrieve(
            collection_name=settings.qdrant_collection_name,
            ids=[_point_id(path.name, 0)],
            with_payload=True,
        )
        if first_pt and first_pt[0].payload.get("content_hash") == content_hash:
            results["skipped"] += 1
            continue

        try:
            chunks = chunk_markdown(content, title=title)
            vectors = await embed_texts_or_fallback(
                [c["text"] for c in chunks], input_type="passage"
            )
            points = [
                models.PointStruct(
                    id=_point_id(path.name, c["chunk_index"]),
                    vector=vectors[i],
                    payload={
                        "doc_id": path.name,
                        "chunk_index": c["chunk_index"],
                        "title": c["title"],
                        "text": c["text"],
                        "source": path.name,
                        "content_hash": content_hash,
                    },
                )
                for i, c in enumerate(chunks)
            ]
            if points:
                client.upsert(collection_name=settings.qdrant_collection_name, points=points)
            results["indexed"] += min(1, len(chunks))
            if verbose:
                logger.info(f"[RAG] indexed {len(chunks)} chunks from {path.name}")
        except Exception as exc:
            results["errored"] += 1
            logger.warning(f"[RAG] index failed for {path.name}: {exc}")
    return results


async def _run_index() -> None:
    """CLI entrypoint — (re)index backend/knowledge/*.md into the active store
    (Qdrant Cloud when QDRANT_URL + QDRANT_API_KEY are set, else local mode)."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(await index_knowledge_base(verbose=True))


if __name__ == "__main__":
    asyncio.run(_run_index())