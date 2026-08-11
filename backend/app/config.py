from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Full connection URL from .env (e.g. Neon/Render: "postgresql://user:pass@host/db?sslmode=require").
    # Preferred source — takes precedence over the legacy DB_* fields below.
    DATABASE_URL: str = ""

    # Legacy individual fields — used ONLY when DATABASE_URL is empty.
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_HOST: str = ""
    DB_PORT: str = "5432"
    DB_NAME: str = ""

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"

    # ── Text LLM (NVIDIA NIM free tier; OpenAI-compatible) ──────────
    LLM_MODEL: str = "meta/llama-3.1-8b-instruct"
    LLM_TEMPERATURE: float = 0.2
    LLM_MAX_TOKENS: int = 512

    # ── Vision VLM (NVIDIA multimodal — wound image classification) ────
    # Primary engine replaces Hugging Face. VISION_BASE_URL empty → NVIDIA_BASE_URL
    # (integrate.api.nvidia.com) then auto-retries ai.api.nvidia.com/v1 before OpenCV.
    VISION_LLM_MODEL: str = "meta/llama-3.2-11b-vision-instruct"
    VISION_FALLBACK_MODEL: str = "nvidia/neva-22b"   # documented fallback model name
    VISION_BASE_URL: str = ""                        # optional override

    # ── Embeddings (NVIDIA NIM /v1/embeddings) ──────────────────────
    EMBEDDING_MODEL: str = "nvidia/nv-embed-v1"
    EMBEDDING_DIM: int = 4096
    EMBEDDING_BATCH: int = 16

    # ── Hugging Face (free inference API for wound image analysis) ──
    HUGGINGFACE_API_KEY: str = ""

    # ── Qdrant (local mode — free, no server required) ──────────────
    QDRANT_PATH: str = "data/qdrant"
    QDRANT_COLLECTION: str = "carenetra_knowledge"

    # ── Qdrant Cloud (optional — e.g. the Care-Netra cluster) ───────
    # When QDRANT_URL + QDRANT_API_KEY are both set, the RAG stack
    # reads/writes the cloud collection instead of the local directory.
    # Unset → local mode (free, offline-capable) is used.
    QDRANT_URL: str = ""
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION_NAME: str = ""   # optional override; falls back to QDRANT_COLLECTION

    # ── Knowledge base / RAG ────────────────────────────────────────
    KNOWLEDGE_DIR: str = "knowledge"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 5
    MEDQUAD_ROOT: str = ""   # optional; default <backend>/data/MedQuAD-master in the script

    BREVO_API_KEY: str = ""
    SENDER_EMAIL: str = "alerts@carenetra.ai"
    SENDER_NAME: str = "CARENETRA"

    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""

    # Hackathon demo override: when set, EMERGENCY (and RED) escalation SMS/email
    # go to the presenter's phone/email instead of the patient's real emergency
    # contact — so the live demo rings on the presenter's device, not a real
    # dispatch center. Leave empty to fall back to the patient's emergency contact.
    DEMO_EMERGENCY_PHONE_NUMBER: str = ""
    DEMO_EMERGENCY_EMAIL: str = ""

    FRONTEND_URL: str = "http://localhost:5173"
    DEBUG: bool = True

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def use_cloud_qdrant(self) -> bool:
        """True when Qdrant Cloud credentials are configured."""
        return bool(self.QDRANT_URL and self.QDRANT_API_KEY)

    @property
    def qdrant_collection_name(self) -> str:
        """Collection name used by the RAG stack (QDRANT_COLLECTION_NAME wins)."""
        return self.QDRANT_COLLECTION_NAME or self.QDRANT_COLLECTION

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
