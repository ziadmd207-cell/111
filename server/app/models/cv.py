from typing import Any, Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class CV(SQLModel, table=True):
    __tablename__ = "cvs"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    full_name: Optional[str] = None
    title_role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    summary: Optional[str] = None
    experiences: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    education: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    skills: Optional[List[Any]] = Field(default=None, sa_column=Column(JSON))
    soft_skills: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    languages: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    certifications: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    projects: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    accent_color: Optional[str] = None
    portfolio_config: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    photo_url: Optional[str] = None
    voice_url: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
