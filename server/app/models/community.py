from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class Community(SQLModel, table=True):
    __tablename__ = "communities"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    description: Optional[str] = None
    goal: Optional[str] = None
    stage: Optional[str] = None
    partner_id: Optional[str] = Field(default=None, index=True)
    doctor_id: Optional[str] = Field(default=None, index=True)
    members: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    member_count: int = Field(default=0)
    is_closed: bool = Field(default=False)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)

class CommunityMessage(SQLModel, table=True):
    __tablename__ = "community_messages"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    community_id: str = Field(index=True)
    user_id: str = Field(default="demo-user", index=True)
    user_name: Optional[str] = None
    text: Optional[str] = None
    attachments: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    reply_to: Optional[str] = None
    is_pinned: bool = Field(default=False)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
