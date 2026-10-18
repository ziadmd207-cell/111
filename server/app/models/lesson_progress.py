from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class LessonProgress(SQLModel, table=True):
    __tablename__ = "lesson_progress"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    lesson_id: str = Field(index=True)
    status: str = Field(default="not_started")
    video_watched: bool = Field(default=False)
    pdf_viewed: bool = Field(default=False)
    quiz_score: int = Field(default=0)
    attempts: int = Field(default=0)
    quiz_answers: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
