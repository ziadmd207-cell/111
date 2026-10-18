from typing import Optional
from sqlmodel import SQLModel, Field
import uuid
from datetime import datetime


class SubscriptionRequest(SQLModel, table=True):
    __tablename__ = "subscription_requests"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: Optional[str] = Field(default=None, index=True)
    full_name: str
    email: str = Field(index=True)
    phone: str
    plan: str = Field(index=True)  # STARTER, PRO, PRIME
    amount: float = Field(default=0.0)
    payment_image_url: str = Field(default="")
    notes: Optional[str] = None
    status: str = Field(default="pending", index=True)  # pending, approved, rejected
    start_date: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
