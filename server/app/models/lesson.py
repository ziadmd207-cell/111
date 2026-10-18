from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class Lesson(SQLModel, table=True):
    __tablename__ = "lessons"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    roadmap_id: str = Field(index=True)
    node_id: str
    node_title: Optional[str] = None
    phase: int = Field(default=1)
    day: str = Field(default="Day 1")
    week: int = Field(default=1)
    order: int = Field(default=0)
    status: str = Field(default="locked")
    quiz_passed: bool = Field(default=False)
    quiz_score: Optional[float] = None
    completed_date: Optional[str] = None
    summary: Optional[str] = None
    reading_content: Optional[str] = None
    quiz: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    task: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    video_url: Optional[str] = None
    video_title: Optional[str] = None
    video_iframe_url: Optional[str] = None
    video_duration: Optional[int] = None
    video_verified: bool = Field(default=False)
    pdf_url: Optional[str] = None
    pdf_iframe_ready: bool = Field(default=False)
    resources: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    quiz_passing_score: int = Field(default=70)
    content_ready: bool = Field(default=False)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
