"""POST /api/auth/login and GET /api/auth/me -- see app.auth for how credentials and session
tokens work. These are the only /api routes (besides /api/health) reachable without a token.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import issue_token, require_auth, verify_credentials

logger = logging.getLogger("app.api.auth")
router = APIRouter()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    # SHA-256 hex digest computed in the browser -- the plaintext password is never sent.
    password_hash: str = Field(pattern=r"^[0-9a-fA-F]{64}$")


class LoginResponse(BaseModel):
    token: str
    username: str
    expires_at: int


class MeResponse(BaseModel):
    username: str


@router.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest):
    username = body.username.strip()
    if not verify_credentials(username, body.password_hash):
        logger.info(f"failed login for {username!r}")
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token, expires_at = issue_token(username)
    logger.info(f"login ok for {username!r}")
    return LoginResponse(token=token, username=username, expires_at=expires_at)


@router.get("/api/auth/me", response_model=MeResponse)
def me(username: str = Depends(require_auth)):
    return MeResponse(username=username)
