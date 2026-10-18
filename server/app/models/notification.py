from typing import Optional
from sqlmodel import SQLModel, Field
import uuid
from datetime import datetime

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    type: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    read: bool = Field(default=False)
    action_label: Optional[str] = None
    action_url: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
