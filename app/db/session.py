"""
app/db/session.py
-----------------
Async SQLAlchemy engine and session factory.

Usage in FastAPI endpoints
--------------------------
    from app.db.session import get_session
    from typing import Annotated
    from fastapi import Depends
    from sqlalchemy.ext.asyncio import AsyncSession

    async def endpoint(db: Annotated[AsyncSession, Depends(get_session)]):
        ...
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
# pool_pre_ping=True — drops stale connections automatically (important for
# long-lived processes behind a load-balancer that closes idle connections).
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,   # avoids lazy-load errors after commit
    autoflush=False,
    autocommit=False,
)


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an AsyncSession per request, rolling back on any unhandled exception.

    Callers that need explicit transaction control should use:
        async with db.begin(): ...
    rather than relying on autocommit.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
