"""Unit tests for social_memory.py pure helpers (no LLM calls)."""
from app.nodes.social_memory import merge_social_memory, parse_social_json


# ── parse_social_json ────────────────────────────────────────────────────────

def test_parse_social_json_keeps_topics():
    parsed = parse_social_json(
        '{"family":"Daughter getting married","pets":"Has a dog named Bruno"}'
    )
    assert parsed.get("family") == "Daughter getting married"
    assert parsed.get("pets") == "Has a dog named Bruno"


def test_parse_social_json_empty_placeholder():
    assert parse_social_json('{"other":""}') == {}


def test_parse_social_json_bad():
    assert parse_social_json("garbage") == {}
    assert parse_social_json(None) == {}


# ── merge_social_memory ──────────────────────────────────────────────────────

def test_merge_never_overwrites_existing_topic():
    merged = merge_social_memory(
        {"pets": "Has a dog"},
        {"pets": "Overwrite?", "family": "Daughter wedding next week"},
    )
    assert merged["pets"] == "Has a dog"          # existing wins
    assert merged["family"] == "Daughter wedding next week"
    assert "last_updated" in merged


def test_merge_empty_existing():
    merged = merge_social_memory({}, {"family": "Daughter wedding"})
    assert merged["family"] == "Daughter wedding"
    assert "last_updated" in merged


def test_merge_caps_topics_at_twelve():
    new = {f"topic_{i}": f"note {i}" for i in range(25)}
    merged = merge_social_memory({}, new)
    topics = {k: v for k, v in merged.items() if k != "last_updated"}
    assert len(topics) <= 12


def test_merge_refreshes_last_updated():
    first = merge_social_memory({"a": "1"}, {"b": "2"})
    second = merge_social_memory(first, {"c": "3"})
    assert "last_updated" in second
    # prior facts are preserved and not overwritten
    assert second["a"] == "1"
    assert second["b"] == "2"
    assert second["c"] == "3"