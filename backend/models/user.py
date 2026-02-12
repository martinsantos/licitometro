"""
User model for role-based authentication.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "viewer"
    name: str = ""


class UserInDB(BaseModel):
    id: str
    email: str
    password_hash: str
    role: str  # "admin" | "viewer"
    name: str
    active: bool
    created_at: datetime
    updated_at: datetime
