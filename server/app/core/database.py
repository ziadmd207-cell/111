from sqlmodel import SQLModel, create_engine, Session
import os
from .config import settings, get_database_url

# PostgreSQL only — no SQLite. Fail fast if the DB is unreachable
# so misconfiguration surfaces loudly instead of hiding in a local file.
database_url = os.getenv("DATABASE_URL", "")
if not database_url:
    database_url = get_database_url()

if database_url.startswith("sqlite"):
    raise RuntimeError(
        "SQLite is disabled: set DATABASE_URL to PostgreSQL "
        "(e.g. postgresql://zeus:zeus@localhost:5433/zeus)"
    )

engine = create_engine(database_url, echo=False)

def create_db_and_tables():
    # Import models to register tables before creating
    import app.models  # noqa
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
