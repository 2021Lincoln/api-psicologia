# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — builder
# Instala dependências de produção com Poetry e exporta para requirements.txt
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.3 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_CREATE=false

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -sSL https://install.python-poetry.org | python3 - \
    && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

ENV PATH="$POETRY_HOME/bin:$PATH"

WORKDIR /build
COPY pyproject.toml poetry.lock* ./

# Export only prod dependencies (no dev/test)
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes --only main

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime
# Imagem mínima: só o necessário para rodar em produção
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Cria usuário não-root (princípio do menor privilégio)
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# Instala dependências a partir do requirements.txt gerado na stage anterior
COPY --from=builder /build/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação
COPY --chown=app:app . .

USER app

EXPOSE 8000

# Uvicorn com workers baseado em CPUs disponíveis
# --forwarded-allow-ips=* necessário atrás de proxies (nginx, Render, Railway)
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*"]
