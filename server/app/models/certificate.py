from datetime import datetime
import uuid

from sqlmodel import Field, SQLModel


class Certificate(SQLModel, table=True):
    __tablename__ = "certificates"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(index=True)
    sent_by_user_id: str = Field(index=True)
    title: str = Field(default="ZEUS Certificate")
    file_key: str = Field(unique=True, index=True)
    file_name: str
    media_type: str
    share_token: str = Field(default_factory=lambda: uuid.uuid4().hex, unique=True, index=True)
    created_date: datetime = Field(default_factory=datetime.utcnow, index=True)
