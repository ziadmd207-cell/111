from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class Project(SQLModel, table=True):
    __tablename__ = "projects"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    title: str
    goal: Optional[str] = None
    description: Optional[str] = None
    link: Optional[str] = None
    images: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    technologies: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    status: str = Field(default="suggested")
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
