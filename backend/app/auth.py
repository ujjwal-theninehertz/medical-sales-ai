"""
Hardcoded two-user login -- no database, no JWT. Kept deliberately small for the POC.

Passwords never exist in plaintext anywhere: the browser SHA-256s the password before sending
it (so the plaintext never appears in DevTools' Network tab), and this module only stores a
salted PBKDF2 of that SHA-256. Comparing is constant-time, and an unknown username still pays
the full PBKDF2 cost so response timing doesn't reveal which usernames exist.

A successful login returns an opaque, HMAC-signed session token ("<payload>.<signature>"),
verified statelessly on every request by `require_auth`. Signed with AUTH_SECRET from
backend/.env; if that isn't set, a random per-process secret is used instead, which works but
logs everyone out whenever the server restarts.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

from fastapi import Header, HTTPException

logger = logging.getLogger("app.auth")

_PBKDF2_ITERATIONS = 200_000
TOKEN_TTL_SECONDS = 12 * 60 * 60

# username -> (salt hex, PBKDF2-SHA256 hex of the client's SHA-256(password) hex digest)
_USERS = {
    "MDsales1": (
        "9150b34473c4c68cb4ac193024c0b2d9",
        "b58f70e02ff67825712678aafb1f896c2d95dff5d1d8fd62359c3300c538908e",
    ),
    "MDsales2": (
        "9034929572d62c0cabcd6a8139bb02b6",
        "e090f4fc29036bd6e92b5012be011d413e2a130a32288db202fb45306891dd9e",
    ),
}
_DUMMY_SALT = "00000000000000000000000000000000"

_SECRET = os.environ.get("AUTH_SECRET", "").encode()
if not _SECRET:
    logger.warning("AUTH_SECRET is not set -- using a random per-process secret; sessions end on restart")
    _SECRET = secrets.token_bytes(32)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _sign(payload: str) -> str:
    return _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())


def verify_credentials(username: str, password_hash: str) -> bool:
    salt, expected = _USERS.get(username, (_DUMMY_SALT, ""))
    derived = hashlib.pbkdf2_hmac(
        "sha256", password_hash.lower().encode(), bytes.fromhex(salt), _PBKDF2_ITERATIONS
    ).hex()
    return hmac.compare_digest(derived, expected) and username in _USERS


def issue_token(username: str) -> tuple[str, int]:
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    payload = _b64(json.dumps({"u": username, "exp": expires_at}).encode())
    return f"{payload}.{_sign(payload)}", expires_at


def read_token(token: str) -> str | None:
    """The username the token was issued to, or None if it's forged, malformed or expired."""
    payload, _, signature = token.partition(".")
    if not payload or not hmac.compare_digest(signature, _sign(payload)):
        return None
    try:
        data = json.loads(_unb64(payload))
    except ValueError:
        return None
    if data.get("exp", 0) < time.time() or data.get("u") not in _USERS:
        return None
    return data["u"]


def require_auth(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency guarding every data route -- see app.main."""
    scheme, _, token = (authorization or "").partition(" ")
    username = read_token(token) if scheme.lower() == "bearer" else None
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in", headers={"WWW-Authenticate": "Bearer"})
    return username
