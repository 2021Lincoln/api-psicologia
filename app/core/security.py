"""
app/core/security.py
--------------------
Pure cryptographic functions — no FastAPI, no DB, no side effects.

- Password hashing/verification via passlib + bcrypt
- JWT creation and decoding via python-jose
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

_pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)


def hash_password(plain_password: str) -> str:
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time comparison — safe against timing attacks."""
    return _pwd_context.verify(plain_password, hashed_password)


def password_needs_rehash(hashed_password: str) -> bool:
    return _pwd_context.needs_update(hashed_password)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


class TokenError(Exception):
    def __init__(self, detail: str = "Token inválido ou expirado.") -> None:
        self.detail = detail
        super().__init__(detail)


def _create_token(subject: UUID, token_type: str, expires_delta: timedelta) -> tuple[str, str]:
    jti = str(uuid4())
    now = datetime.now(tz=timezone.utc)
    claims = {
        "sub": str(subject),
        "type": token_type,
        "jti": jti,
        "iat": now,
        "exp": now + expires_delta,
    }
    token = jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti


def create_access_token(user_id: UUID) -> str:
    token, _ = _create_token(
        subject=user_id,
        token_type="access",
        expires_delta=timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )
    return token


def create_refresh_token(user_id: UUID) -> tuple[str, str]:
    """Returns (refresh_token, jti)."""
    return _create_token(
        subject=user_id,
        token_type="refresh",
        expires_delta=timedelta(days=settings.jwt_refresh_token_expire_days),
    )


def create_token_pair(user_id: UUID) -> tuple[str, str, str]:
    """Returns (access_token, refresh_token, refresh_jti)."""
    access = create_access_token(user_id)
    refresh, jti = create_refresh_token(user_id)
    return access, refresh, jti


def decode_token(token: str, expected_type: str) -> dict:
    """
    Decode and validate a JWT. Raises TokenError on any failure.

    python-jose checks: signature, expiry, algorithm.
    We additionally check: type claim matches expected_type.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat", "jti", "type"]},
        )
    except JWTError as exc:
        raise TokenError() from exc

    if payload.get("type") != expected_type:
        raise TokenError(
            f"Token do tipo errado: esperado '{expected_type}', recebido '{payload.get('type')}'."
        )
    return payload
