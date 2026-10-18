from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class GenerationJob(SQLModel, table=True):
    __tablename__ = "generation_jobs"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    kind: str = Field(index=True)  # roadmap | lesson
    ref_id: Optional[str] = Field(default=None, index=True)  # roadmap_id or lesson_id
    goal: Optional[str] = None
    status: str = Field(default="running", index=True)  # running | done | failed
    progress: int = Field(default=0)  # 0-100, from any percentage
    total: int = Field(default=0)
    partial_nodes: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    stage: Optional[str] = None  # e.g. fetching_base | planning | enriching | content | video | quiz
    error: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
