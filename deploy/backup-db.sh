#!/bin/bash
# Backup diário do banco school_db
# Cron: 0 3 * * * /opt/school-backend/deploy/backup-db.sh

BACKUP_DIR="/opt/backups/school"
mkdir -p $BACKUP_DIR

pg_dump -U school school_db | gzip > "$BACKUP_DIR/school_$(date +%Y%m%d).sql.gz"

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
