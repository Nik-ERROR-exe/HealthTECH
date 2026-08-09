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

    BREVO_API_KEY: str = ""
    SENDER_EMAIL: str = "alerts@carenetra.ai"
    SENDER_NAME: str = "CARENETRA"

    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""

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

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
