from typing import Optional
from sqlmodel import SQLModel, Field
import uuid
from datetime import datetime


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str = Field(default="")
    full_name: Optional[str] = None
    role: str = Field(default="user", index=True)
    # Activation gate: "active", "pending", "suspended"
    status: str = Field(default="active", index=True)
    
    # Subscription tier management: "STARTER", "PRO", "PRIME", or None
    subscription_plan: Optional[str] = Field(default=None, index=True)
    # "none", "active", "expired"
    subscription_status: Optional[str] = Field(default="none", index=True)
    subscription_start: Optional[datetime] = None
    subscription_expires: Optional[datetime] = None

    google_id: Optional[str] = Field(default=None, index=True)
    avatar_url: Optional[str] = None

    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
