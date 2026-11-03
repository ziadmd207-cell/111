from datetime import datetime
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class SupportChat(SQLModel, table=True):
    __tablename__ = "support_chats"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str | None = Field(default=None, index=True)
    guest_token_hash: str | None = None
    name: str
    email: str = Field(index=True)
    phone: str = Field(default="")
    status: str = Field(default="open", index=True)
    unread_admin: int = Field(default=0)
    unread_user: int = Field(default=0)
    created_date: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_date: datetime = Field(default_factory=datetime.utcnow, index=True)


class SupportChatMessage(SQLModel, table=True):
    __tablename__ = "support_chat_messages"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    chat_id: str = Field(index=True)
    sender_type: str
    sender_user_id: str | None = None
    text: str = Field(default="")
    attachments: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    created_date: datetime = Field(default_factory=datetime.utcnow, index=True)
