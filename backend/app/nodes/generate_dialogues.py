import json
import random
import os
import sys

# Add current directory to path so we can import question_bank
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from question_bank import QUESTIONS, CONDITION_QUEUES, BRANCH_RULES, CONDITION_LABELS, GREETING_TEMPLATES

# ─────────────────────────────────────────────────────────────────────────────
# DIVERSIFICATION DATA
# ─────────────────────────────────────────────────────────────────────────────

NAMES = [
    "Sarah", "James", "Elena", "Marcus", "Priya", "Robert", "Linda", "David", "Jessica", "Michael",
    "Sophia", "Daniel", "Amara", "Kevin", "Fatima", "Chen", "Anita", "Thomas", "Gabriela", "Sam"
]

MEDS_BY_CONDITION = {
    "POST_KIDNEY_TRANSPLANT": [
        "Cyclosporine and Tacrolimus",
        "Tacrolimus and Prednisone",
        "Mycophenolate and CellCept",
        "Anti-rejection medications"
    ],
    "POST_CARDIAC_SURGERY": [
        "Aspirin and Metoprolol",
        "Warfarin and Statins",
        "Blood pressure meds and diuretics",
        "Cardiac support medications"
    ],
    "ASTHMA_RESPIRATORY": [
        "Albuterol and Fluticasone",
        "Montelukast and Advair",
        "Your rescue inhaler and steroids",
        "Inhaled corticosteroids"
    ],
    "DIABETES_MANAGEMENT": [
        "Metformin and Insulin",
        "Glipizide and Lantus",
        "Your daily insulin and glucose meds",
        "Oral hypoglycemics"
    ],
    "GENERAL_POST_SURGERY": [
        "Antibiotics and Tylenol",
        "Pain relievers and stool softeners",
        "Anti-inflammatories and probiotics",
        "Post-op medications"
    ],
    "DEFAULT": [
        "your prescribed medications",
        "your daily health supplements"
    ]
}

INSTRUCTION_PHRASES = [
    "Ask the patient if they {intent}.",
    "Check-in with {name} regarding {intent}.",
    "Follow up on {name}'s {intent}.",
    "As a caring nurse, ask {name} about {intent}.",
    "Verify {name}'s {intent} status."
]

# ─────────────────────────────────────────────────────────────────────────────
# GENERATION LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def format_text(text, name, meds, day, condition_label):
    return text.format(name=name, meds=meds, day=day, condition_label=condition_label)

def get_intent(qid):
    # Map qid to a natural language intent phrase
    intents = {
        "general_feeling": "overall well-being and health today",
        "medication_adherence": "medication adherence and if they've taken their pills",
        "symptoms_today": "any new or concerning symptoms encountered",
        "pain_or_discomfort": "recent mentions of feeling unwell and what's bothering them",
        "temperature_check": "body temperature and if they've measured it",
        "pain_scale": "pain intensity on a scale of 1 to 10",
        "fatigue_level": "current energy levels and fatigue",
        "medication_reason": "why they might have missed their doses",
        "kidney_urine_output": "urine output to monitor kidney function",
        "kidney_swelling": "any physical swelling in legs or face",
        "kidney_bp_symptoms": "headaches or vision changes related to blood pressure",
        "kidney_tenderness": "pain or tenderness near the transplant site",
        "cardiac_chest": "chest sensations or surgical area discomfort",
        "cardiac_pain_detail": "where exactly the chest pain is radiating to",
        "cardiac_breathing": "breathing quality and any shortness of breath",
        "asthma_breathing": "wheezing or breathlessness",
        "diabetes_blood_sugar": "latest blood sugar readings",
        "surgery_wound": "the visual appearance of the surgical incision",
        "wound_photo": "taking a photo of the wound for clinical review"
    }
    return intents.get(qid, qid.replace("_", " "))

def generate_examples():
    examples = []
    
    # We loop until we hit the target count
    target = 1000
    
    while len(examples) < target:
        for condition, queue in CONDITION_QUEUES.items():
            name = random.choice(NAMES)
            day = random.randint(1, 14)
            med_list = MEDS_BY_CONDITION.get(condition, MEDS_BY_CONDITION["DEFAULT"])
            meds = random.choice(med_list)
            cond_label = CONDITION_LABELS.get(condition, "post-op recovery")
            
            # Simulate a full session flow
            # The core 3 + condition queue
            full_queue = ["general_feeling", "medication_adherence", "symptoms_today"] + list(queue)
            history = set()
            
            for qid in full_queue:
                if qid in history: continue
                history.add(qid)
                
                q_def = QUESTIONS.get(qid)
                if not q_def: continue
                
                # 1. Base Question Sample
                q_text = format_text(q_def["question"], name, meds, day, cond_label)
                intent = get_intent(qid)
                
                # Instruction variety
                base_instr = f"You are CARA, a caring post-surgical nurse. Ask the patient how they are feeling overall today." if qid == "general_feeling" else \
                             f"You are CARA, a caring post-surgical nurse. Ask if they've taken their meds, specifically {meds}." if qid == "medication_adherence" else \
                             f"You are CARA, a caring post-surgical nurse. Ask about {intent}."
                
                examples.append({
                    "instruction": base_instr,
                    "input": "",
                    "output": q_text
                })
                
                # 2. Branching Follow-ups
                if qid in BRANCH_RULES:
                    for keywords, next_qs in BRANCH_RULES[qid]:
                        # Pick a trigger keyword
                        kw = random.choice(keywords)
                        for nqid in next_qs:
                            if nqid in history: continue
                            # We don't add to history here as we want to simulate follow-ups independently
                            
                            nq_def = QUESTIONS.get(nqid)
                            if not nq_def: continue
                            
                            nq_text = format_text(nq_def["question"], name, meds, day, cond_label)
                            n_intent = get_intent(nqid)
                            
                            instr = f"You are CARA, a caring post-surgical nurse. {name} just mentioned feeling '{kw}'. Ask about {n_intent}."
                            
                            examples.append({
                                "instruction": instr,
                                "input": "",
                                "output": nq_text
                            })
                            
                if len(examples) >= target: break
            if len(examples) >= target: break
            
    return examples[:target]

def save_jsonl(examples, filename):
    with open(filename, 'w', encoding='utf-8') as f:
        for ex in examples:
            f.write(json.dumps(ex) + '\n')

if __name__ == "__main__":
    print("Generating CARA dialogue dataset...")
    data = generate_examples()
    save_jsonl(data, "cara_dialogues.jsonl")
    print(f"Success! {len(data)} examples saved to cara_dialogues.jsonl")
