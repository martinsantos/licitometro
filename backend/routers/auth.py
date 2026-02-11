"""
Authentication router - login/logout/check endpoints.
"""

from fastapi import APIRouter, Response, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.auth_service import verify_password, create_access_token, verify_token, create_public_access_token

logger = logging.getLogger("auth_router")

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class TokenLoginRequest(BaseModel):
    token: str


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    """Authenticate with the shared password."""
    if not verify_password(body.password):
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid password"},
        )

    token = create_access_token()

    response = JSONResponse(content={"message": "Authenticated"})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=True,
        max_age=86400,  # 24 hours
        path="/",
    )
    return response


@router.get("/check")
async def check_auth(request: Request):
    """Check if the current session is authenticated."""
    token = request.cookies.get("access_token")
    if token and verify_token(token):
        return {"authenticated": True}
    return JSONResponse(
        status_code=401,
        content={"authenticated": False},
    )


@router.post("/token-login")
async def token_login(body: TokenLoginRequest):
    """Exchange a public access token for a session cookie."""
    if not verify_token(body.token):
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or expired token"},
        )

    # Create a normal access token cookie so the SPA works normally
    token = create_access_token()
    response = JSONResponse(content={"message": "Authenticated"})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=True,
        max_age=86400,
        path="/",
    )
    return response


@router.post("/logout")
async def logout(response: Response):
    """Clear the authentication cookie."""
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token", path="/")
    return response
