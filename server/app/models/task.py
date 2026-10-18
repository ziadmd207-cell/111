from typing import Optional
from sqlmodel import SQLModel, Field
import uuid
from datetime import datetime

class Task(SQLModel, table=True):
    __tablename__ = "tasks"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    title: str
    node_id: Optional[str] = None
    node_title: Optional[str] = None
    status: str = Field(default="todo")
    estimated_minutes: Optional[int] = None
    difficulty: str = Field(default="medium")
    due_date: Optional[str] = None
    completed_date: Optional[str] = None
    order: int = Field(default=0)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
