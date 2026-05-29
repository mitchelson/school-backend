#!/bin/bash
# Backup diário do banco school_db (usa DATABASE_URL do .env.production)
# Cron sugerido: 30 3 * * * /opt/school-backend/deploy/backup-db.sh >> /var/log/school-backup.log 2>&1

set -euo pipefail

APP_DIR="/opt/school-backend"
BACKUP_DIR="/opt/backups/school"
mkdir -p "$BACKUP_DIR"

ENV_FILE="${APP_DIR}/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ ${ENV_FILE} não encontrado"
  exit 1
fi

DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL ausente em ${ENV_FILE}"
  exit 1
fi

# pg_dump não aceita ?schema=public do Prisma
PG_URL="${DATABASE_URL%%\?*}"

pg_dump "$PG_URL" | gzip > "$BACKUP_DIR/school_$(date +%Y%m%d).sql.gz"

# Manter apenas últimos 7 dias
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "✅ Backup: $BACKUP_DIR/school_$(date +%Y%m%d).sql.gz"
