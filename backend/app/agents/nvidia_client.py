"""
CARENETRA — LLM Client via NVIDIA NIM (free tier)
OpenAI-compatible cloud endpoint at NVIDIA_BASE_URL. No local install needed.

The NIM endpoint is metered on a free-tier allowance, so every agent keeps a
local/static fallback path — never make an LLM call fatal.

Used by: symptom_agent, adaptive_questions, report_agent, vision advice.
"""
from openai import AsyncOpenAI

from app.config import settings

# ── Text LLM client (NVIDIA NIM) ────────────────────────────────────
llm_client = AsyncOpenAI(
    base_url=settings.NVIDIA_BASE_URL,
    api_key=settings.NVIDIA_API_KEY,
)

# Model name for chat completion (override via LLM_MODEL in .env).
LLM_MODEL = settings.LLM_MODEL

# ── Model capability note ───────────────────────────────────────────
# meta/llama-3.1-8b-instruct — good at structured JSON extraction and
# adaptive follow-up question generation with clear prompts.
