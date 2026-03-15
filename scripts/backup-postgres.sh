#!/bin/sh
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=ai_sales_assistant}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=7}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting PostgreSQL backup to ${BACKUP_FILE}"
pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE}"

find "${BACKUP_DIR}" -type f -name "${POSTGRES_DB}_*.dump" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup finished"
