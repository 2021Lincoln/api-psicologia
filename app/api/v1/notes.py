"""
app/api/v1/notes.py
-------------------
GET    /api/v1/psychologists/me/notes            — lista lembretes
POST   /api/v1/psychologists/me/notes            — cria lembrete
DELETE /api/v1/psychologists/me/notes/{note_id}  — remove lembrete
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.db.session import get_session
from app.models.domain import Note, PsychologistProfile, UserRole

router = APIRouter(tags=["Notes"])


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class NoteRead(BaseModel):
    id: UUID
    content: str
    created_at: datetime


async def _get_profile(user: CurrentUser, session: AsyncSession) -> PsychologistProfile:
    if user.role != UserRole.psychologist:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Apenas profissionais podem usar lembretes.")
    profile = (
        await session.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == user.id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado.")
    return profile


# ── GET /psychologists/me/notes ───────────────────────────────────────────────


@router.get(
    "/psychologists/me/notes",
    response_model=list[NoteRead],
    summary="Lista lembretes do profissional autenticado",
)
async def list_notes(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[NoteRead]:
    profile = await _get_profile(current_user, session)
    rows = (
        await session.execute(
            select(Note)
            .where(Note.psychologist_profile_id == profile.id)
            .order_by(Note.created_at.desc())
        )
    ).scalars().all()
    return [NoteRead(id=n.id, content=n.content, created_at=n.created_at) for n in rows]


# ── POST /psychologists/me/notes ──────────────────────────────────────────────


@router.post(
    "/psychologists/me/notes",
    response_model=NoteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Cria um lembrete",
)
async def create_note(
    body: NoteCreate,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NoteRead:
    profile = await _get_profile(current_user, session)
    note = Note(psychologist_profile_id=profile.id, content=body.content)
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return NoteRead(id=note.id, content=note.content, created_at=note.created_at)


# ── PATCH /psychologists/me/notes/{note_id} ───────────────────────────────────


class NoteUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


@router.patch(
    "/psychologists/me/notes/{note_id}",
    response_model=NoteRead,
    summary="Edita o conteúdo de um lembrete",
)
async def update_note(
    note_id: UUID,
    body: NoteUpdate,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NoteRead:
    profile = await _get_profile(current_user, session)
    note = (
        await session.execute(
            select(Note).where(Note.id == note_id, Note.psychologist_profile_id == profile.id)
        )
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lembrete não encontrado.")
    note.content = body.content
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return NoteRead(id=note.id, content=note.content, created_at=note.created_at)


# ── DELETE /psychologists/me/notes/{note_id} ──────────────────────────────────


@router.delete(
    "/psychologists/me/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Remove um lembrete",
)
async def delete_note(
    note_id: UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    profile = await _get_profile(current_user, session)
    note = (
        await session.execute(
            select(Note).where(Note.id == note_id, Note.psychologist_profile_id == profile.id)
        )
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lembrete não encontrado.")
    await session.delete(note)
    await session.commit()
    return Response(status_code=204)
