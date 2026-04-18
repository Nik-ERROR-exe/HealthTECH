"""
CARENETRA — Local LLM Client via Ollama
Replaces NVIDIA NIM cloud API with locally-running Ollama.

Ollama exposes a fully OpenAI-compatible API at localhost:11434.
Zero code changes needed in agents — only model names and base_url differ.

SETUP (run once before demo):
  1. Install Ollama: https://ollama.com/download
  2. Pull models:
       ollama pull llama3.2:1b        # text LLM — ~1.3 GB
       ollama pull moondream           # vision LLM — ~1.7 GB
  3. Ollama starts automatically. Verify: curl http://localhost:11434/api/tags

If your laptop has more RAM (8GB+), upgrade text model to llama3.2:3b for
better extraction quality. moondream is already the best small vision option.

Edge Bounty note: All inference runs on local hardware — no cloud API calls.
"""
from openai import AsyncOpenAI

# ── Ollama local endpoint ─────────────────────────────────────────
_OLLAMA_BASE = "http://localhost:11434/v1"

# Ollama doesn't use real API keys but the openai client requires a non-empty string
_DUMMY_KEY = "ollama"

# ── Text LLM client ───────────────────────────────────────────────
# Used by: symptom_agent, caretaker_agent
llm_client = AsyncOpenAI(
    base_url=_OLLAMA_BASE,
    api_key=_DUMMY_KEY,
)

# ── Vision LLM client ─────────────────────────────────────────────
# Used by: vision_agent
# Same client object — Ollama serves all models from one endpoint
vision_client = AsyncOpenAI(
    base_url=_OLLAMA_BASE,
    api_key=_DUMMY_KEY,
)

# ── Model names ───────────────────────────────────────────────────
LLM_MODEL    = "llama3.2:1b"    # swap to "llama3.2:3b" if you have ~4GB free RAM
VISION_MODEL = "moondream"      # smallest capable vision model, ~1.7 GB

# ── Model capability notes ────────────────────────────────────────
# llama3.2:1b   — fast, low RAM. Good for structured JSON extraction with
#                 clear prompts. Keep system prompts concise.
#
# llama3.2:3b   — 2x RAM but noticeably better reasoning and JSON compliance.
#                 Use if available.
#
# moondream     — built for image Q&A. Does not follow complex JSON schemas
#                 reliably. vision_agent uses a simplified prompt that extracts
#                 plain-text findings, then maps them to structured scores locally.