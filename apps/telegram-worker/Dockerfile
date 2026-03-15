# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1
WORKDIR /build

COPY apps/telegram-worker /build
RUN pip install --prefix=/install .

FROM python:3.11-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY --from=builder /install /usr/local
COPY apps/telegram-worker /app

EXPOSE 8080
CMD ["python", "main.py"]
