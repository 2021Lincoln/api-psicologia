"""
Rotas de psicólogas.

Observação: rotas literais (/me/..., /admin/...) ficam antes das rotas parametrizadas (/{id})
para evitar conflitos de resolução no FastAPI.
"""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func as sa_func
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import and_, delete, extract, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentPsychologist, CurrentUser
from app.db.session import get_session
from app.models.domain import (
    Availability,
    AvailabilityRead,
    PsychologistProfile,
    PsychologistProfileCreate,
    PsychologistProfileRead,
    Review,
    User,
    UserRole,
)
from app.services.schedule import PsychologistNotFound, get_available_slots

router = APIRouter(prefix="/psychologists", tags=["Psychologists"])


# Schemas ---------------------------------------------------------------------


class PsychologistListItem(BaseModel):
    id: UUID
    full_name: str
    crp: str
    specialties: str | None
    hourly_rate: Decimal
    session_duration_minutes: int
    is_accepting_patients: bool
    avatar_url: str | None = None
    avg_rating: float | None = None
    review_count: int = 0
    gender: str | None = None
    accent_color: str | None = None


class PsychologistDetailResponse(BaseModel):
    profile: PsychologistProfileRead
    availabilities: list["AvailabilityItemResponse"]


class AvailabilityUpsertRequest(BaseModel):
    """
    Replace all availability entries for a given month.
    Only entries belonging to `year`/`month` are deleted and re-inserted.
    Field names match the JSON keys sent by the frontend directly (no aliases).
    """

    class Item(BaseModel):
        specificDate: date
        start: time
        end: time
        isActive: bool = True

    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)
    items: list[Item] = Field(default_factory=list)

    @model_validator(mode="after")
    def items_belong_to_month(self) -> "AvailabilityUpsertRequest":
        for item in self.items:
            if item.specificDate.year != self.year or item.specificDate.month != self.month:
                raise ValueError(
                    f"A data {item.specificDate} não pertence a {self.year}-{self.month:02d}."
                )
        return self


class AvailabilityItemResponse(BaseModel):
    id: UUID
    specificDate: str   # "YYYY-MM-DD"
    start: str          # "HH:MM"
    end: str            # "HH:MM"
    isActive: bool


class SlotRead(BaseModel):
    start: str
    end: str
    duration_minutes: int
    status: str  # "available" | "reserved"


class ProfileUpdateRequest(BaseModel):
    bio: str | None = Field(default=None, max_length=2000)
    specialties: str | None = Field(default=None, max_length=500)
    hourly_rate: Decimal | None = Field(default=None, ge=0)
    session_duration_minutes: int | None = Field(default=None, ge=15, le=120)
    is_accepting_patients: bool | None = None
    gender: str | None = Field(default=None, max_length=1)
    accent_color: str | None = Field(default=None, max_length=30)


class VerifyRequest(BaseModel):
    approve: bool = Field(default=True, description="Define se o perfil será marcado como verificado")


# Endpoints — rotas literais primeiro -----------------------------------------


@router.get(
    "",
    response_model=list[PsychologistListItem],
    summary="Listar psicólogas com filtros",
)
async def list_psychologists(
    db: Annotated[AsyncSession, Depends(get_session)],
    specialty: str | None = Query(default=None),
    min_price: str | None = Query(default=None, description="Preço mínimo em BRL"),
    max_price: str | None = Query(default=None, description="Preço máximo em BRL"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[PsychologistListItem]:
    """Lista psicólogas com filtros opcionais e paginação. Apenas perfis verificados aparecem."""
    # Normaliza preços (permite string vazia vinda do frontend)
    min_price_dec: Decimal | None = None
    max_price_dec: Decimal | None = None
    try:
        if min_price not in (None, ""):
            min_price_dec = Decimal(min_price)
        if max_price not in (None, ""):
            max_price_dec = Decimal(max_price)
    except InvalidOperation:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Parâmetros de preço inválidos.")

    stmt = (
        select(PsychologistProfile)
        .join(User, PsychologistProfile.user_id == User.id)
        .options(selectinload(PsychologistProfile.user))
        .where(PsychologistProfile.is_verified.is_(True))
        .order_by(User.full_name)
    )
    if specialty:
        stmt = stmt.where(PsychologistProfile.specialties.ilike(f"%{specialty}%"))
    if min_price_dec is not None:
        stmt = stmt.where(PsychologistProfile.hourly_rate >= min_price_dec)
    if max_price_dec is not None:
        stmt = stmt.where(PsychologistProfile.hourly_rate <= max_price_dec)
    stmt = stmt.offset(offset).limit(limit)

    profiles = (await db.execute(stmt)).scalars().all()

    # Fetch avg rating and count for all returned profiles in one query
    profile_ids = [p.id for p in profiles]
    rating_rows = (
        await db.execute(
            select(
                Review.psychologist_profile_id,
                sa_func.avg(Review.rating).label("avg_rating"),
                sa_func.count(Review.id).label("review_count"),
            )
            .where(Review.psychologist_profile_id.in_(profile_ids))
            .group_by(Review.psychologist_profile_id)
        )
    ).all()
    rating_map = {r.psychologist_profile_id: r for r in rating_rows}

    items: list[PsychologistListItem] = []
    for profile in profiles:
        user: User | None = profile.user
        rdata = rating_map.get(profile.id)
        items.append(
            PsychologistListItem(
                id=profile.id,
                full_name=user.full_name if user else "",
                crp=profile.crp,
                specialties=profile.specialties,
                hourly_rate=profile.hourly_rate,
                session_duration_minutes=profile.session_duration_minutes,
                is_accepting_patients=profile.is_accepting_patients,
                avatar_url=user.avatar_url if user else None,
                avg_rating=round(float(rdata.avg_rating), 1) if rdata else None,
                review_count=rdata.review_count if rdata else 0,
                gender=profile.gender,
                accent_color=profile.accent_color,
            )
        )
    return items


@router.post(
    "/me/profile",
    response_model=PsychologistProfileRead,
    status_code=status.HTTP_201_CREATED,
    summary="Psicóloga cria seu perfil profissional",
)
async def create_my_profile(
    body: PsychologistProfileCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PsychologistProfileRead:
    if current_user.role != UserRole.psychologist:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Apenas psicólogas podem criar perfil profissional.",
        )

    existing = (
        await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Perfil profissional já existe.")

    existing_crp = (
        await db.execute(select(PsychologistProfile).where(PsychologistProfile.crp == body.crp))
    ).scalar_one_or_none()
    if existing_crp:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="CRP já cadastrado.")

    profile = PsychologistProfile(
        user_id=current_user.id,
        crp=body.crp,
        bio=body.bio,
        specialties=body.specialties,
        hourly_rate=body.hourly_rate,
        session_duration_minutes=body.session_duration_minutes,
        is_accepting_patients=body.is_accepting_patients,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    await db.commit()

    return PsychologistProfileRead(
        id=profile.id,
        user_id=profile.user_id,
        crp=profile.crp,
        bio=profile.bio,
        specialties=profile.specialties,
        hourly_rate=profile.hourly_rate,
        session_duration_minutes=profile.session_duration_minutes,
        is_accepting_patients=profile.is_accepting_patients,
        is_verified=profile.is_verified,
        gender=profile.gender,
        accent_color=profile.accent_color,
    )


@router.put(
    "/me/availability",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Substituir agenda de disponibilidade da psicóloga logada",
)
async def upsert_my_availability(
    payload: AvailabilityUpsertRequest,
    psychologist: CurrentPsychologist,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    profile = (
        await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == psychologist.id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil profissional não encontrado.")

    # Delete only the entries for the requested month — other months are preserved
    await db.execute(
        delete(Availability).where(
            and_(
                Availability.psychologist_profile_id == profile.id,
                extract("year",  Availability.specific_date) == payload.year,
                extract("month", Availability.specific_date) == payload.month,
            )
        )
    )
    for item in payload.items:
        db.add(
            Availability(
                psychologist_profile_id=profile.id,
                specific_date=item.specificDate,
                start_time=item.start,
                end_time=item.end,
                is_active=item.isActive,
            )
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me/profile",
    response_model=PsychologistDetailResponse,
    summary="Retorna o perfil profissional da psicóloga logada",
)
async def get_my_profile(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PsychologistDetailResponse:
    profile = (
        await db.execute(
            select(PsychologistProfile)
            .options(selectinload(PsychologistProfile.availabilities))
            .where(PsychologistProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil profissional não encontrado.")
    return PsychologistDetailResponse(
        profile=PsychologistProfileRead(
            id=profile.id,
            user_id=profile.user_id,
            crp=profile.crp,
            bio=profile.bio,
            specialties=profile.specialties,
            hourly_rate=profile.hourly_rate,
            session_duration_minutes=profile.session_duration_minutes,
            is_accepting_patients=profile.is_accepting_patients,
            is_verified=profile.is_verified,
            gender=profile.gender,
            accent_color=profile.accent_color,
        ),
        availabilities=[
            AvailabilityItemResponse(
                id=a.id,
                specificDate=a.specific_date.isoformat(),
                start=a.start_time.strftime("%H:%M"),
                end=a.end_time.strftime("%H:%M"),
                isActive=a.is_active,
            )
            for a in profile.availabilities
        ],
    )


@router.patch(
    "/me/profile",
    response_model=PsychologistProfileRead,
    summary="Psicóloga atualiza seu perfil profissional",
)
async def update_my_profile(
    body: ProfileUpdateRequest,
    current_user: CurrentPsychologist,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PsychologistProfileRead:
    profile = (
        await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil profissional não encontrado.")

    # Use model_dump(exclude_unset=True) so that fields explicitly sent as null
    # (e.g. bio cleared to "") ARE applied (clearing the field), while fields
    # not included in the request body at all are left unchanged.
    update_data = body.model_dump(exclude_unset=True)
    if "bio" in update_data:
        profile.bio = update_data["bio"]
    if "specialties" in update_data:
        profile.specialties = update_data["specialties"]
    if "hourly_rate" in update_data and update_data["hourly_rate"] is not None:
        profile.hourly_rate = update_data["hourly_rate"]
    if "session_duration_minutes" in update_data and update_data["session_duration_minutes"] is not None:
        profile.session_duration_minutes = update_data["session_duration_minutes"]
    if "is_accepting_patients" in update_data and update_data["is_accepting_patients"] is not None:
        profile.is_accepting_patients = update_data["is_accepting_patients"]
    if "gender" in update_data:
        profile.gender = update_data["gender"]
    if "accent_color" in update_data:
        profile.accent_color = update_data["accent_color"]

    profile.updated_at = datetime.utcnow()
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return PsychologistProfileRead(
        id=profile.id,
        user_id=profile.user_id,
        crp=profile.crp,
        bio=profile.bio,
        specialties=profile.specialties,
        hourly_rate=profile.hourly_rate,
        session_duration_minutes=profile.session_duration_minutes,
        is_accepting_patients=profile.is_accepting_patients,
        is_verified=profile.is_verified,
        gender=profile.gender,
        accent_color=profile.accent_color,
    )


@router.get(
    "/admin/pending",
    response_model=list[PsychologistListItem],
    summary="[Admin] Listar psicólogas aguardando verificação",
)
async def list_pending_psychologists(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[PsychologistListItem]:
    if current_user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Apenas administradores.")

    profiles = (
        await db.execute(
            select(PsychologistProfile)
            .join(User, PsychologistProfile.user_id == User.id)
            .options(selectinload(PsychologistProfile.user))
            .where(PsychologistProfile.is_verified.is_(False))
            .order_by(PsychologistProfile.id)
        )
    ).scalars().all()

    items: list[PsychologistListItem] = []
    for profile in profiles:
        user: User | None = profile.user
        items.append(
            PsychologistListItem(
                id=profile.id,
                full_name=user.full_name if user else "",
                crp=profile.crp,
                specialties=profile.specialties,
                hourly_rate=profile.hourly_rate,
                session_duration_minutes=profile.session_duration_minutes,
                is_accepting_patients=profile.is_accepting_patients,
                avatar_url=user.avatar_url if user else None,
                gender=profile.gender,
                accent_color=profile.accent_color,
            )
        )
    return items


# Rotas parametrizadas --------------------------------------------------------


@router.get(
    "/undefined",
    status_code=status.HTTP_400_BAD_REQUEST,
    summary="ID ausente",
)
async def psychologist_id_missing() -> dict:
    """Handler explícito para chamadas malformadas (/undefined) vindas do frontend."""
    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="ID de psicóloga ausente.")


@router.get(
    "/{psychologist_id}",
    response_model=PsychologistDetailResponse,
    summary="Detalhes de uma psicóloga específica",
)
async def get_psychologist_detail(
    psychologist_id: UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PsychologistDetailResponse:
    profile = (
        await db.execute(
            select(PsychologistProfile)
            .where(PsychologistProfile.id == psychologist_id)
            .options(selectinload(PsychologistProfile.user))
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado.")

    availabilities = (
        await db.execute(
            select(Availability).where(Availability.psychologist_profile_id == profile.id)
        )
    ).scalars().all()

    from app.models.domain import UserRead as _UserRead

    return PsychologistDetailResponse(
        profile=PsychologistProfileRead(
            id=profile.id,
            user_id=profile.user_id,
            crp=profile.crp,
            bio=profile.bio,
            specialties=profile.specialties,
            hourly_rate=profile.hourly_rate,
            session_duration_minutes=profile.session_duration_minutes,
            is_accepting_patients=profile.is_accepting_patients,
            is_verified=profile.is_verified,
            gender=profile.gender,
            accent_color=profile.accent_color,
            user=_UserRead(
                id=profile.user.id,
                **profile.user.model_dump(exclude={"id", "hashed_password"}),
            ) if profile.user else None,
        ),
        availabilities=[
            AvailabilityItemResponse(
                id=a.id,
                specificDate=a.specific_date.isoformat(),
                start=a.start_time.strftime("%H:%M"),
                end=a.end_time.strftime("%H:%M"),
                isActive=a.is_active,
            )
            for a in availabilities
        ],
    )


@router.get(
    "/{psychologist_id}/slots",
    response_model=list[SlotRead],
    summary="Slots disponíveis de uma psicóloga em um dia",
)
async def list_available_slots(
    psychologist_id: UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
    day: date = Query(..., description="Data alvo no formato YYYY-MM-DD"),
    tz: str = Query(default="America/Sao_Paulo", description="Timezone IANA para cálculo dos horários"),
) -> list[SlotRead]:
    try:
        slots = await get_available_slots(
            db,
            psychologist_profile_id=psychologist_id,
            day=day,
            tz=tz,
        )
    except PsychologistNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Psicóloga não encontrada.")

    return [
        SlotRead(
            start=slot.start.isoformat() + "Z",
            end=slot.end.isoformat() + "Z",
            duration_minutes=slot.duration_minutes,
            status="reserved" if slot.booked else "available",
        )
        for slot in slots
    ]


@router.post(
    "/{psychologist_id}/verify",
    response_model=PsychologistProfileRead,
    summary="[Admin] Verificar ou revogar CRP de uma psicóloga",
)
async def verify_psychologist(
    psychologist_id: UUID,
    body: VerifyRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PsychologistProfileRead:
    if current_user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Apenas administradores.")

    profile = (
        await db.execute(select(PsychologistProfile).where(PsychologistProfile.id == psychologist_id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado.")

    profile.is_verified = body.approve
    profile.updated_at = datetime.utcnow()
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return PsychologistProfileRead(
        id=profile.id,
        user_id=profile.user_id,
        crp=profile.crp,
        bio=profile.bio,
        specialties=profile.specialties,
        hourly_rate=profile.hourly_rate,
        session_duration_minutes=profile.session_duration_minutes,
        is_accepting_patients=profile.is_accepting_patients,
        is_verified=profile.is_verified,
        gender=profile.gender,
        accent_color=profile.accent_color,
    )


@router.patch(
    "/{psychologist_id}/verify",
    response_model=PsychologistProfileRead,
    summary="[Admin] Verificar ou revogar CRP de uma psicóloga (PATCH compatível)",
)
async def verify_psychologist_patch(
    psychologist_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_session)],
    verified: bool = Query(..., description="true para aprovar, false para revogar"),
) -> PsychologistProfileRead:
    """
    Suporta o padrão usado pelo frontend (método PATCH com query `verified=true|false`).
    """
    return await verify_psychologist(
        psychologist_id=psychologist_id,
        body=VerifyRequest(approve=verified),
        current_user=current_user,
        db=db,
    )
