from typing import Optional, List, Dict
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class LearningProfile(SQLModel, table=True):
    __tablename__ = "learning_profiles"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(default="demo-user", index=True)
    full_name: Optional[str] = None
    companion_name: str = Field(default="Zeus")
    onboarding_step: str = Field(default="discovery")
    goal: Optional[str] = None
    field_comparison_pending: bool = Field(default=False)
    field_motivation: Optional[str] = None
    work_preference: Optional[str] = None
    current_level: Optional[str] = None
    learning_style: Optional[str] = None
    preferred_language: Optional[str] = None
    depth: Optional[str] = None
    weekly_hours: Optional[float] = None
    available_days: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    study_hours_by_day: Optional[Dict[str, float]] = Field(default=None, sa_column=Column(JSON))
    preferred_time: Optional[str] = None
    motivation: Optional[str] = None
    stop_triggers: Optional[str] = None
    distractions: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    encouragement: Optional[str] = None
    weaknesses: Optional[str] = None
    strengths: Optional[str] = None
    session_length: Optional[float] = None
    career_intent: Optional[str] = None
    deadline: Optional[str] = None
    obstacles: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    education: Optional[str] = None
    current_role: Optional[str] = None
    experience: Optional[str] = None
    background: Optional[str] = None
    budget: Optional[str] = None
    device: Optional[str] = None
    internet: Optional[str] = None
    skill_graph: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    goal_recommendations: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    video_preference: str = Field(default="free")
    video_length_preference: Optional[str] = None
    known_skills: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    target_skills: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    status: str = Field(default="active")
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
