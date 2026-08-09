"""
Retrieval — Qdrant semantic search with a pure-keyword fallback.

The keyword fallback uses an in-memory chunk corpus loaded from the knowledge
dir, so RAG answers queries even when the vector store / NVIDIA embeddings are
unavailable (free & offline).
"""
import logging
import re
import string

from app.config import settings
from app.rag.embeddings import _STOPWORDS, embed_texts
from app.rag.indexer import knowledge_dir
from app.rag.vector_store import get_client

logger = logging.getLogger(__name__)

# In-memory corpus for the keyword fallback (whole-doc granularity is fine).
_corpus: list[dict] = []
_corpus_loaded = False


def load_keyword_corpus() -> None:
    global _corpus, _corpus_loaded
    corpus = []
    for path in sorted(knowledge_dir().glob("*.md")):
        content = path.read_text(encoding="utf-8", errors="ignore")
        corpus.append({
            "source": path.name,
            "title": path.stem.replace("_", " ").title(),
            "text": content,
        })
    _corpus = corpus
    _corpus_loaded = True


def _token_set(text: str) -> set[str]:
    cleaned = text.lower().translate(str.maketrans("", "", string.punctuation))
    return {t for t in re.split(r"\s+", cleaned) if t and t not in _STOPWORDS}


def keyword_retrieve(query: str, top_k: int = settings.RAG_TOP_K) -> list[dict]:
    """Rank docs by token overlap (Jaccard/TF-style). Pure Python, no I/O."""
    if not _corpus_loaded:
        load_keyword_corpus()
    q_tokens = _token_set(query)
    if not q_tokens:
        return []
    scored = []
    for doc in _corpus:
        d_tokens = _token_set(doc["text"])
        overlap = len(q_tokens & d_tokens) / len(q_tokens)
        if overlap > 0:
            scored.append((overlap, doc))
    scored.sort(key=lambda item: (item[0], len(item[1]["text"])), reverse=True)
    return [
        {
            "id": f"kw-{doc['source']}",
            "text": doc["text"],
            "title": doc["title"],
            "source": doc["source"],
            "score": round(score, 4),
        }
        for score, doc in scored[:top_k]
    ]


async def retrieve(query: str, top_k: int = settings.RAG_TOP_K) -> list[dict]:
    """
    Return relevant chunks as [{id, text, title, source, score}].

    Uses Qdrant semantic search when NVIDIA embeddings succeed, otherwise falls
    back to `keyword_retrieve`.
    """
    vectors = await embed_texts([query], input_type="query")
    if vectors is None:
        return keyword_retrieve(query, top_k=top_k)
    try:
        client = get_client()
        hits = client.search(
            collection_name=settings.QDRANT_COLLECTION,
            query_vector=vectors[0],
            limit=top_k,
            with_payload=True,
        )
        return [
            {
                "id": hit.id,
                "text": hit.payload.get("text", ""),
                "title": hit.payload.get("title", ""),
                "source": hit.payload.get("source", ""),
                "score": round(hit.score or 0.0, 4),
            }
            for hit in hits
        ]
    except Exception as exc:
        logger.warning(f"[RAG] Qdrant search failed; using keyword fallback: {exc}")
        return keyword_retrieve(query, top_k=top_k)


async def retrieve_for_checkin(answers: dict, top_k: int = 3) -> list[str]:
    """
    Turn a check-in's answers into a retrieval query and return chunk texts.

    `answers` is the conversation state's answers dict:
      {question_id: {"question": str, "answer": str}}
    """
    if not answers:
        return []
    parts = []
    for qid, entry in answers.items():
        if isinstance(entry, dict):
            parts.append(f"{entry.get('question', qid)} {entry.get('answer', '')}".strip())
        elif isinstance(entry, str):
            parts.append(f"{qid} {entry}".strip())
    query = "patient check-in report: " + " ; ".join(parts)
    results = await retrieve(query, top_k=top_k)
    return [r["text"] for r in results]