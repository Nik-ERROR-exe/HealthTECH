"""
CARENETRA — Episodic Social Memory

A lightweight, non-medical memory tied to the patient profile so the Nurse can
open the next check-in with a personal reference ("How was your daughter's
wedding?") like a real nurse who remembers their patient.

  extract_and_merge_social_memory(transcript, patient_id, db)  -> updates
      patient_profiles.social_memory (guarded; never fatal)
  merge_social_memory(existing, new)                           -> pure merge

merge_social_memory NEVER overwrites an existing topic, caps at MAX_TOPICS and
tags last_updated, so the same facts aren't re-annotated every session.
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings
from app.models.models import PatientProfile

logger = logging.getLogger(__name__)

MAX_TOPICS = 12
TRANSCRIPT_LIMIT = 2500

_PREFERRED_TOPIC_KEYS = (
    "family", "pets", "hobbies", "work", "travel", "events", "home", "other",
)

_SOCIAL_SYSTEM_PROMPT = """You are an empathetic assistant reviewing a patient's check-in chat.
Extract ONLY non-medical social context — personal details such as family, pets,
hobbies, job, travel plans, or life events (for example "daughter is getting married").
IGNORE everything medical: symptoms, medications, vitals, pain, wound, fever.

Output a JSON object mapping a short topic to a one-line note, e.g.
{"family": "Daughter's wedding next month", "pets": "Has a dog named Bruno"}.
Prefer these topic keys when possible: family, pets, hobbies, work, travel, events, home, other.
Keep each note under 15 words. Max 12 topics.
If nothing non-medical is mentioned, output {"other": ""}.
Respond ONLY with the JSON object."""


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _format_transcript(transcript, limit: int = TRANSCRIPT_LIMIT) -> str:
    lines = []
    for turn in transcript or []:
        role = "CARA" if turn.get("role") == "agent" else "Patient"
        content = (turn.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return _truncate("\n".join(lines), limit)


def _parse_json_object(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def parse_social_json(raw: Optional[str]) -> Dict[str, str]:
    """Sanitize the LLM's social JSON into {topic: note}, capped + ordered."""
    data = _parse_json_object(raw)
    if not data:
        return {}
    out: Dict[str, str] = {}
    for key, value in data.items():
        note = str(value or "").strip()
        if not note or note == "other" or note == "":
            continue
        topic = str(key).strip()
        if not topic:
            continue
        out[topic] = _truncate(note, 80)
        if len(out) >= MAX_TOPICS:
            break
    return out


def merge_social_memory(
    existing: Optional[Dict[str, Any]], new: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Pure merge: never overwrites an existing topic, caps at MAX_TOPICS (excluding
    last_updated), and refreshes last_updated.
    """
    merged = dict(existing or {})
    for key, value in (new or {}).items():
        topic = str(key).strip()
        note  = str(value or "").strip()
        if not topic or not note or topic == "last_updated":
            continue
        if topic in merged and merged[topic]:
            continue  # do not re-annotate the same fact
        merged[topic] = note

    # Cap the number of topics (keep last_updated out of the count)
    topics = {k: v for k, v in merged.items() if k != "last_updated"}
    if len(topics) > MAX_TOPICS:
        for extra in list(topics.keys())[MAX_TOPICS:]:
            merged.pop(extra, None)

    merged["last_updated"] = datetime.now(timezone.utc).isoformat()
    return merged


async def extract_and_merge_social_memory(
    transcript, patient_id: str, db
) -> Optional[Dict[str, Any]]:
    """
    Scan a completed session's transcript for non-medical social context and
    merge it into patient_profiles.social_memory. Guarded — never raises.
    Returns the merged memory dict or None on failure/skip.
    """
    text = _format_transcript(transcript)
    if not text:
        return None

    parsed: Dict[str, str] = {}
    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": _SOCIAL_SYSTEM_PROMPT},
                {"role": "user",   "content": f"Check-in chat:\n{text}"},
            ],
            temperature=0.1,
            max_tokens=250,
        )
        parsed = parse_social_json(resp.choices[0].message.content)
    except Exception as exc:
        logger.warning(f"[SocialMemory] LLM failed; skipping social extraction: {exc}")
        return None

    if not parsed:
        logger.info("[SocialMemory] no social context found in this session")
        return None

    patient = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not patient:
        return None

    try:
        current = getattr(patient, "social_memory", None) or {}
        merged = merge_social_memory(current, parsed)
        patient.social_memory = merged
        db.commit()
        logger.info(f"[SocialMemory] stored {len([k for k in merged if k != 'last_updated'])} topics")
        return merged
    except Exception as exc:
        db.rollback()
        # Non-fatal: a missing/migrating column must never break the pipeline.
        logger.warning(f"[SocialMemory] persist failed: {exc}")
        return None