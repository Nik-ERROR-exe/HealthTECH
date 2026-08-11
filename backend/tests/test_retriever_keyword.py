"""Unit tests for the offline keyword retrieval fallback (no Qdrant / NVIDIA)."""
from app.rag.retriever import keyword_retrieve


def test_keyword_retrieve_returns_ranked_results():
    results = keyword_retrieve("wound infection swelling pain", top_k=5)
    assert isinstance(results, list)
    for r in results:
        assert "id" in r and "text" in r and "title" in r and "source" in r and "score" in r
    # Higher overlap should rank first
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_keyword_retrieve_empty_query():
    assert keyword_retrieve("", top_k=5) == []


def test_keyword_retrieve_ignores_stopwords_only():
    # A query made purely of stopwords has no signal → no results
    results = keyword_retrieve("the a an of and", top_k=5)
    assert results == []
