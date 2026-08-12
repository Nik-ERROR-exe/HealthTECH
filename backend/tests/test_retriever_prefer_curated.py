"""Unit tests for curated-first retrieval (backend/knowledge/* outranks MedQuAD).

No DB / network — `embed_texts` and `get_client` are monkeypatched so only the
two-tier filter + fill logic in `app.rag.retriever.retrieve` is exercised.
"""
import asyncio
from types import SimpleNamespace

from app.rag import retriever
from app.rag.retriever import retrieve


def _hit(point_id, source, text, score):
    return SimpleNamespace(
        id=point_id,
        payload={"source": source, "text": text, "title": source},
        score=score,
    )


class _FakeClient:
    """search() honours the curated-vs-MedQuAD filter split."""

    def __init__(self):
        self.curated_hits = [
            _hit("c1", "post_surgical_care.md", "cold packs reduce swelling", 0.18),
        ]
        self.medquad_hits = [
            _hit("m1", "MedQuAD", "Cold urticaria diagnosis ...", 0.15),
            _hit("m2", "MedQuAD", "Hand injuries overview ...", 0.12),
        ]

    def search(self, collection_name, query_vector, query_filter, limit, with_payload=True):
        if getattr(query_filter, "must_not", None):
            return list(self.curated_hits)[:limit]
        return list(self.medquad_hits)[:limit]


async def _fake_embed(texts, input_type="query"):
    return [[0.0] * 4096 for _ in texts]


def _patch(monkeypatch, fake=None):
    monkeypatch.setattr(retriever, "get_client", lambda: fake or _FakeClient())
    monkeypatch.setattr(retriever, "embed_texts", _fake_embed)


def test_retrieve_prefers_curated_then_fills_medquad(monkeypatch):
    _patch(monkeypatch)
    results = asyncio.run(retrieve("should i rest my hand in cold water", top_k=3))

    assert [r["source"] for r in results] == [
        "post_surgical_care.md", "MedQuAD", "MedQuAD",
    ]
    for r in results:
        assert all(k in r for k in ("id", "text", "title", "source", "score"))


def test_retrieve_curated_only_no_medquad_filler(monkeypatch):
    fake = _FakeClient()
    fake.medquad_hits = []  # nothing to fill with
    _patch(monkeypatch, fake)

    results = asyncio.run(retrieve("wound care", top_k=3))
    assert [r["source"] for r in results] == ["post_surgical_care.md"]


def test_retrieve_medquad_only_no_curated(monkeypatch):
    fake = _FakeClient()
    fake.curated_hits = []  # no curated docs in the collection
    _patch(monkeypatch, fake)

    results = asyncio.run(retrieve("cold urticaria", top_k=2))
    assert [r["source"] for r in results] == ["MedQuAD", "MedQuAD"]
