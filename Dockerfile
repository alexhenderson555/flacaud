FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Install deps first (cacheable layer).
COPY pyproject.toml uv.lock ./
RUN uv sync --no-install-project --no-dev

# Then app code.
COPY src ./src
RUN uv sync --no-dev


FROM python:3.12-slim

# ffmpeg is required by yt-dlp's audio postprocessing.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src
COPY frontend /app/frontend

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1

# Pool DB / jobs persistence (overridden via compose volumes).
RUN mkdir -p /var/lib/tidal-dl-ru/jobs /root/.config/tidal-dl-ru

EXPOSE 8000

# Default — overridden by docker-compose for the worker service.
CMD ["uvicorn", "tidal_dl_ru.server.app:app", "--host", "0.0.0.0", "--port", "8000"]
