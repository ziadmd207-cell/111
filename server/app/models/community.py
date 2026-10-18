from typing import Optional, List
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
import uuid
from datetime import datetime

class Community(SQLModel, table=True):
    __tablename__ = "communities"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    goal: Optional[str] = None
    stage: Optional[str] = None
    members: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    member_count: int = Field(default=0)
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)

class CommunityMessage(SQLModel, table=True):
    __tablename__ = "community_messages"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    community_id: str = Field(index=True)
    user_id: str = Field(default="demo-user", index=True)
    user_name: Optional[str] = None
    text: str
    reply_to: Optional[str] = None
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
