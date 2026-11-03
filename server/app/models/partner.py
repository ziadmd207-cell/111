from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


class Partner(SQLModel, table=True):
    __tablename__ = "partners"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    account_user_id: str = Field(index=True, unique=True)
    name: str
    institution_type: str = Field(default="educational_institution")
    status: str = Field(default="active", index=True)
    learning_mode: str = Field(default="student_discovery")
    assigned_track: Optional[str] = None
    doctor_track: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    subscription_plan: str = Field(default="PRO")
    subscription_status: str = Field(default="active", index=True)
    subscription_start: Optional[datetime] = None
    subscription_expires: Optional[datetime] = None
    max_students: Optional[int] = None
    features: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)


class PartnerMember(SQLModel, table=True):
    __tablename__ = "partner_members"
    __table_args__ = (UniqueConstraint("user_id", name="uq_partner_members_user_id"),)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    partner_id: str = Field(index=True)
    user_id: str = Field(index=True)
    member_type: str = Field(index=True)
    doctor_id: Optional[str] = Field(default=None, index=True)
    username: Optional[str] = Field(default=None, index=True)
    national_id: Optional[str] = None
    status: str = Field(default="active", index=True)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)


class PartnerAssessment(SQLModel, table=True):
    __tablename__ = "partner_assessments"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    partner_id: str = Field(index=True)
    doctor_id: Optional[str] = Field(default=None, index=True)
    created_by: str = Field(index=True)
    title: str
    description: Optional[str] = None
    kind: str = Field(default="exam", index=True)
    questions: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    is_active: bool = Field(default=True, index=True)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)


class PartnerAssessmentAttempt(SQLModel, table=True):
    __tablename__ = "partner_assessment_attempts"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    assessment_id: str = Field(index=True)
    partner_id: str = Field(index=True)
    user_id: str = Field(index=True)
    answers: dict = Field(default_factory=dict, sa_column=Column(JSON))
    score: float = Field(default=0)
    total_points: float = Field(default=0)
    submitted_date: datetime = Field(default_factory=datetime.utcnow, index=True)
