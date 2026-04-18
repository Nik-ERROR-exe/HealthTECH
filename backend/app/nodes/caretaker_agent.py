"""
CARENETRA — Caretaker Conversation Agent (Hybrid)
Uses NVIDIA NIM LLM to understand patient context and select appropriate question templates.
All medical questions come from a vetted template library — no hallucination risk.
"""
import logging
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.models import PatientProfile, MedicalCourse, CheckIn, Medication
from app.agents.nvidia_client import llm_client, LLM_MODEL

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Template Library (Vetted, Safe Questions)
# ------------------------------------------------------------------

TEMPLATE_LIBRARY = {
    "pain_scale": {
        "question": "On a scale of zero to ten, where zero is no pain and ten is the worst pain imaginable, how much pain are you feeling at your surgical site right now?",
        "type": "pain_scale",
        "min": 0,
        "max": 10
    },
    "fever_check": {
        "question": "Do you have a thermometer handy? If so, what's your temperature right now? You can say 'I don't know' if you haven't checked.",
        "type": "temperature",
        "unit": "fahrenheit"
    },
    "wound_status": {
        "question": "Let's check your wound. Any new redness, swelling, warmth, or discharge from the incision area?",
        "type": "yes_no"
    },
    "wound_photo_prompt": {
        "question": "Would you like to take a photo of the wound for me to analyze? It helps the doctor see what's happening without you coming in.",
        "type": "photo_prompt"
    },
    "medication_adherence": {
        "question": "Have you taken all your prescribed medications today?",
        "type": "yes_no"
    },
    "energy_level": {
        "question": "How's your energy level compared to yesterday? Better, worse, or about the same?",
        "type": "mcq",
        "options": ["Better", "Worse", "About the same"]
    },
    "fatigue_scale": {
        "question": "On a scale of 1 to 10, where 1 is completely exhausted and 10 is full of energy, how tired do you feel?",
        "type": "pain_scale",
        "min": 1,
        "max": 10
    },
    "nausea_check": {
        "question": "Any nausea or vomiting since yesterday?",
        "type": "yes_no"
    },
    "appetite": {
        "question": "How is your appetite today?",
        "type": "mcq",
        "options": ["Normal", "Reduced", "No appetite"]
    },
    "mobility": {
        "question": "Have you been able to get up and move around a bit today, as your doctor recommended?",
        "type": "mcq",
        "options": ["Yes, I moved around", "A little, but it was hard", "Not really, too painful"]
    },
    "general_feeling": {
        "question": "How are you feeling overall today?",
        "type": "mcq",
        "options": ["Great", "Okay", "Not great", "Terrible"]
    },
    "new_symptoms": {
        "question": "Any new or concerning symptoms since we last spoke?",
        "type": "text"
    },
    "anything_else": {
        "question": "Is there anything else you'd like to tell me about how you're feeling today?",
        "type": "text"
    },
    "blood_glucose": {
        "question": "What was your most recent blood sugar reading? You can say the number and whether it was before or after a meal.",
        "type": "text"
    },
    "blood_pressure": {
        "question": "Have you checked your blood pressure today? If yes, what was the reading?",
        "type": "text"
    }
}


VALID_TEMPLATE_KEYS = set(TEMPLATE_LIBRARY.keys())


# ------------------------------------------------------------------
# NVIDIA LLM Context Analyzer (Strict Template Selection)
# ------------------------------------------------------------------

async def _analyze_context_with_llm(
    patient_name: str,
    condition: str,
    day: int,
    previous_answers: List[str],
    medications: List[str],
    patient_context: str = ""
) -> Dict[str, Any]:
    """
    Uses NVIDIA NIM to select relevant template keys from the library.
    The LLM MUST return only keys from the provided list — no free text.
    """
    template_keys_str = ", ".join(sorted(VALID_TEMPLATE_KEYS))

    # More detailed, conversational system prompt
    prompt = f"""You are CARA, a compassionate virtual health companion assisting a patient recovering from a medical procedure or managing a chronic condition.

Your task is to choose which safe, pre‑written health questions to ask next. You do NOT generate the questions yourself — you only pick their identifiers from a fixed list.

Patient information:
- Name (use exactly this name in your greeting, do not change it): {patient_name}
- Condition: {condition}
- Recovery day: {day}
- Medications prescribed: {", ".join(medications) if medications else "None"}
- What the patient said during their last check‑in: {"; ".join(previous_answers) if previous_answers else "This is the first check‑in of the day."}
- Doctor's notes about this specific patient: {patient_context if patient_context else "No additional context provided."}

Available question identifiers (you must choose only from this list):
{template_keys_str}

Based on the patient's condition, recovery day, and any recent answers, select 3 to 5 of the most clinically relevant question identifiers.

Then, write a warm, personal greeting that includes the patient's name exactly as provided above. For example: "Hello Sarah, how are you feeling this morning?" or "Good afternoon Michael, let's see how you're doing today."

Return ONLY a valid JSON object with this exact structure:
{{
  "selected_keys": ["key1", "key2", "key3"],
  "greeting": "Your actual greeting here, including the patient's name"
}}

Rules (very important):
- "selected_keys" must contain only identifiers from the list above. Do not invent new ones.
- "greeting" must be a genuine, friendly sentence. Do NOT write placeholder text like "A warm greeting". Actually greet the patient by name exactly as given.
- Do NOT include any markdown, explanation, or additional text. Only the JSON object."""

    try:
        response = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are CARA, a caring medical assistant. You output only valid JSON with keys from a predefined list and a natural greeting."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,  # slight warmth for natural language
            max_tokens=350
        )

        raw_json = response.choices[0].message.content.strip()

        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]
        raw_json = raw_json.strip()

        result = json.loads(raw_json)

        selected = result.get("selected_keys", [])
        valid_selected = [k for k in selected if k in VALID_TEMPLATE_KEYS]

        if len(valid_selected) < len(selected):
            logger.warning(f"[LLM] Filtered out invalid keys: {set(selected) - set(valid_selected)}")

        return {
            "selected_keys": valid_selected,
            "greeting": result.get("greeting")
        }

    except Exception as e:
        logger.error(f"[LLM] Failed: {e}")
        return {"selected_keys": [], "greeting": None}


# ------------------------------------------------------------------
# Hybrid Question Generator
# ------------------------------------------------------------------

async def generate_caretaker_questions(
    patient_id: str,
    course_id: str,
    db: Session
) -> List[Dict[str, Any]]:
    """Generates questions using hybrid approach with strict template enforcement."""
    course = db.query(MedicalCourse).filter(MedicalCourse.id == course_id).first()
    if not course:
        logger.warning(f"Course {course_id} not found, using fallback")
        return _rule_based_fallback(course=None, day=1, medications=[])

    patient = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    recovery_day = _calculate_recovery_day(course.start_date)

    last_checkin = db.query(CheckIn).filter(
        CheckIn.patient_id == patient_id,
        CheckIn.course_id == course_id
    ).order_by(CheckIn.created_at.desc()).first()
    previous_answers = [last_checkin.symptom_summary] if (last_checkin and last_checkin.symptom_summary) else []

    medications = db.query(Medication).filter(
        Medication.course_id == course_id,
        Medication.is_active == True
    ).all()
    med_names = [m.name for m in medications]

    patient_context = course.patient_context or ""

    llm_result = await _analyze_context_with_llm(
        patient_name=patient.user.full_name if patient else "Patient",
        condition=course.condition_type.value,
        day=recovery_day,
        previous_answers=previous_answers,
        medications=med_names,
        patient_context=patient_context
    )

    selected_keys = llm_result.get("selected_keys", [])
    if not selected_keys:
        logger.info("[Caretaker] LLM returned no valid keys, using rule-based fallback")
        return _rule_based_fallback(course, recovery_day, medications)

    questions = []

    greeting = llm_result.get("greeting")
    if greeting:
        questions.append({
            "id": "greeting",
            "question": greeting,
            "type": "greeting",
            "spoken_text": greeting
        })

    for key in selected_keys:
        q = TEMPLATE_LIBRARY[key].copy()
        q["id"] = f"{key}_{int(datetime.utcnow().timestamp())}"
        q["spoken_text"] = q["question"]
        questions.append(q)

    # Ensure medication adherence is asked if medications exist and not already selected
    if medications and "medication_adherence" not in selected_keys:
        med_q = TEMPLATE_LIBRARY["medication_adherence"].copy()
        med_q["id"] = f"medication_{int(datetime.utcnow().timestamp())}"
        med_names_str = ", ".join(med_names[:3])
        if len(med_names) > 3:
            med_names_str += " and others"
        med_q["question"] = f"Have you taken all your prescribed medications today? That includes {med_names_str}."
        med_q["spoken_text"] = med_q["question"]
        questions.append(med_q)

    # Always add an open-ended "anything else" question at the end
    if "anything_else" not in selected_keys:
        q = TEMPLATE_LIBRARY["anything_else"].copy()
        q["id"] = f"anything_else_{int(datetime.utcnow().timestamp())}"
        q["spoken_text"] = q["question"]
        questions.append(q)

    logger.info(f"[Caretaker] Generated {len(questions)} questions using keys: {selected_keys}")
    return questions


# ------------------------------------------------------------------
# Rule-Based Fallback (now uses 'question' field consistently)
# ------------------------------------------------------------------

def _rule_based_fallback(
    course: Optional[MedicalCourse],
    day: int,
    medications: List[Medication]
) -> List[Dict[str, Any]]:
    questions = []

    if course:
        cond = course.condition_type.value
        if "SURGERY" in cond or "TRANSPLANT" in cond:
            if day <= 10:
                questions.append(TEMPLATE_LIBRARY["pain_scale"].copy())
            if day <= 7:
                questions.append(TEMPLATE_LIBRARY["fever_check"].copy())
            if day <= 14:
                questions.append(TEMPLATE_LIBRARY["wound_status"].copy())
                questions.append(TEMPLATE_LIBRARY["wound_photo_prompt"].copy())
            if day > 3:
                questions.append(TEMPLATE_LIBRARY["energy_level"].copy())
            if day <= 5:
                questions.append(TEMPLATE_LIBRARY["nausea_check"].copy())
        elif "DIABETES" in cond:
            questions.append(TEMPLATE_LIBRARY["blood_glucose"].copy())
        elif "HYPERTENSION" in cond or "BLOOD_PRESSURE" in cond:
            questions.append(TEMPLATE_LIBRARY["blood_pressure"].copy())
        else:
            questions.append(TEMPLATE_LIBRARY["general_feeling"].copy())

    if medications:
        med_q = TEMPLATE_LIBRARY["medication_adherence"].copy()
        med_names = ", ".join([m.name for m in medications[:3]])
        if len(medications) > 3:
            med_names += " and others"
        med_q["question"] = f"Have you taken all your prescribed medications today? That includes {med_names}."
        med_q["spoken_text"] = med_q["question"]
        questions.append(med_q)

    if len(questions) < 3:
        questions.append(TEMPLATE_LIBRARY["new_symptoms"].copy())
    questions.append(TEMPLATE_LIBRARY["anything_else"].copy())

    for idx, q in enumerate(questions):
        q["id"] = f"fallback_q_{idx}_{int(datetime.utcnow().timestamp())}"
        q["spoken_text"] = q["question"]

    return questions


def _calculate_recovery_day(start_date_str: str) -> int:
    if not start_date_str:
        return 1
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        delta = datetime.utcnow().date() - start_date
        return max(1, delta.days + 1)
    except Exception:
        return 1