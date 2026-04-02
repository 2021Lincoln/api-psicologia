"""
app/api/v1/video.py
--------------------
GET /api/v1/video/appointments/{id}/room-access
    Token Daily.co liberado apenas ≤ 10 min antes da sessão.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.db.session import get_session
from app.services.video import (
    JOIN_WINDOW_MINUTES,
    AppointmentAccessDenied,
    RoomNotReady,
    TooEarlyToJoin,
    get_room_access,
)

router = APIRouter(prefix="/video", tags=["Video"])


class RoomAccessResponse(BaseModel):
    meeting_token: str
    room_url: str
    expires_at: datetime
    is_owner: bool


@router.get(
    "/appointments/{appointment_id}/room-access",
    response_model=RoomAccessResponse,
    summary="Token de acesso à videochamada",
    description=(
        f"Liberado apenas quando faltam ≤ **{JOIN_WINDOW_MINUTES} minutos** "
        "para a consulta. A psicóloga recebe token com permissões de host."
    ),
)
async def get_video_access(
    appointment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_session),
) -> RoomAccessResponse:
    """Entrega token Daily.co quando estiver no intervalo permitido e o usuário tem acesso."""
    try:
        access = await get_room_access(
            db_session=db,
            appointment_id=appointment_id,
            requesting_user_id=current_user.id,
            requesting_user_name=current_user.full_name,
        )
    except RoomNotReady as e:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(e))
    except AppointmentAccessDenied as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=str(e))
    except TooEarlyToJoin as e:
        raise HTTPException(
            status_code=425,
            detail={
                "message": str(e),
                "starts_in_minutes": int(e.starts_in.total_seconds() / 60),
                "join_window_minutes": JOIN_WINDOW_MINUTES,
            },
        )

    return RoomAccessResponse(
        meeting_token=access.meeting_token,
        room_url=access.room_url,
        expires_at=access.expires_at,
        is_owner=access.is_owner,
    )
