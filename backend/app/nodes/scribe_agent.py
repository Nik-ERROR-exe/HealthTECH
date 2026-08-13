"""
CARENETRA — Scribe Agent (The Extractor)

A single background pass at the end of the check-in conversation that turns the
full transcript into the authoritative structured health JSON which seeds the
LangGraph pipeline (so symptom_agent can skip its redundant LLM pass for AGENT
inputs) and lands in `check_ins.extra_data` for the doctor.

On any LLM failure it falls back to `static_scribe`, a pure keyword/option-text
mapping that is deterministic and unit-testable. Multilingual-aware: the prompt
tells the model to output English labels even if the patient wrote in hi/mr.

Public API (called by conversation.py):
  run_scribe(state, transcript, language)               -> canonical dict
  merge_scribe_and_collected(scribe, collected)         -> canonical dict
  compile_merged_to_text(merged, state)                 -> raw_input paragraph
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings

logger = logging.getLogger(__name__)

SCRIBE_TRANSCRIPT_LIMIT = 3000

# The canonical extract keys that flow into AgentState / CheckIn.extra_data.
SCRIBE_SCALAR_FIELDS = (
    "fever_level", "fatigue_score", "medication_taken", "medication_time",
    "medication_reason", "symptom_summary", "symptom_severity_score",
    "pain_level", "pain_location", "wound_status", "wound_photo_taken", "notes",
)

_FEVER_VALUES = {"normal", "low_grade", "high", "critical", "unknown"}


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _format_transcript(transcript: List[Dict[str, Any]], limit: int = SCRIBE_TRANSCRIPT_LIMIT) -> str:
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


# ── Scribe LLM pass ──────────────────────────────────────────────────────────

SCRIBE_SYSTEM_PROMPT = """You are a clinical data extraction assistant (the "Scribe").
You read a full patient check-in conversation and extract structured health data.
The patient may have written in English, Hindi, or Marathi — ALWAYS output English labels.

Respond ONLY with a JSON object:
{
  "fever_level": "<normal | low_grade | high | critical | unknown>",
  "fatigue_score": <integer 1-10 or null>,
  "medication_taken": <true | false | null>,
  "medication_time": "<when they took it, or null>",
  "medication_reason": "<reason they missed it, or null>",
  "symptom_summary": "<1-2 sentence plain-English summary of reported symptoms>",
  "symptom_severity_score": <float 0-10>,
  "pain_level": <integer 1-10 or null>,
  "pain_location": "<where the pain is, or null>",
  "wound_status": "<how the wound/incision looks, or null>",
  "wound_photo_taken": <true | false>,
  "condition_specific": {"<question_id>": "<best-effort answer>", "...": "..."},
  "checklist_ids_answered": ["general_feeling", "medication_adherence", "..."],
  "notes": "<anything unusual the doctor should see, or ''>"
}

Mapping rules:
- Fever: normal = no fever / feels fine; low_grade = mild (99-100.4F / 37.2-38C);
  high = 100.4-103F / 38-39.4C; critical = >103F / >39.4C or sounds severely unwell;
  unknown = not mentioned.
- Fatigue: 1-3 energetic; 4-6 moderate tiredness; 7-9 very fatigued; 10 bedridden.
- symptom_severity_score: 0-2 well; 3-5 mild; 6-8 moderate/severe; 9-10 critical.
- pain_level is 1-10 when the patient gives a scale, else null.
- STRICT INPUT ADHERENCE: Extract data EXCLUSIVELY from what the patient explicitly stated in the conversation transcript. Do NOT invent, assume, or pull in outside context or symptoms not present in the transcript. If a value is not mentioned, use null (or unknown for fever)."""


def parse_scribe_json(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """Parse + coerce the Scribe's JSON into the canonical schema. None on failure."""
    data = _parse_json_object(raw)
    if not data:
        return None

    fever = str(data.get("fever_level", "unknown") or "unknown").lower()
    if fever not in _FEVER_VALUES:
        fever = "unknown"

    fatigue = _clamp_int(data.get("fatigue_score"), 1, 10)
    pain    = _clamp_int(data.get("pain_level"), 1, 10)
    severity = _clamp_float(data.get("symptom_severity_score"), 0.0, 10.0)

    med_taken = data.get("medication_taken")
    med_taken = _to_bool_or_none(med_taken)

    cs = data.get("condition_specific")
    condition_specific = {str(k): str(v) for k, v in (cs or {}).items()} if isinstance(cs, dict) else {}

    answered = data.get("checklist_ids_answered") or []
    answered = [str(a) for a in answered] if isinstance(answered, list) else []

    return {
        "fever_level":            fever,
        "fatigue_score":          fatigue,
        "medication_taken":       med_taken,
        "medication_time":        data.get("medication_time") or None,
        "medication_reason":      data.get("medication_reason") or None,
        "symptom_summary":        str(data.get("symptom_summary") or "").strip(),
        "symptom_severity_score": severity,
        "pain_level":             pain,
        "pain_location":          data.get("pain_location") or None,
        "wound_status":           data.get("wound_status") or None,
        "wound_photo_taken":      bool(data.get("wound_photo_taken", False)),
        "condition_specific":     condition_specific,
        "checklist_ids_answered": answered,
        "notes":                  str(data.get("notes") or "").strip(),
    }


def _clamp_int(value: Any, lo: int, hi: int) -> Optional[int]:
    try:
        v = int(float(value))
    except (TypeError, ValueError):
        return None
    if not (lo <= v <= hi):
        return None
    return v


def _clamp_float(value: Any, lo: float, hi: float) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, v))


def _to_bool_or_none(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        t = value.strip().lower()
        if t in ("yes", "true", "taken", "all taken", "y", "1"):
            return True
        if t in ("no", "false", "missed", "didn't", "didnt", "none", "n", "0"):
            return False
    if value in (1, 0):
        return bool(value)
    return None


async def run_scribe(
    state: Dict[str, Any],
    transcript: List[Dict[str, Any]],
    language: str = "en",
) -> Dict[str, Any]:
    """
    One authoritative LLM pass over the transcript. Falls back to static_scribe.
    """
    transcript_text = _format_transcript(transcript, SCRIBE_TRANSCRIPT_LIMIT)
    if not transcript_text:
        return static_scribe(state.get("answers") or [])

    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SCRIBE_SYSTEM_PROMPT},
                {"role": "user",   "content": f"Full check-in conversation:\n{transcript_text}"},
            ],
            temperature=0.1,
            max_tokens=600,
        )
        parsed = parse_scribe_json(resp.choices[0].message.content)
        if parsed:
            logger.info("[Scribe] LLM extraction succeeded")
            return parsed
        logger.warning("[Scribe] LLM JSON unparseable; using static extraction")
    except Exception as exc:
        logger.warning(f"[Scribe] LLM failed; using static extraction: {exc}")

    return static_scribe(state.get("answers") or [])


# ── Deterministic fallback extraction ────────────────────────────────────────

def static_scribe(answers: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Pure keyword/option-text mapping of {question_id, answer} records into the
    canonical schema. Best-effort; every field defaults to a safe value.
    """
    out: Dict[str, Any] = {
        "fever_level":            "unknown",
        "fatigue_score":          None,
        "medication_taken":       None,
        "medication_time":        None,
        "medication_reason":      None,
        "symptom_summary":        "",
        "symptom_severity_score": 0.0,
        "pain_level":             None,
        "pain_location":          None,
        "wound_status":           None,
        "wound_photo_taken":      False,
        "condition_specific":     {},
        "checklist_ids_answered": [],
        "notes":                  "",
    }

    symptom_bits: List[str] = []
    for record in answers or []:
        qid   = str(record.get("question_id") or "")
        ans   = str(record.get("answer") or "").strip().lower()
        if not ans:
            continue
        out["checklist_ids_answered"].append(qid)

        # Photo acknowledgment
        if "photo_uploaded" in ans or qid == "wound_photo":
            out["wound_photo_taken"] = True

        # Medication adherence
        if qid == "medication_adherence":
            if any(k in ans for k in ("all taken", "yes", "took them", "took it")):
                out["medication_taken"] = True
            elif any(k in ans for k in ("missed", "didn't", "didnt", "not taken", "no")):
                out["medication_taken"] = False
            else:
                out["medication_taken"] = None
            if out["medication_taken"] is False:
                # reason appears in a later medication_reason answer
                pass

        if qid == "medication_reason":
            out["medication_reason"] = record.get("answer", "").strip() or None

        # Fever / temperature (order matters — check critical/high BEFORE the
        # "101"/"100" substrings so "above 101F" doesn't match the low branch)
        if qid == "temperature_check":
            if any(k in ans for k in ("very high", "critical", "104", "105")):
                out["fever_level"] = "critical"
            elif any(k in ans for k in ("high fever", "above 101", "above 100", "102", "103")):
                out["fever_level"] = "high"
            elif any(k in ans for k in ("normal", "below 99", "no fever")):
                out["fever_level"] = "normal"
            elif any(k in ans for k in ("low fever", "99", "100", "101")):
                out["fever_level"] = "low_grade"
        else:
            if any(k in ans for k in ("fever", "feverish", "warm")):
                if any(k in ans for k in ("very high", "severe", "critical")):
                    out["fever_level"] = "critical"
                elif any(k in ans for k in ("high", "above 101", "102", "103")):
                    out["fever_level"] = "high"
                elif any(k in ans for k in ("slight", "mild", "low", "99", "100")):
                    out["fever_level"] = "low_grade"
                else:
                    out["fever_level"] = "low_grade"

        # Pain
        if qid == "pain_scale":
            if any(k in ans for k in ("mild", "1 to 3")):
                out["pain_level"] = 2
            elif any(k in ans for k in ("moderate", "4 to 6")):
                out["pain_level"] = 5
            elif any(k in ans for k in ("severe", "7 to 10")):
                out["pain_level"] = 9
            elif "10" in ans:
                out["pain_level"] = 10
        else:
            if any(k in ans for k in ("pain", "hurts", "hurting", "sore")):
                out["pain_level"] = out["pain_level"] or 5

        # Fatigue
        if qid == "fatigue_level":
            if any(k in ans for k in ("mild", "manageable")):
                out["fatigue_score"] = 3
            elif any(k in ans for k in ("very", "hard to focus")):
                out["fatigue_score"] = 7
            elif any(k in ans for k in ("exhausted", "difficult to move")):
                out["fatigue_score"] = 9
        else:
            if any(k in ans for k in ("exhausted", "bedridden")):
                out["fatigue_score"] = max(out["fatigue_score"] or 0, 9)
            elif any(k in ans for k in ("fatigue", "tired", "weak", "struggling")):
                out["fatigue_score"] = max(out["fatigue_score"] or 0, 6)

        # Wound / incision status
        if qid in ("surgery_wound", "cardiac_incision"):
            if any(k in ans for k in ("clean", "healing", "normal")):
                out["wound_status"] = "clean / healing"
            elif any(k in ans for k in ("redness", "mild", "soreness")):
                out["wound_status"] = "mild redness / soreness"
            elif any(k in ans for k in ("discharge", "concerning", "significant")):
                out["wound_status"] = "concerning: discharge/redness"

        # General feeling + summary (negatives FIRST so "not doing great"
        # doesn't match the positive "great" substring)
        if qid == "general_feeling":
            if any(k in ans for k in ("not doing great", "not great", "not good", "struggling", "terrible")):
                symptom_bits.append("feeling unwell")
            elif any(k in ans for k in ("good", "great", "fine", "well")):
                symptom_bits.append("feeling well")
            elif any(k in ans for k in ("okay", "managing")):
                symptom_bits.append("feeling okay")

        if qid == "symptoms_today":
            if any(k in ans for k in ("no new", "none", "nothing")):
                symptom_bits.append("no new symptoms")
            elif any(k in ans for k in ("pain", "discomfort")):
                symptom_bits.append("pain/discomfort")

        # Keep condition-specific raw answers for the doctor
        if qid not in {
            "general_feeling", "medication_adherence", "symptoms_today", "pain_scale",
            "temperature_check", "fatigue_level", "surgery_wound", "cardiac_incision",
            "wound_photo", "medication_reason",
        }:
            out["condition_specific"][qid] = record.get("answer", "").strip()

    out["checklist_ids_answered"] = list(dict.fromkeys(out["checklist_ids_answered"]))
    if symptom_bits:
        out["symptom_summary"] = "Patient reports: " + "; ".join(dict.fromkeys(symptom_bits)) + "."
    if out["pain_level"] is not None:
        out["symptom_severity_score"] = max(out["symptom_severity_score"], float(out["pain_level"]))
    return out


# ── Merge + compile ──────────────────────────────────────────────────────────

def merge_scribe_and_collected(
    scribe: Optional[Dict[str, Any]],
    collected: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Authoritative Scribe wins per scalar field; the Nurse's incremental collected
    fills gaps (including decline flags). Deep-merges condition_specific and
    union-merges checklist_ids_answered.
    """
    scribe_data  = dict(scribe or {})
    collected    = dict(collected or {})

    merged: Dict[str, Any] = {}
    # Scalars: scribe first, then collected fills gaps
    for key in SCRIBE_SCALAR_FIELDS:
        s_val = scribe_data.get(key)
        if s_val is not None and s_val != "":
            merged[key] = s_val
        elif collected.get(key) is not None:
            merged[key] = collected[key]
        else:
            merged[key] = s_val

    cs = dict(scribe_data.get("condition_specific") or {})
    for k, v in (collected.get("condition_specific") or {}).items():
        cs.setdefault(k, v)
    merged["condition_specific"] = cs

    answered = list(dict.fromkeys(
        list(scribe_data.get("checklist_ids_answered") or [])
        + list(collected.get("checklist_ids_answered") or [])
    ))
    merged["checklist_ids_answered"] = answered

    # Any extra collected keys not part of the schema are preserved for the doctor.
    for key, value in collected.items():
        if key not in merged:
            merged[key] = value

    return merged


def compile_merged_to_text(merged: Dict[str, Any], state: Optional[Dict[str, Any]] = None) -> str:
    """
    Human-readable paragraph from the merged canonical dict — used as the
    pipeline's raw_input (feeds report_agent RAG + doctor-facing content).
    """
    parts: List[str] = []
    m = merged or {}

    feeling = (m.get("symptom_summary") or "").strip()
    if feeling:
        parts.append(f"symptom summary: {feeling}")
    if m.get("fever_level") and m.get("fever_level") != "unknown":
        parts.append(f"fever: {m['fever_level']}")
    if m.get("fatigue_score") is not None:
        parts.append(f"fatigue: {m['fatigue_score']}/10")
    if m.get("medication_taken") is not None:
        parts.append(f"medication taken: {'yes' if m['medication_taken'] else 'no'}")
    if m.get("medication_time"):
        parts.append(f"medication time: {m['medication_time']}")
    if m.get("medication_reason"):
        parts.append(f"medication reason: {m['medication_reason']}")
    if m.get("pain_level") is not None:
        parts.append(f"pain: {m['pain_level']}/10")
    if m.get("pain_location"):
        parts.append(f"pain location: {m['pain_location']}")
    if m.get("wound_status"):
        parts.append(f"wound: {m['wound_status']}")
    if m.get("wound_photo_taken"):
        parts.append("wound photo provided")
    for key, value in (m.get("condition_specific") or {}).items():
        if value:
            parts.append(f"{key}: {value}")
    if m.get("notes"):
        parts.append(f"notes: {m['notes']}")

    return "; ".join(parts)