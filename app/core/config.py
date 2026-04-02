"""
app/core/config.py
------------------
Centralised configuration via pydantic-settings.
All values are read from environment variables or a .env file at project root.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/psicologia"

    # ── JWT ───────────────────────────────────────────────────────────────────
    jwt_secret_key: str                        # openssl rand -hex 32
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # ── Stripe ────────────────────────────────────────────────────────────────
    stripe_secret_key: str                     # sk_test_... or sk_live_...
    stripe_webhook_secret: str                 # whsec_...

    # ── Daily.co ─────────────────────────────────────────────────────────────
    daily_api_key: str                         # Developers → API Keys

    # ── Frontend redirect URLs ────────────────────────────────────────────────
    frontend_success_url: str = "https://app.example.com/booking/success"
    frontend_cancel_url: str = "https://app.example.com/booking/cancel"

    # ── Notifications (email / WhatsApp) ─────────────────────────────────────
    resend_api_key: str | None = None
    resend_from_email: str | None = None

    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str | None = None   # e.g. whatsapp:+14155238886

    # ── IA — Transcrição (Whisper local) ─────────────────────────────────────
    whisper_model: str = "small"               # tiny | small | medium | large-v3

    # ── IA — Resumo Clínico / Scribe (Ollama local — padrão) ─────────────────
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"             # llama3.2 (rápido, 2GB) | llama3.1:8b (melhor, 5GB)

    # ── IA — Claude Anthropic (opcional, fallback se Ollama indisponível) ─────
    anthropic_api_key: str | None = None

    # ── Langfuse (observabilidade de LLMs — opcional) ─────────────────────────
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "https://cloud.langfuse.com"

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"    # vírgula-separado em produção

    # ── Daily.co webhook ──────────────────────────────────────────────────────
    daily_webhook_hmac_secret: str | None = None   # Dashboard → Webhooks


settings = Settings()  # type: ignore[call-arg]
