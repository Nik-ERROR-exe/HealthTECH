"""
Embeddings — NVIDIA NIM `/v1/embeddings` with a deterministic keyword fallback.

The fallback is pure Python (token hashing → fixed channels → L2 normalize), so
RAG keeps working fully offline / without a paid key. It is also unit-testable.
"""
import logging
import math
import re
import string
from hashlib import sha256

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

embed_client = AsyncOpenAI(
    base_url=settings.NVIDIA_BASE_URL,
    api_key=settings.NVIDIA_API_KEY,
)

_STOPWORDS = {
    "a", "about", "after", "all", "also", "an", "and", "are", "as", "at", "be",
    "been", "but", "by", "can", "could", "did", "do", "does", "for", "from",
    "had", "has", "have", "he", "her", "his", "how", "i", "if", "in", "into",
    "is", "it", "its", "may", "me", "my", "no", "not", "of", "on", "or", "our",
    "please", "should", "so", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "those", "to", "up", "us", "was", "we", "were",
    "what", "when", "where", "which", "who", "will", "with", "would", "you",
    "your",
}


def _tokenize(text: str) -> list[str]:
    cleaned = text.lower().translate(str.maketrans("", "", string.punctuation))
    return [t for t in re.split(r"\s+", cleaned) if t and t not in _STOPWORDS]


def fallback_embed(text: str, dim: int | None = None) -> list[float]:
    """Deterministic hashed keyword vector of fixed `dim`, L2-normalized."""
    dim = dim or settings.EMBEDDING_DIM
    vec = [0.0] * dim
    for token in _tokenize(text):
        seed = int.from_bytes(sha256(f"fbe:{token}".encode()).digest()[:8], "big")
        for k in range(3):  # spread each token over 3 channels
            vec[(seed + k * 7919) % dim] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


async def embed_texts(texts: list[str], input_type: str = "query") -> list[list[float]] | None:
    """NVIDIA NIM embeddings. Returns None on any failure so callers can fall back."""
    if not settings.NVIDIA_API_KEY:
        return None
    try:
        resp = await embed_client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=texts,
            extra_body={"input_type": input_type},
        )
        ordered = sorted(resp.data, key=lambda d: d.index)
        return [d.embedding for d in ordered]
    except Exception:
        # Some embeddings endpoints reject the NV-embed `input_type` header.
        try:
            resp = await embed_client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=texts,
            )
            ordered = sorted(resp.data, key=lambda d: d.index)
            return [d.embedding for d in ordered]
        except Exception as exc:
            logger.warning(f"[RAG] NVIDIA embedding failed; using keyword fallback: {exc}")
            return None


async def embed_texts_or_fallback(texts: list[str], input_type: str = "query") -> list[list[float]]:
    """NVIDIA vectors when available, else deterministic keyword vectors."""
    vectors = await embed_texts(texts, input_type=input_type)
    if vectors is None:
        return [fallback_embed(t) for t in texts]
    return vectors