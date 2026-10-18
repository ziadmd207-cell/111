from datetime import datetime
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class SupportRequest(SQLModel, table=True):
    __tablename__ = "support_requests"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(index=True)
    phone: str
    problem: str
    attachments: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    status: str = Field(default="open", index=True)
    created_date: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_date: datetime = Field(default_factory=datetime.utcnow)
