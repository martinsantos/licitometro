"""
Authentication service - user accounts with role-based JWT tokens.
"""

import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
import bcrypt as _bcrypt
import jwt

logger = logging.getLogger("auth_service")

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "")
if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = str(uuid.uuid4())
    logger.warning("JWT_SECRET_KEY not set - using random key (sessions won't persist across restarts)")

JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = int(os.environ.get("TOKEN_EXPIRY_HOURS", "24"))
AUTH_PASSWORD_HASH = os.environ.get("AUTH_PASSWORD_HASH", "")


async def authenticate_user(db, email: str, password: str) -> dict | None:
    """Authenticate user by email+password. Returns user doc or None."""
    user = await db.users.find_one({"email": email, "active": True})
    if not user:
        return None
    try:
        if _bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
            return user
    except Exception as e:
        logger.error(f"Password verification error for {email}: {e}")
    return None


def create_access_token(email: str, role: str) -> str:
    """Create a JWT access token with email and role."""
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)
    payload = {
        "sub": email,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_public_access_token(ttl_days: int = 30) -> str:
    """Create a JWT token for public read-only access (used in notification links)."""
    expire = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    payload = {
        "sub": "reader",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict:
    """Verify a JWT token. Returns dict with valid, email, role."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        sub = payload.get("sub", "")
        if sub == "reader":
            return {"valid": True, "email": "", "role": "reader"}
        if sub:
            return {"valid": True, "email": sub, "role": payload.get("role", "viewer")}
        return {"valid": False, "email": "", "role": ""}
    except jwt.ExpiredSignatureError:
        return {"valid": False, "email": "", "role": ""}
    except jwt.InvalidTokenError:
        return {"valid": False, "email": "", "role": ""}


def hash_password(plain_password: str) -> str:
    """Generate a bcrypt hash for a password. Utility for setup."""
    return _bcrypt.hashpw(
        plain_password.encode("utf-8"),
        _bcrypt.gensalt(),
    ).decode("utf-8")
