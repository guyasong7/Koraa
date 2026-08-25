FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# libpq for psycopg, build-essential for any wheels that need compiling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Collected at build time so the running container needs no write access to
# STATIC_ROOT. The dummy values only have to satisfy the production settings
# checks; nothing here is baked into the image beyond the static files.
# REDIS_URL is one of those checks — production refuses to boot on a
# per-process cache — and a URL is enough, because Django's Redis backend
# connects lazily and collectstatic never touches the cache.
RUN DJANGO_SETTINGS_MODULE=config.settings.production \
    SECRET_KEY="build-time-placeholder-not-used-at-runtime-000000000000000" \
    ALLOWED_HOSTS="build.invalid" \
    DATABASE_URL="postgresql://u:p@127.0.0.1:5432/db" \
    REDIS_URL="redis://127.0.0.1:6379/0" \
    python manage.py collectstatic --noinput

# Run unprivileged. media/ is a mount point, so it must be writable by appuser.
RUN useradd --create-home --shell /bin/bash appuser \
    && mkdir -p /app/media \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/schema/ -o /dev/null || exit 1

# Two workers per core plus one is the usual starting point; override
# GUNICORN_WORKERS to match the host. --timeout covers the Fapshi calls, which
# use a 15s request timeout of their own.
CMD ["sh", "-c", "gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers ${GUNICORN_WORKERS:-3} \
  --threads ${GUNICORN_THREADS:-2} \
  --timeout ${GUNICORN_TIMEOUT:-60} \
  --graceful-timeout 30 \
  --access-logfile - \
  --error-logfile - \
  --log-level ${GUNICORN_LOG_LEVEL:-info}"]
