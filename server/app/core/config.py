from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "ZEUS API"
    # Database: PostgreSQL is primary. SQLite fallback only if enabled and Postgres unavailable
    database_url: str = "postgresql://zeus:zeus@localhost:5433/zeus"
    use_sqlite_fallback: bool = False
    sqlite_url: str = "sqlite:///./zeus.db"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    uploads_dir: str = "./uploads"
    # Auth token signing (set a long random value in .env for production)
    secret_key: str = "zeus-dev-secret-change-me"
    # YouTube Data API v3 (video search + view/like stats for quality ranking)
    youtube_api_key: str = ""
    # First admin account (seeded on startup; password always synced from env)
    admin_email: str = ""
    admin_password: str = ""
    # Google OAuth (login/signup via Google)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

def get_database_url() -> str:
    # If DATABASE_URL env is set explicitly, use it; otherwise try settings
    import os
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")
    # If openai key missing and no postgres available, sqlite fallback is easiest
    if settings.use_sqlite_fallback and not settings.database_url.startswith("postgresql"):
        return settings.database_url
    # Try postgres, fallback to sqlite if connection fails at runtime (handled in db.py)
    return settings.database_url
