from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    type: str = Field(default="discovery")  # "discovery", "companion", "lesson"
    lesson_id: Optional[str] = Field(default=None, index=True)
    companion_name: Optional[str] = None
    messages: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
