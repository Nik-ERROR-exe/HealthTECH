#!/usr/bin/env python
"""
CARENETRA — MedQuAD -> Qdrant Cloud indexer (one-off)

Extracts <QAPair>s from the MedQuAD dataset (default
<backend>/data/MedQuAD-master), embeds them with NVIDIA NIM
(nvidia/nv-embed-v1, dim 4096, input_type "passage") in batches, and upserts
them into the Qdrant Cloud collection (Care-Netra cluster,
"carenetra_knowledge").

Environment (loaded from <backend>/.env):
  QDRANT_URL            Qdrant Cloud cluster URL (Care-Netra)
  QDRANT_API_KEY        Qdrant Cloud API key
  QDRANT_COLLECTION_NAME  (falls back to QDRANT_COLLECTION, then carenetra_knowledge)
  NVIDIA_API_KEY        NVIDIA NIM key (free tier)
  NVIDIA_BASE_URL       default https://integrate.api.nvidia.com/v1
  EMBEDDING_MODEL       default nvidia/nv-embed-v1
  EMBEDDING_DIM         default 4096
  MEDQUAD_ROOT          default <backend>/data/MedQuAD-master

Usage (from backend/):
  python scripts/index_medquad.py                # full run
  python scripts/index_medquad.py --limit 30     # smoke test (first 30 unique pairs)
  python scripts/index_medquad.py --batch 8 --sleep 0.5
"""
import argparse
import logging
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from uuid import NAMESPACE_DNS, uuid5

import requests
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from tqdm import tqdm

logger = logging.getLogger("index_medquad")

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

# ── Config from env ──────────────────────────────────────────────────────────
QDRANT_URL          = os.getenv("QDRANT_URL", "")
QDRANT_API_KEY      = os.getenv("QDRANT_API_KEY", "")
COLLECTION          = (
    os.getenv("QDRANT_COLLECTION_NAME")
    or os.getenv("QDRANT_COLLECTION")
    or "carenetra_knowledge"
)
NVIDIA_API_KEY      = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL     = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
EMBEDDING_MODEL     = os.getenv("EMBEDDING_MODEL", "nvidia/nv-embed-v1")
EMBEDDING_DIM       = int(os.getenv("EMBEDDING_DIM", "4096"))
MEDQUAD_ROOT        = Path(
    os.getenv("MEDQUAD_ROOT") or (BACKEND_DIR / "data" / "MedQuAD-master")
)

# Per spec: passages use input_type "passage" (the retriever later uses "query").
EMBED_INPUT_TYPE    = "passage"
EMBED_TIMEOUT_S     = 60.0
EMBED_MAX_ATTEMPTS  = 5
# Long MedQuAD answers must never exceed NVIDIA's 4,096-token input limit.
MAX_PASSAGE_CHARS   = 3500   # clamp passage text before embedding
TOKEN_LIMIT_CHARS   = 2000   # truncation level for HTTP 400 (token-length) retries


def _inner_text(el) -> str:
    return "".join(el.itertext()).strip() if el is not None else ""


def _clamp(text, limit: int) -> str:
    """Safely truncate a string to `limit` characters (never raises)."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _local(tag: str) -> str:
    """Strip an XML namespace prefix from a tag name (namespace-tolerant)."""
    return tag.rsplit("}", 1)[-1]


def _find_local(root, tag: str):
    """First descendant element whose local name == tag (namespace-tolerant)."""
    for el in root.iter():
        if _local(el.tag) == tag:
            return el
    return None


def _find_all_local(root, tag: str):
    """All descendant elements whose local name == tag (namespace-tolerant)."""
    return [el for el in root.iter() if _local(el.tag) == tag]


def parse_xml_file(path: Path):
    """
    Extract {focus, question, answer} for every <QAPair>. The document-level
    <Focus> is used unless a QAPair carries its own. Returns (pairs, parse_errors).
    """
    try:
        tree = ET.parse(path)
    except (ET.ParseError, UnicodeDecodeError, OSError) as exc:
        logger.warning("parse failed %s: %s", path.name, exc)
        return [], 1

    root = tree.getroot()
    doc_focus_el = _find_local(root, "Focus")
    doc_focus = _inner_text(doc_focus_el) if doc_focus_el is not None else ""

    pairs = []
    for pair in _find_all_local(root, "QAPair"):
        pairs.append({
            "focus":    _inner_text(_find_local(pair, "Focus")) or doc_focus,
            "question": _inner_text(_find_local(pair, "Question")),
            "answer":   _inner_text(_find_local(pair, "Answer")),
        })
    return pairs, 0


def make_passage(pair: dict) -> str:
    return (
        f"Medical Subject: {pair['focus']}\n"
        f"Question: {pair['question']}\n"
        f"Answer: {pair['answer']}"
    )


def make_payload(pair: dict) -> dict:
    return {
        "focus":    pair["focus"],
        "question": pair["question"],
        "content":  f"Q: {pair['question']}\nA: {pair['answer']}",
        "document": pair["focus"],
        "source":   "MedQuAD",
    }


def ensure_collection(client: QdrantClient) -> None:
    """Create carenetra_knowledge (4096, Cosine); preserve data unless size changed."""
    if client.collection_exists(COLLECTION):
        try:
            existing = client.get_collection(COLLECTION)
            if existing.config.params.vectors.size != EMBEDDING_DIM:
                client.delete_collection(COLLECTION)
                logger.warning("recreated collection (vector size changed to %s)", EMBEDDING_DIM)
            else:
                logger.info("collection %r exists (size %s) — reusing", COLLECTION, EMBEDDING_DIM)
                return
        except Exception as exc:
            logger.warning("collection check failed (%s); recreating", exc)
    client.recreate_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
    )


def embed_batch(texts: list) -> list:
    """
    Embed one batch via NVIDIA /v1/embeddings (input_type "passage").

    Retry policy:
      * HTTP 400 (token length) — truncate each item to TOKEN_LIMIT_CHARS and
        retry once, so a single long answer never loses the whole batch.
      * HTTP 429/503 + connection errors — exponential backoff
        (time.sleep(2 ** attempt)) up to EMBED_MAX_ATTEMPTS.
      * requests.Timeout / requests.RequestException — retry up to 3 times
        with exponential backoff.

    Raises only when a batch genuinely cannot be embedded.
    """
    url = f"{NVIDIA_BASE_URL}/embeddings"
    headers = {"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"}
    current = list(texts)
    truncated_once = False

    for attempt in range(1, EMBED_MAX_ATTEMPTS + 1):
        body = {"model": EMBEDDING_MODEL, "input": current, "input_type": EMBED_INPUT_TYPE}
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=EMBED_TIMEOUT_S)
        except (requests.exceptions.Timeout, requests.exceptions.RequestException) as exc:
            # Network / timeout: retry up to 3 times with exponential backoff.
            if attempt > 3:
                raise
            logger.warning("embedding request error (attempt %s); backing off %ss: %s",
                           attempt, 2 ** attempt, exc)
            time.sleep(2 ** attempt)
            continue

        if resp.status_code == 400:
            # Token-length limit: truncate the offending items once and retry.
            if not truncated_once:
                current = [_clamp(t, TOKEN_LIMIT_CHARS) for t in texts]
                truncated_once = True
                logger.warning(
                    "embedding HTTP 400 (token limit); truncated to %s chars, retrying once",
                    TOKEN_LIMIT_CHARS,
                )
                time.sleep(0.5)
                continue
            raise RuntimeError(f"NVIDIA embedding HTTP 400 after truncation: {resp.text[:200]}")

        if resp.status_code in (429, 503):
            if attempt >= EMBED_MAX_ATTEMPTS:
                raise RuntimeError(f"NVIDIA rate limited after {attempt} attempts ({resp.status_code})")
            backoff = 2 ** attempt
            logger.warning("NVIDIA HTTP %s (attempt %s); backing off %ss", resp.status_code, attempt, backoff)
            time.sleep(backoff)
            continue

        if resp.status_code != 200:
            raise RuntimeError(f"NVIDIA embedding HTTP {resp.status_code}: {resp.text[:200]}")

        data = sorted(resp.json().get("data", []), key=lambda d: d.get("index", 0))
        vectors = [d["embedding"] for d in data]
        if len(vectors) != len(current):
            raise RuntimeError(f"embedding count mismatch: got {len(vectors)}, expected {len(current)}")
        return vectors

    raise RuntimeError("embedding request exhausted retries (unreachable)")


def parse_args():
    parser = argparse.ArgumentParser(description="Index MedQuAD into Qdrant Cloud")
    parser.add_argument("--data-dir", default=None, help="MedQuAD XML root (default MEDQUAD_ROOT env)")
    parser.add_argument("--limit", type=int, default=0, help="stop after N unique pairs (0 = all)")
    parser.add_argument("--batch", type=int, default=8, help="embedding batch size (default 8)")
    parser.add_argument("--sleep", type=float, default=0.5, help="seconds between batches")
    parser.add_argument("--include-empty", action="store_true",
                        help="also index QAPairs with empty answers (default: skip them)")
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args()

    missing = [
        name for name, value in {
            "QDRANT_URL": QDRANT_URL, "QDRANT_API_KEY": QDRANT_API_KEY,
            "NVIDIA_API_KEY": NVIDIA_API_KEY,
        }.items() if not value
    ]
    if missing:
        logger.error("missing required env vars in %s/.env: %s", BACKEND_DIR, ", ".join(missing))
        return 1

    data_dir = Path(args.data_dir) if args.data_dir else MEDQUAD_ROOT
    if not data_dir.is_dir():
        logger.error("MedQuAD root not found: %s", data_dir)
        return 1

    logger.info("Connecting to Qdrant Cloud (collection %r)...", COLLECTION)
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60.0)
    ensure_collection(client)

    xml_files = sorted(data_dir.rglob("*.xml"))
    logger.info("Found %s XML files under %s", len(xml_files), data_dir)
    if not xml_files:
        logger.error("no XML files found")
        return 1

    # ── Pass 1: parse + collect unique pairs ────────────────────────────────
    records = []  # (point_id, passage, payload)
    seen: set = set()
    stats = {
        "pairs": 0, "skipped_empty": 0, "duplicates": 0,
        "parse_errors": 0, "embedded": 0, "upserted": 0, "failed_batches": 0,
    }

    for path in tqdm(xml_files, desc="parsing xml", unit="file"):
        pairs, err = parse_xml_file(path)
        stats["parse_errors"] += err
        for pair in pairs:
            stats["pairs"] += 1
            if not (args.include_empty or (pair["question"] and pair["answer"])):
                stats["skipped_empty"] += 1
                continue
            passage = _clamp(make_passage(pair), MAX_PASSAGE_CHARS)
            if passage in seen:
                stats["duplicates"] += 1
                continue
            seen.add(passage)
            records.append((str(uuid5(NAMESPACE_DNS, passage)), passage, make_payload(pair)))
            if args.limit and len(records) >= args.limit:
                break
        if args.limit and len(records) >= args.limit:
            break

    logger.info("Prepared %s unique QAPairs to index (batch=%s, sleep=%ss)",
                len(records), args.batch, args.sleep)

    # ── Pass 2: embed (passage) + upsert in batches ─────────────────────────
    for i in tqdm(range(0, len(records), args.batch), desc="embed+upsert", unit="batch"):
        batch = records[i:i + args.batch]
        pids, passages, payloads = zip(*batch)
        try:
            vectors = embed_batch(list(passages))
            points = [
                PointStruct(id=pid, vector=vec, payload=pay)
                for pid, vec, pay in zip(pids, vectors, payloads)
            ]
            client.upsert(collection_name=COLLECTION, points=points)
            stats["embedded"] += len(vectors)
            stats["upserted"] += len(points)
        except Exception as exc:
            stats["failed_batches"] += 1
            logger.error("batch %s failed: %s", i // args.batch, exc)
        if args.sleep > 0:
            time.sleep(args.sleep)

    try:
        count = client.count(collection_name=COLLECTION, exact=True).count
    except Exception as exc:
        count = None
        logger.warning("could not read collection count: %s", exc)

    logger.info(
        "DONE — pairs=%s skipped_empty=%s duplicates=%s parse_errors=%s "
        "embedded=%s upserted=%s failed_batches=%s collection_count=%s",
        stats["pairs"], stats["skipped_empty"], stats["duplicates"],
        stats["parse_errors"], stats["embedded"], stats["upserted"],
        stats["failed_batches"], count if count is not None else "n/a",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
