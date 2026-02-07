"""
Authentication service - shared password with JWT tokens.
"""

import os
import logging
from datetime import datetime, timedelta, timezone
import bcrypt as _bcrypt
import jwt

logger = logging.getLogger("auth_service")

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = int(os.environ.get("TOKEN_EXPIRY_HOURS", "24"))
AUTH_PASSWORD_HASH = os.environ.get("AUTH_PASSWORD_HASH", "")


def verify_password(plain_password: str) -> bool:
    """Verify the shared password against the stored bcrypt hash."""
    if not AUTH_PASSWORD_HASH:
        logger.warning("AUTH_PASSWORD_HASH not set - authentication disabled")
        return True
    try:
        return _bcrypt.checkpw(
            plain_password.encode("utf-8"),
            AUTH_PASSWORD_HASH.encode("utf-8"),
        )
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def create_access_token() -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)
    payload = {
        "sub": "user",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> bool:
    """Verify a JWT token is valid and not expired."""
    try:
        jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return True
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False


def hash_password(plain_password: str) -> str:
    """Generate a bcrypt hash for a password. Utility for setup."""
    return _bcrypt.hashpw(
        plain_password.encode("utf-8"),
        _bcrypt.gensalt(),
    ).decode("utf-8")
