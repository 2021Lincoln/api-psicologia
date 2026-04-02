"""Rate limiting via FastAPI Dependency — sem alterar assinaturas de funções."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Callable

from fastapi import HTTPException, Request, status


def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class _RateLimiter:
    """Rate limiter in-memory simples. Para produção use Redis."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)

    def dependency(self, max_calls: int, window_seconds: int = 60) -> Callable:
        """Retorna uma FastAPI Dependency que bloqueia se o limite for excedido."""

        def check(request: Request) -> None:
            ip = _get_ip(request)
            key = f"{request.url.path}:{ip}"
            now = datetime.utcnow().timestamp()

            # Remove chamadas fora da janela
            self._hits[key] = [t for t in self._hits[key] if now - t < window_seconds]

            if len(self._hits[key]) >= max_calls:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Muitas tentativas. Aguarde {window_seconds} segundos.",
                )
            self._hits[key].append(now)

        return check


_limiter = _RateLimiter()


def rate_limit(max_calls: int, window_seconds: int = 60) -> Callable:
    """Atalho: `Depends(rate_limit(5, 60))` → max 5 chamadas por minuto por IP."""
    return _limiter.dependency(max_calls, window_seconds)
