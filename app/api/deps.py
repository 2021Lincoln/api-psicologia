"""
app/api/deps.py
---------------
FastAPI dependencies for authentication and role-based authorization.

Import the typed aliases in your routers:

    from app.api.deps import CurrentUser, CurrentPsychologist, CurrentPatient
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenError, decode_token
from app.db.session import get_session
from app.models.domain import User, UserRole

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


async def get_current_user(
    token: Annotated[str, Depends(_oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    """
    Validate Bearer token → return active User.
    Returns HTTP 401 for any token failure or inactive account.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticado. Faça login para continuar.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token, expected_type="access")
    except TokenError:
        raise credentials_exception

    try:
        user_id = UUID(payload.get("sub", ""))
    except ValueError:
        raise credentials_exception

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Conta desativada. Entre em contato com o suporte.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(*roles: UserRole):
    """
    Dependency factory for role-based access control.

    Usage:
        async def endpoint(user: Annotated[User, Depends(require_role(UserRole.psychologist))]):
    """
    async def _check(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso restrito a: {' ou '.join(r.value for r in roles)}.",
            )
        return current_user

    _check.__name__ = f"require_role({'_'.join(r.value for r in roles)})"
    return _check


# ── Typed aliases ─────────────────────────────────────────────────────────────

CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentPsychologist = Annotated[User, Depends(require_role(UserRole.psychologist))]
CurrentPatient = Annotated[User, Depends(require_role(UserRole.patient))]
