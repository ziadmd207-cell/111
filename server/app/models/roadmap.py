from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class Roadmap(SQLModel, table=True):
    __tablename__ = "roadmaps"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    goal: str
    version: int = Field(default=1)
    status: str = Field(default="active")
    nodes: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    video_preference: str = Field(default="free")
    quality_score: float = Field(default=0.0)
    reviewed_at: Optional[datetime] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
