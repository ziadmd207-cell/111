from typing import Optional
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field
from datetime import datetime


class AdminSetting(SQLModel, table=True):
    __tablename__ = "admin_settings"

    id: str = Field(default="default", primary_key=True)
    # Pricing configuration (single source of truth)
    starter_price: float = Field(default=99.0)
    pro_price: float = Field(default=199.0)
    prime_price: float = Field(default=399.0)
    currency: str = Field(default="EGP")
    subscription_contact_email: str = Field(default="zeus.eduai@gmail.com")
    starter_description: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    starter_features: Optional[list] = Field(default=None, sa_column=Column(JSON))
    pro_description: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    pro_features: Optional[list] = Field(default=None, sa_column=Column(JSON))
    prime_description: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    prime_features: Optional[list] = Field(default=None, sa_column=Column(JSON))

    # AI Model API configuration
    active_ai_provider: str = Field(default="auto")  # Legacy global override; task routes now control provider selection.
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = Field(default="gemini-2.5-flash")
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = Field(default="gpt-4o-mini")
    # YouTube API configuration (Only external service actively used)
    youtube_api_key: Optional[str] = None
    facebook_url: Optional[str] = Field(default="https://www.facebook.com/profile.php?id=61593983652683&mibextid=ZbWKwL")
    linkedin_url: Optional[str] = Field(default="https://www.linkedin.com/company/zeus_eduu")
    instagram_url: Optional[str] = Field(default="https://www.instagram.com/zeus.eduplatform/")
    tiktok_url: Optional[str] = Field(default="https://www.tiktok.com/@zeusplatform?_r=1&_t=ZS-99ag6R9rlsu")
    whatsapp_url: Optional[str] = None

    # Deprecated/unused placeholders kept optional for backward compatibility
    search_api_key: Optional[str] = None
    job_search_api_key: Optional[str] = None

    updated_date: datetime = Field(default_factory=datetime.utcnow)
