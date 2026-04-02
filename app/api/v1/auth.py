"""
app/api/v1/auth.py
------------------
POST /api/v1/auth/register   — criar conta
POST /api/v1/auth/token      — login (OAuth2 Password Flow / Swagger UI)
POST /api/v1/auth/refresh    — rotacionar refresh token
POST /api/v1/auth/logout     — revogar refresh token
GET  /api/v1/auth/me         — dados do usuário autenticado
"""

from __future__ import annotations

import logging
import os
import uuid as _uuid_mod
from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limiter import rate_limit

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.security import (
    TokenError,
    create_token_pair,
    decode_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.db.session import get_session
from app.models.domain import PasswordResetToken, RefreshToken, Sex, User, UserRead, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Schemas ──────────────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: str | None = None
    role: UserRole = UserRole.patient
    sex: Sex | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Refresh token helpers ───────────────────────────────────────────────────────


async def _persist_refresh_token(session: AsyncSession, jti: str, user_id: UUID) -> None:
    expires = datetime.utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days)
    session.add(RefreshToken(jti=jti, user_id=user_id, expires_at=expires))
    await session.flush()


async def _revoke_refresh_token(session: AsyncSession, jti: str) -> None:
    result = await session.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    token = result.scalar_one_or_none()
    if token and token.revoked_at is None:
        token.revoked_at = datetime.utcnow()
        session.add(token)


# ── Endpoints ───────────────────────────────────────────────────────────────────


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED,
             summary="Criar nova conta")
async def register(
    body: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    """Cria nova conta de usuário (patient por padrão)."""
    if (await session.execute(
        select(User).where(User.email == body.email))
    ).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="E-mail já cadastrado.")

    user = User(
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        role=body.role,
        sex=body.sex,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    await session.commit()

    logger.info("Novo usuário: id=%s role=%s", user.id, user.role)
    return UserRead(id=user.id, **user.model_dump(exclude={"id", "hashed_password"}))


@router.post("/token", response_model=TokenResponse, summary="Login",
             dependencies=[Depends(rate_limit(5, 60))])
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    """Autentica via senha e retorna par de tokens (access + refresh)."""
    user = (await session.execute(
        select(User).where(User.email == form.username)
    )).scalar_one_or_none()

    # Mesmo erro para "não encontrado" e "senha errada" — evita user enumeration
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail="E-mail ou senha incorretos.",
                            headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Conta desativada.")

    # Rehash silencioso se o custo do bcrypt foi aumentado
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(form.password)
        user.updated_at = datetime.utcnow()
        session.add(user)
        await session.commit()

    access, refresh, jti = create_token_pair(user.id)
    await _persist_refresh_token(session, jti, user.id)
    await session.commit()
    logger.info("Login: user_id=%s", user.id)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse, summary="Rotacionar refresh token")
async def refresh_tokens(
    body: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    """Rotaciona o refresh token (revoga o antigo) e emite novo par de tokens."""
    _err = HTTPException(status.HTTP_401_UNAUTHORIZED,
                         detail="Token inválido ou expirado.",
                         headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except TokenError:
        raise _err

    jti: str = payload["jti"]
    user_id = UUID(payload["sub"])

    async with session.begin():
        db_token = (await session.execute(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )).scalar_one_or_none()
        if db_token is None or db_token.revoked_at is not None or db_token.expires_at <= datetime.utcnow():
            logger.warning("Reuso/expiração de refresh token detectado: jti=%s", jti)
            raise _err

        await _revoke_refresh_token(session, jti)

        user = (await session.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()
        if user is None or not user.is_active:
            raise _err

        access, refresh, new_jti = create_token_pair(user.id)
        await _persist_refresh_token(session, new_jti, user.id)

    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Logout",
)
async def logout(
    body: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    _: CurrentUser,
) -> None:
    """Idempotente — não falha se o token já foi revogado."""
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except TokenError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    jti = payload.get("jti")
    if not jti:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    async with session.begin():
        await _revoke_refresh_token(session, jti)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead, summary="Meus dados")
async def get_me(current_user: CurrentUser) -> UserRead:
    """Retorna os dados do usuário autenticado."""
    return UserRead(
        id=current_user.id,
        **current_user.model_dump(exclude={"id", "hashed_password"}),
    )


class UpdateMeRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.patch("/me", response_model=UserRead, summary="Atualizar dados do usuário")
async def update_me(
    body: UpdateMeRequest,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    """Atualiza nome e/ou telefone do usuário autenticado."""
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.phone is not None:
        current_user.phone = body.phone or None
    current_user.updated_at = datetime.utcnow()
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return UserRead(id=current_user.id, **current_user.model_dump(exclude={"id", "hashed_password"}))


@router.post(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Trocar senha",
)
async def change_password(
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Troca a senha do usuário autenticado verificando a senha atual."""
    from app.core.security import verify_password, hash_password
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta.")
    current_user.hashed_password = hash_password(body.new_password)
    current_user.updated_at = datetime.utcnow()
    session.add(current_user)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
_AVATAR_DIR = "static/avatars"


@router.post("/me/avatar", response_model=UserRead, summary="Atualizar foto de perfil")
async def upload_avatar(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile = File(...),
) -> UserRead:
    """Faz upload da foto de perfil do usuário autenticado (JPEG, PNG ou WebP, máx 5 MB)."""
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Formato não suportado. Use JPEG, PNG ou WebP.",
        )

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Imagem muito grande. Máximo: 5 MB.",
        )

    ext = file.content_type.split("/")[-1].replace("jpeg", "jpg")
    filename = f"{current_user.id}.{ext}"
    path = os.path.join(_AVATAR_DIR, filename)

    # Remove any previous avatar for this user (other extensions)
    for old_ext in ("jpg", "png", "webp"):
        old_path = os.path.join(_AVATAR_DIR, f"{current_user.id}.{old_ext}")
        if old_path != path and os.path.exists(old_path):
            os.remove(old_path)

    with open(path, "wb") as f:
        f.write(data)

    current_user.avatar_url = f"/static/avatars/{filename}"
    current_user.updated_at = datetime.utcnow()
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)

    return UserRead(
        id=current_user.id,
        **current_user.model_dump(exclude={"id", "hashed_password"}),
    )


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


@router.post("/forgot-password", summary="Solicitar redefinição de senha",
             dependencies=[Depends(rate_limit(3, 60))])
async def forgot_password(
    body: ForgotPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Gera um token de redefinição de senha (1 hora de validade).
    Em produção envie por e-mail. Em desenvolvimento o token aparece no log e na resposta."""
    from secrets import token_urlsafe

    user = (await session.execute(
        select(User).where(User.email == body.email)
    )).scalar_one_or_none()

    # Sempre retorna a mesma mensagem para não revelar se o e-mail existe
    if user is None:
        return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções."}

    # Invalida tokens anteriores não usados
    old_tokens = (await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used.is_(False),
        )
    )).scalars().all()
    for t in old_tokens:
        t.used = True
        session.add(t)

    raw_token = token_urlsafe(32)
    reset = PasswordResetToken(
        user_id=user.id,
        token=raw_token,
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    session.add(reset)
    await session.commit()

    logger.info("[DEV] Token de redefinição para %s → %s", body.email, raw_token)
    return {
        "message": "Se o e-mail estiver cadastrado, você receberá as instruções.",
        "dev_token": raw_token,  # Remover em produção / configurar e-mail
    }


@router.post("/reset-password", summary="Redefinir senha com token")
async def reset_password(
    body: ResetPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Valida o token de redefinição e atualiza a senha."""
    reset = (await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == body.token,
            PasswordResetToken.used.is_(False),
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
    )).scalar_one_or_none()

    if reset is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Token inválido ou expirado.")

    user = (await session.execute(
        select(User).where(User.id == reset.user_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Usuário não encontrado.")

    user.hashed_password = hash_password(body.new_password)
    user.updated_at = datetime.utcnow()
    reset.used = True
    session.add(user)
    session.add(reset)
    await session.commit()

    logger.info("Senha redefinida para user_id=%s", user.id)
    return {"message": "Senha redefinida com sucesso!"}


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Remover foto de perfil",
)
async def delete_avatar(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Remove a foto de perfil do usuário autenticado."""
    if current_user.avatar_url:
        for ext in ("jpg", "png", "webp"):
            path = os.path.join(_AVATAR_DIR, f"{current_user.id}.{ext}")
            if os.path.exists(path):
                os.remove(path)
        current_user.avatar_url = None
        current_user.updated_at = datetime.utcnow()
        session.add(current_user)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
