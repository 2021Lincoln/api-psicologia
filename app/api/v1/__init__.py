from fastapi import APIRouter

from app.api.v1 import admin, appointments, auth, notes, payments, psychologists, reviews, transcripts, video, ws_scribe

v1_router = APIRouter(prefix="/api/v1")

v1_router.include_router(auth.router)
v1_router.include_router(admin.router)
v1_router.include_router(psychologists.router)
v1_router.include_router(appointments.router)
v1_router.include_router(payments.router)
v1_router.include_router(video.router)
v1_router.include_router(reviews.router)
v1_router.include_router(notes.router)
v1_router.include_router(transcripts.router)
v1_router.include_router(ws_scribe.router)
