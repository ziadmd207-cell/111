from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from sqlalchemy import text
from .core.config import settings
from .core.database import create_db_and_tables, engine
from .routers import crud, functions, upload, media, auth, admin, subscriptions, google_auth, support
from fastapi.responses import JSONResponse, FileResponse
from fastapi import Request
from starlette.exceptions import HTTPException as StarletteHTTPException

# Increment this when adding a schema migration so only one worker applies it.
SCHEMA_VERSION = 8

app = FastAPI(title=settings.app_name, version="1.0.0")

# CORS - explicit trusted origins only (never "*" with credentials).
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
origins += ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
origins = sorted(set(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; media-src 'self' blob: https:; "
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com; "
        "connect-src 'self' https:; frame-ancestors 'self'"
    )
    if request.url.scheme == "https":
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp

@app.on_event("startup")
def on_startup():
    # Uvicorn workers start independently. Serialize all database bootstrap
    # work on one PostgreSQL connection so schema DDL and seed inserts cannot race.
    lock_namespace = 1514486099
    lock_id = 1
    with engine.connect() as lock_connection:
        lock_connection.execute(
            text("SELECT pg_advisory_lock(:namespace, :lock_id)"),
            {"namespace": lock_namespace, "lock_id": lock_id},
        )
        lock_connection.commit()
        try:
            lock_connection.execute(text(
                "CREATE TABLE IF NOT EXISTS zeus_schema_version "
                "(singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton), version INTEGER NOT NULL)"
            ))
            lock_connection.commit()
            current_version = lock_connection.execute(
                text("SELECT version FROM zeus_schema_version WHERE singleton = TRUE")
            ).scalar_one_or_none()
            lock_connection.commit()

            if current_version is not None and current_version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"Database schema version {current_version} is newer than supported version {SCHEMA_VERSION}"
                )
            if current_version is None or current_version < SCHEMA_VERSION:
                create_db_and_tables()
                _migrate_database()
                lock_connection.execute(
                    text(
                        "INSERT INTO zeus_schema_version (singleton, version) VALUES (TRUE, :version) "
                        "ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version"
                    ),
                    {"version": SCHEMA_VERSION},
                )
                lock_connection.commit()

            _seed_admin()
            _seed_settings()
        finally:
            lock_connection.rollback()
            lock_connection.execute(
                text("SELECT pg_advisory_unlock(:namespace, :lock_id)"),
                {"namespace": lock_namespace, "lock_id": lock_id},
            )
            lock_connection.commit()
    os.makedirs("uploads", exist_ok=True)
    # Also ensure server/uploads
    os.makedirs(os.path.join(os.path.dirname(__file__), "../../uploads"), exist_ok=True)

def _migrate_database():
    """Apply data-preserving SQL migrations before advancing SCHEMA_VERSION."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'user'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT 'none'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMP"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires TIMESTAMP"))
        conn.execute(text("ALTER TABLE learning_profiles ADD COLUMN IF NOT EXISTS obstacles JSON"))
        conn.execute(text("ALTER TABLE learning_profiles ADD COLUMN IF NOT EXISTS video_length_preference VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS facebook_url VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS instagram_url VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS tiktok_url VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS whatsapp_url VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS subscription_contact_email VARCHAR DEFAULT 'zeus.eduai@gmail.com'"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS starter_description JSON"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS starter_features JSON"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pro_description JSON"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pro_features JSON"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS prime_description JSON"))
        conn.execute(text("ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS prime_features JSON"))
        conn.execute(text("""
            UPDATE admin_settings
            SET facebook_url = COALESCE(NULLIF(facebook_url, ''), 'https://www.facebook.com/profile.php?id=61593983652683&mibextid=ZbWKwL'),
                tiktok_url = COALESCE(NULLIF(tiktok_url, ''), 'https://www.tiktok.com/@zeusplatform?_r=1&_t=ZS-99ag6R9rlsu'),
                instagram_url = COALESCE(NULLIF(instagram_url, ''), 'https://www.instagram.com/zeus.eduplatform/'),
                linkedin_url = COALESCE(NULLIF(linkedin_url, ''), 'https://www.linkedin.com/company/zeus_eduu')
            WHERE id = 'default'
        """))
        conn.execute(text("ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS attachments JSON NOT NULL DEFAULT '[]'"))
        conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lesson_id VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR"))
        conn.execute(text("ALTER TABLE admin_settings DROP COLUMN IF EXISTS deepseek_api_key"))
        conn.execute(text("ALTER TABLE admin_settings DROP COLUMN IF EXISTS deepseek_model"))
        conn.execute(text("ALTER TABLE admin_settings DROP COLUMN IF EXISTS hf_token"))
        conn.execute(text("ALTER TABLE admin_settings DROP COLUMN IF EXISTS hf_model"))
        conn.execute(text(
            "UPDATE admin_settings SET gemini_model = 'gemini-2.5-flash' "
            "WHERE gemini_model IN ('gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash')"
        ))
        conn.execute(text("UPDATE users SET role='user' WHERE role IS NULL"))
        conn.execute(text("UPDATE users SET status='active' WHERE status IS NULL OR status=''"))
        conn.execute(text("UPDATE users SET subscription_status='none' WHERE subscription_status IS NULL"))

def _seed_settings():
    """Seed default settings from environment if not present in DB."""
    from sqlmodel import Session
    from .models import AdminSetting
    with Session(engine) as session:
        s = session.get(AdminSetting, "default")
        if not s:
            s = AdminSetting(
                id="default",
                starter_price=99.0,
                pro_price=199.0,
                prime_price=399.0,
                currency="EGP",
                gemini_api_key=os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "") or settings.gemini_api_key,
                gemini_model=os.getenv("GEMINI_MODEL", "") or settings.gemini_model,
                openai_api_key=os.getenv("OPENAI_API_KEY", "") or settings.openai_api_key,
                openai_model="gpt-4o-mini",
                youtube_api_key=os.getenv("YOUTUBE_API_KEY", "") or settings.youtube_api_key,
                active_ai_provider="auto",
            )
            session.add(s)
            session.commit()



def _seed_admin():
    """Create/promote the admin account from ADMIN_EMAIL/ADMIN_PASSWORD env."""
    from sqlmodel import Session, select
    from .models import User
    from .core.security import hash_password
    email = (settings.admin_email or "").strip().lower()
    password = settings.admin_password or ""
    if not email or not password:
        return
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            user = User(email=email, password_hash=hash_password(password), full_name="ZEUS Admin", role="admin", status="active")
            session.add(user)
        else:
            user.role = "admin"
            user.status = "active"
            user.password_hash = hash_password(password)
            session.add(user)
        session.commit()
        print(f"admin account ready: {email}")


# Health
@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}

@app.get("/api/health")
def api_health():
    return {"status": "ok"}

# Mount uploads static
uploads_path = os.path.join(os.path.dirname(__file__), "../../uploads")
if os.path.exists(uploads_path):
    app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")
else:
    os.makedirs(uploads_path, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")

@app.exception_handler(Exception)
async def friendly_handler(request: Request, exc: Exception):
    # Let HTTP exceptions (404 etc.) pass through for SPA fallback
    if isinstance(exc, StarletteHTTPException):
        raise exc
    print(f"Unhandled: {exc}")
    return JSONResponse(status_code=500, content={"reply": "حصل خطأ صغير، جرّب تاني 🙏", "error": "temporary", "retry": True, "toast": "حدث خطأ صغير"})

# Routers: CRUD for all entities
app.include_router(crud.router, prefix="/api/entities", tags=["entities"])
app.include_router(functions.router, prefix="/api/functions", tags=["functions"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(google_auth.router, prefix="/api/auth", tags=["google-auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(subscriptions.router, prefix="/subscriptions", tags=["subscriptions"])
app.include_router(subscriptions.router, prefix="/api/subscription", tags=["subscriptions"])
app.include_router(upload.router, prefix="/api", tags=["upload"])

app.include_router(media.router, prefix="/api", tags=["media"])
app.include_router(support.router, prefix="/api/support", tags=["support"])

# Serve Zeus frontend (Vite build) directly on http://127.0.0.1:8000/
DIST_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
# Fallback: if running from server/ as cwd with app.main, try ./../dist too
if not os.path.isdir(DIST_DIR):
    alt = os.path.normpath(os.path.join(os.getcwd(), "..", "dist"))
    if os.path.isdir(alt):
        DIST_DIR = alt
if os.path.isdir(DIST_DIR):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_root():
        index = os.path.join(DIST_DIR, "index.html")
        # Never cache the entry HTML: otherwise browsers keep booting a stale
        # JS bundle after each deploy (blank/looping pages).
        return FileResponse(index, headers={"Cache-Control": "no-store"})

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Leave API/docs/health/uploads to their own handlers
        if full_path.startswith(("api/", "docs", "openapi.json", "redoc", "health", "uploads", "assets/")):
            raise StarletteHTTPException(status_code=404, detail="Not found")
        candidate = os.path.normpath(os.path.join(DIST_DIR, full_path))
        # Prevent path traversal + serve real files (favicon, manifest...)
        if candidate.startswith(DIST_DIR) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(DIST_DIR, "index.html"), headers={"Cache-Control": "no-store"})
else:
    print(f"WARNING: frontend dist not found at {DIST_DIR} - only API will be served")
