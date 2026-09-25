from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env always resolved relative to the backend/ folder (parent of app/),
# so the server can be started from any working directory.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    env: str = "development"

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    # Sessões vivem só no Redis (session_id opaco no cookie) — não há segredo
    # de assinatura para gerenciar aqui.
    session_cookie_name: str = "dayup_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    session_cookie_secure: bool = False

    csrf_cookie_name: str = "dayup_csrf"
    csrf_header_name: str = "X-CSRF-Token"

    frontend_origin: str = "http://localhost:5173"

    # Conta demo pública — protegida contra alteração/exclusão (ver routes/auth.py).
    demo_email: str = "demo@dayup.app"

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
