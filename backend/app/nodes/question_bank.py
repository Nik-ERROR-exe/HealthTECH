"""
CARENETRA — Question Bank
All check-in questions, MCQ options, and branching rules.
Fully offline. No LLM required.

Structure:
  QUESTIONS       — all question definitions keyed by question_id
  CONDITION_QUEUES — ordered list of question IDs per condition (after core 3)
  BRANCH_RULES    — (question_id, keyword) → list of question IDs to INSERT next

Questions use {name}, {meds}, {day}, {condition_label} as placeholders
that get filled in by caretaker_agent.py at render time.
"""

# ─────────────────────────────────────────────────────────────────────────────
# QUESTION DEFINITIONS
# Each entry:
#   id       — unique string key
#   question — text shown and spoken (supports {name}, {meds}, {day} placeholders)
#   type     — mcq | scale | text | photo | yesno
#   options  — list of 3 choices (always 3 for MCQ)
#   spoken   — shorter TTS version (optional, falls back to question)
# ─────────────────────────────────────────────────────────────────────────────

QUESTIONS = {

    # ── UNIVERSAL CORE ────────────────────────────────────────────────────────

    "general_feeling": {
        "id":       "general_feeling",
        "question": "How are you feeling overall today?",
        "spoken":   "How are you feeling today?",
        "type":     "mcq",
        "options":  ["Feeling good", "Okay, managing", "Not doing great"],
    },

    "medication_adherence": {
        "id":       "medication_adherence",
        "question": "Have you taken all your prescribed medications today — including {meds}?",
        "spoken":   "Did you take all your medications today, including {meds}?",
        "type":     "mcq",
        "options":  ["Yes, all taken", "Missed a dose", "Didn't take any"],
    },

    "symptoms_today": {
        "id":       "symptoms_today",
        "question": "Are you experiencing any new or unusual symptoms today?",
        "spoken":   "Any new symptoms or unusual feelings today?",
        "type":     "mcq",
        "options":  ["No new symptoms", "Feeling warm or feverish", "Pain or discomfort"],
    },

    # ── UNIVERSAL BRANCH FOLLOW-UPS ───────────────────────────────────────────

    "pain_or_discomfort": {
        "id":       "pain_or_discomfort",
        "question": "You mentioned you're not feeling great. Can you describe what's bothering you most?",
        "spoken":   "What's bothering you most right now?",
        "type":     "mcq",
        "options":  ["General weakness or fatigue", "Pain somewhere", "Nausea or dizziness"],
    },

    "temperature_check": {
        "id":       "temperature_check",
        "question": "You mentioned feeling warm. If you have a thermometer, what is your temperature reading?",
        "spoken":   "Can you check your temperature? What does it read?",
        "type":     "mcq",
        "options":  ["Normal — below 99°F / 37.2°C", "Low fever — 99–101°F / 37.2–38.3°C", "High fever — above 101°F / 38.3°C"],
    },

    "pain_scale": {
        "id":       "pain_scale",
        "question": "On a scale of 1 to 10, how would you rate the pain you're experiencing?",
        "spoken":   "How would you rate your pain right now?",
        "type":     "mcq",
        "options":  ["Mild — 1 to 3", "Moderate — 4 to 6", "Severe — 7 to 10"],
    },

    "fatigue_level": {
        "id":       "fatigue_level",
        "question": "How would you describe your energy and fatigue levels today?",
        "spoken":   "How is your energy level today?",
        "type":     "mcq",
        "options":  ["Mildly tired, manageable", "Very fatigued, hard to focus", "Exhausted, difficult to move"],
    },

    "medication_reason": {
        "id":       "medication_reason",
        "question": "I noticed you missed your medication. Can you tell me the reason?",
        "spoken":   "What was the reason you missed your medication?",
        "type":     "mcq",
        "options":  ["Forgot to take it", "Side effects or discomfort", "Ran out of medication"],
    },

    # ── POST KIDNEY TRANSPLANT ────────────────────────────────────────────────

    "kidney_urine_output": {
        "id":       "kidney_urine_output",
        "question": "An important check after kidney transplant — how has your urine output been today compared to usual?",
        "spoken":   "How has your urine output been today?",
        "type":     "mcq",
        "options":  ["Normal amount", "Less than usual", "Very little or none"],
    },

    "kidney_swelling": {
        "id":       "kidney_swelling",
        "question": "Do you notice any swelling in your legs, ankles, feet, or face today?",
        "spoken":   "Any swelling in your legs, ankles, or face?",
        "type":     "mcq",
        "options":  ["No swelling", "Mild swelling", "Significant swelling"],
    },

    "kidney_bp_symptoms": {
        "id":       "kidney_bp_symptoms",
        "question": "Are you experiencing any headache, blurred vision, or persistent dizziness today?",
        "spoken":   "Any headache, blurred vision, or dizziness?",
        "type":     "mcq",
        "options":  ["None of these", "Mild headache only", "Yes, noticeable symptoms"],
    },

    "kidney_tenderness": {
        "id":       "kidney_tenderness",
        "question": "Is there any tenderness, pain, or unusual sensation around your transplant site or lower back area?",
        "spoken":   "Any pain or tenderness around the transplant site?",
        "type":     "mcq",
        "options":  ["No tenderness", "Mild soreness", "Noticeable pain"],
    },

    "kidney_fever_followup": {
        "id":       "kidney_fever_followup",
        "question": "For kidney transplant patients, fever is an important warning sign. Have you had any chills, sweating, or felt feverish in the last 24 hours?",
        "spoken":   "Any fever, chills, or sweating in the last 24 hours?",
        "type":     "mcq",
        "options":  ["No, none of that", "Mild chills earlier", "Yes, persistent fever or chills"],
    },

    # ── POST CARDIAC SURGERY ──────────────────────────────────────────────────

    "cardiac_chest": {
        "id":       "cardiac_chest",
        "question": "How does your chest feel today? Any sensation at or around the surgical area?",
        "spoken":   "How does your chest feel today?",
        "type":     "mcq",
        "options":  ["Normal, no issues", "Some tightness or pressure", "Pain or significant discomfort"],
    },

    "cardiac_pain_detail": {
        "id":       "cardiac_pain_detail",
        "question": "You mentioned chest pain or tightness. Does it spread to your arm, jaw, or back, or is it localized at the incision?",
        "spoken":   "Does the chest pain spread anywhere?",
        "type":     "mcq",
        "options":  ["Only at the incision site", "Radiating to arm or jaw", "Spreading to back"],
    },

    "cardiac_breathing": {
        "id":       "cardiac_breathing",
        "question": "How is your breathing today? Any shortness of breath at rest or with light activity?",
        "spoken":   "How is your breathing today?",
        "type":     "mcq",
        "options":  ["Breathing normally", "Slightly short of breath", "Significant difficulty breathing"],
    },

    "breathing_detail": {
        "id":       "breathing_detail",
        "question": "You mentioned breathing difficulty. Are you able to speak full sentences comfortably, or is it very laboured?",
        "spoken":   "Can you speak full sentences comfortably?",
        "type":     "mcq",
        "options":  ["Yes, speaking normally", "Short sentences only", "Very difficult to speak"],
    },

    "cardiac_incision": {
        "id":       "cardiac_incision",
        "question": "How does your surgical incision look and feel today?",
        "spoken":   "How does the surgical incision look today?",
        "type":     "mcq",
        "options":  ["Healing well, looks clean", "Some redness or mild soreness", "Concerning — discharge or significant redness"],
    },

    "cardiac_heart_rate": {
        "id":       "cardiac_heart_rate",
        "question": "Have you noticed any irregular heartbeat, palpitations, or racing heart today?",
        "spoken":   "Any irregular heartbeat or palpitations?",
        "type":     "mcq",
        "options":  ["No, heartbeat feels normal", "Occasional flutter", "Yes, persistent or racing"],
    },

    "cardiac_fluid": {
        "id":       "cardiac_fluid",
        "question": "Have you gained more than 2 pounds in the last 2 days, or noticed your shoes feeling tighter than usual?",
        "spoken":   "Any sudden weight gain or tighter shoes lately?",
        "type":     "mcq",
        "options":  ["No noticeable change", "Maybe slight change", "Yes, noticeable difference"],
    },

    # ── ASTHMA / RESPIRATORY ──────────────────────────────────────────────────

    "asthma_breathing": {
        "id":       "asthma_breathing",
        "question": "How is your breathing today? Any wheezing, tightness, or shortness of breath?",
        "spoken":   "How is your breathing today?",
        "type":     "mcq",
        "options":  ["Breathing clearly", "Some wheezing or tightness", "Significant difficulty breathing"],
    },

    "asthma_severity": {
        "id":       "asthma_severity",
        "question": "You mentioned breathing difficulty. Does it happen at rest, only with activity, or constantly?",
        "spoken":   "When does the breathing difficulty happen?",
        "type":     "mcq",
        "options":  ["Only during activity", "At rest and activity", "Constant difficulty"],
    },

    "asthma_inhaler": {
        "id":       "asthma_inhaler",
        "question": "Have you needed to use your rescue inhaler today?",
        "spoken":   "Did you use your rescue inhaler today?",
        "type":     "mcq",
        "options":  ["No, not needed", "Used it once", "Used it multiple times"],
    },

    "asthma_escalation": {
        "id":       "asthma_escalation",
        "question": "You used your inhaler multiple times today. Did it provide relief after each use?",
        "spoken":   "Did your inhaler provide relief?",
        "type":     "mcq",
        "options":  ["Yes, full relief each time", "Partial relief only", "Very little relief"],
    },

    "asthma_triggers": {
        "id":       "asthma_triggers",
        "question": "Have you been exposed to any asthma triggers today, such as dust, smoke, strong smells, cold air, or pets?",
        "spoken":   "Any asthma triggers today?",
        "type":     "mcq",
        "options":  ["No triggers encountered", "Possible mild exposure", "Yes, clear exposure"],
    },

    "asthma_sleep": {
        "id":       "asthma_sleep",
        "question": "Did any breathing symptoms wake you up last night or disturb your sleep?",
        "spoken":   "Did breathing issues wake you at night?",
        "type":     "mcq",
        "options":  ["No, slept well", "Mild disturbance", "Yes, significantly disturbed"],
    },

    # ── DIABETES MANAGEMENT ───────────────────────────────────────────────────

    "diabetes_blood_sugar": {
        "id":       "diabetes_blood_sugar",
        "question": "Have you checked your blood sugar today? If so, how was the reading?",
        "spoken":   "Have you checked your blood sugar today?",
        "type":     "mcq",
        "options":  ["Yes — within normal range", "Yes — reading was high or low", "Not checked yet today"],
    },

    "diabetes_reading_value": {
        "id":       "diabetes_reading_value",
        "question": "You mentioned your blood sugar was out of range. Was it running high (hyperglycemia) or low (hypoglycemia)?",
        "spoken":   "Was your blood sugar high or low?",
        "type":     "mcq",
        "options":  ["High — above target range", "Low — below target range", "Fluctuating up and down"],
    },

    "diabetes_hypo_symptoms": {
        "id":       "diabetes_hypo_symptoms",
        "question": "Low blood sugar can be dangerous. Are you experiencing shakiness, sweating, confusion, or weakness right now?",
        "spoken":   "Are you feeling shaky, sweaty, or confused right now?",
        "type":     "mcq",
        "options":  ["No, feeling okay now", "Mild shakiness or sweat", "Yes, feeling quite unwell"],
    },

    "diabetes_diet": {
        "id":       "diabetes_diet",
        "question": "How has your diet been today? Are you following your meal plan?",
        "spoken":   "How has your diet been today?",
        "type":     "mcq",
        "options":  ["Following meal plan", "Some small deviations", "Significantly off plan today"],
    },

    "diabetes_dizziness": {
        "id":       "diabetes_dizziness",
        "question": "Any dizziness, blurred vision, excessive thirst, or frequent urination today?",
        "spoken":   "Any dizziness, blurred vision, or unusual thirst?",
        "type":     "mcq",
        "options":  ["None of those", "Mild symptoms", "Noticeable symptoms present"],
    },

    "diabetes_insulin": {
        "id":       "diabetes_insulin",
        "question": "Have you taken your insulin or diabetes medication at the correct time and dose today?",
        "spoken":   "Did you take your insulin or diabetes medication correctly?",
        "type":     "mcq",
        "options":  ["Yes, correct dose on time", "Delayed but took it", "Missed the dose"],
    },

    "diabetes_feet": {
        "id":       "diabetes_feet",
        "question": "Any numbness, tingling, cuts, or sores on your feet that you've noticed today?",
        "spoken":   "Any issues with your feet — numbness, sores, or tingling?",
        "type":     "mcq",
        "options":  ["No issues", "Mild tingling", "Noticeable concern"],
    },

    # ── GENERAL POST SURGERY ──────────────────────────────────────────────────

    "surgery_wound": {
        "id":       "surgery_wound",
        "question": "How does your surgical wound look today? Any changes in colour, swelling, or discharge?",
        "spoken":   "How does the surgical wound look today?",
        "type":     "mcq",
        "options":  ["Clean and healing well", "Some redness or mild swelling", "Concerning — discharge or significant change"],
    },

    "surgery_pain": {
        "id":       "surgery_pain",
        "question": "How is the pain at your surgical site today compared to yesterday?",
        "spoken":   "How is the pain at the surgical site today?",
        "type":     "mcq",
        "options":  ["Better than yesterday", "About the same", "Worse than yesterday"],
    },

    "surgery_movement": {
        "id":       "surgery_movement",
        "question": "How is your movement and activity today? Are you able to do light tasks?",
        "spoken":   "How is your movement and mobility today?",
        "type":     "mcq",
        "options":  ["Moving fairly normally", "Some limitation but managing", "Very restricted movement"],
    },

    "surgery_nausea": {
        "id":       "surgery_nausea",
        "question": "Any nausea, vomiting, or loss of appetite today?",
        "spoken":   "Any nausea or vomiting today?",
        "type":     "mcq",
        "options":  ["No, appetite is normal", "Mild nausea", "Vomiting or no appetite"],
    },

    "surgery_drain": {
        "id":       "surgery_drain",
        "question": "If you have a surgical drain, how does it look? Any unusual colour, amount, or odour?",
        "spoken":   "Any changes with your surgical drain?",
        "type":     "mcq",
        "options":  ["Normal or no drain", "Slight increase in output", "Unusual colour or odour"],
    },

    # ── WOUND PHOTO ───────────────────────────────────────────────────────────

    "wound_photo": {
        "id":       "wound_photo",
        "question": "One last thing — could you take a quick photo of your wound or surgical site? It helps me monitor your healing closely.",
        "spoken":   "Can you take a quick photo of your wound for me?",
        "type":     "photo",
        "options":  [],
    },

}


# ─────────────────────────────────────────────────────────────────────────────
# CONDITION QUEUES
# These question IDs are added AFTER the 3 universal core questions.
# Conditions match ConditionType enum values in models.py
# ─────────────────────────────────────────────────────────────────────────────

CONDITION_QUEUES = {
    "POST_KIDNEY_TRANSPLANT": [
        "kidney_urine_output",
        "kidney_swelling",
        "kidney_bp_symptoms",
        "kidney_tenderness",
        "kidney_fever_followup",
        "wound_photo",
    ],
    "POST_CARDIAC_SURGERY": [
        "cardiac_chest",
        "cardiac_breathing",
        "cardiac_incision",
        "cardiac_heart_rate",
        "cardiac_fluid",
        "wound_photo",
    ],
    "ASTHMA_RESPIRATORY": [
        "asthma_breathing",
        "asthma_inhaler",
        "asthma_triggers",
        "asthma_sleep",
    ],
    "DIABETES_MANAGEMENT": [
        "diabetes_blood_sugar",
        "diabetes_diet",
        "diabetes_dizziness",
        "diabetes_insulin",
        "diabetes_feet",
    ],
    "GENERAL_POST_SURGERY": [
        "surgery_wound",
        "surgery_pain",
        "surgery_movement",
        "surgery_nausea",
        "wound_photo",
    ],
}

# Default if condition not found
CONDITION_QUEUES["DEFAULT"] = [
    "surgery_wound",
    "surgery_pain",
    "surgery_movement",
    "wound_photo",
]


# ─────────────────────────────────────────────────────────────────────────────
# BRANCH RULES
# Format: {question_id: [(keyword_list, questions_to_insert), ...]}
# When the patient's answer contains ANY keyword in the list,
# the listed question IDs are inserted at the FRONT of the remaining queue.
# Questions already answered or already in queue are skipped.
# ─────────────────────────────────────────────────────────────────────────────

BRANCH_RULES = {

    "general_feeling": [
        (["not doing great", "struggling", "not great"], ["pain_or_discomfort"]),
    ],

    "medication_adherence": [
        (["missed", "didn't", "didn't take", "no"], ["medication_reason"]),
    ],

    "symptoms_today": [
        (["warm", "fever", "feverish"],               ["temperature_check"]),
        (["pain", "discomfort", "hurt", "hurting"],   ["pain_scale"]),
        (["tired", "fatigue", "exhausted", "weak"],   ["fatigue_level"]),
    ],

    "pain_or_discomfort": [
        (["pain", "somewhere"],                       ["pain_scale"]),
        (["nausea", "dizz"],                          ["surgery_nausea"]),
        (["fatigue", "weak"],                         ["fatigue_level"]),
    ],

    "temperature_check": [
        (["high fever", "above 101"],                 []),   # Just flag — no extra Q, risk score handles it
        (["low fever", "99", "100"],                  []),
    ],

    "kidney_urine_output": [
        (["very little", "none", "less than"],        ["kidney_fever_followup"]),
    ],

    "cardiac_chest": [
        (["pain", "tightness", "pressure"],           ["cardiac_pain_detail"]),
    ],

    "cardiac_breathing": [
        (["significant", "difficulty", "laboured"],   ["breathing_detail"]),
    ],

    "cardiac_incision": [
        (["concerning", "discharge", "redness"],      ["wound_photo"]),
    ],

    "asthma_breathing": [
        (["significant", "difficulty"],               ["asthma_severity"]),
    ],

    "asthma_inhaler": [
        (["multiple times"],                          ["asthma_escalation"]),
    ],

    "diabetes_blood_sugar": [
        (["high", "low", "out of range"],             ["diabetes_reading_value"]),
    ],

    "diabetes_reading_value": [
        (["low", "below"],                            ["diabetes_hypo_symptoms"]),
    ],

    "surgery_wound": [
        (["concerning", "discharge", "redness"],      ["wound_photo"]),
    ],

}


# ─────────────────────────────────────────────────────────────────────────────
# CONDITION LABELS  (human-readable for greeting)
# ─────────────────────────────────────────────────────────────────────────────

CONDITION_LABELS = {
    "POST_KIDNEY_TRANSPLANT": "kidney transplant recovery",
    "POST_CARDIAC_SURGERY":   "cardiac surgery recovery",
    "ASTHMA_RESPIRATORY":     "respiratory condition management",
    "DIABETES_MANAGEMENT":    "diabetes management",
    "GENERAL_POST_SURGERY":   "post-surgery recovery",
}


# ─────────────────────────────────────────────────────────────────────────────
# GREETING TEMPLATES  (rotated by day number mod len)
# ─────────────────────────────────────────────────────────────────────────────

GREETING_TEMPLATES = [
    "Hi {name}! I'm CARA, your health companion. Let's do your Day {day} check-in.",
    "Hello {name}! Ready for your daily check-in? Day {day} of your {condition_label}.",
    "Good to see you, {name}! It's Day {day} — let's see how you're doing today.",
    "Hi {name}! Day {day} check-in time. Let's make sure everything is on track.",
    "Hello {name}! I'm here for your daily health check. Day {day} — let's get started.",
]