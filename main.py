"""
main.py — entry point
uvicorn main:app --reload
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel

from app.api.v1 import v1_router
from app.core.config import settings
from app.db.session import engine
from app.services.scheduler import shutdown_scheduler, start_scheduler

os.makedirs("static/avatars", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
)

# ── JWT secret mínimo de segurança ────────────────────────────────────────────
if len(settings.jwt_secret_key) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY deve ter no mínimo 32 caracteres. "
        "Gere com: openssl rand -hex 32"
    )

# ── CORS via variável de ambiente ─────────────────────────────────────────────
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app = FastAPI(
    title="Marketplace de Psicologia",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"], include_in_schema=False)
async def health_check() -> JSONResponse:
    """Liveness probe — usado por load balancers e Docker healthcheck."""
    try:
        from sqlalchemy import text
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    ok = db_status == "ok"
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", "db": db_status},
    )


@app.on_event("startup")
async def on_startup() -> None:
    """Cria tabelas em dev/preview (sem Alembic). Em produção use migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    shutdown_scheduler()
