from datetime import datetime

from sqlmodel import Field, SQLModel


class GoogleOAuthState(SQLModel, table=True):
    __tablename__ = "google_oauth_states"

    nonce: str = Field(primary_key=True)
    browser_hash: str
    expires_at: datetime = Field(index=True)
    created_date: datetime = Field(default_factory=datetime.utcnow)
