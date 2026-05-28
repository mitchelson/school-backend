#!/usr/bin/env bash
# Pós-deploy na VPS (migrations + PM2). Mesmo padrão do zenvix-store: Node via nvm, sem npm no CI SSH.
set -euo pipefail

APP_DIR="/opt/school-backend"

export NVM_DIR="${NVM_DIR:-/root/.nvm}"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
PM2_BIN="${PM2_BIN:-$(command -v pm2 || true)}"

if [ -z "${NODE_BIN}" ] || [ -z "${PM2_BIN}" ]; then
  echo "❌ Node ou PM2 não encontrado."
  echo "   Na VPS (como root): instale nvm + Node + pm2 global, igual ao zenvix-store."
  echo "   Ex.: nvm install 20 && npm i -g pm2"
  exit 127
fi

echo "→ node: ${NODE_BIN} ($(${NODE_BIN} -v))"
echo "→ pm2:  ${PM2_BIN}"

cd "${APP_DIR}"

if [ ! -f .env.production ]; then
  echo "❌ Arquivo .env.production ausente em ${APP_DIR}"
  exit 1
fi

ln -sf .env.production .env

db_url_from_env() {
  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "${DATABASE_URL}"
    return 0
  fi
  grep '^DATABASE_URL=' .env.production 2>/dev/null | cut -d= -f2- | tr -d '"'
}

run_sql_file() {
  local sql_file="$1"
  local db_url
  db_url="$(db_url_from_env)"
  if [ -z "${db_url}" ]; then
    echo "❌ DATABASE_URL ausente para ${sql_file}"
    return 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "❌ psql necessário para ${sql_file}"
    return 1
  fi
  psql "${db_url}" -v ON_ERROR_STOP=1 -f "${sql_file}"
}

repair_failed_migration() {
  local migration="$1"
  case "${migration}" in
    20260528140500_class_series)
      echo "==> Reparando schema class_series..."
      run_sql_file deploy/ensure-class-series.sql
      ;;
    *)
      echo "❌ Sem reparo automático para ${migration}"
      return 1
      ;;
  esac
}

run_prisma_migrate() {
  PATH="$(dirname "${NODE_BIN}"):${PATH}"
  local log
  log="$(mktemp)"
  if ./node_modules/.bin/prisma migrate deploy 2>&1 | tee "${log}"; then
    rm -f "${log}"
    return 0
  fi
  if grep -q 'P3005' "${log}"; then
    echo "==> Banco school_db já tem tabelas (ex.: criado antes das migrations)."
    echo "==> Baseline: marcando 20250327000000_init como aplicada..."
    ./node_modules/.bin/prisma migrate resolve --applied 20250327000000_init
    rm -f "${log}"
    ./node_modules/.bin/prisma migrate deploy
    return $?
  fi
  if grep -q 'P3009' "${log}"; then
    local failed_migration
    failed_migration="$(sed -n 's/.*The `\([^`]*\)` migration.*failed.*/\1/p' "${log}" | head -1)"
    if [ -n "${failed_migration}" ]; then
      echo "==> Migration ${failed_migration} falhou antes (P3009). Reparando..."
      if repair_failed_migration "${failed_migration}"; then
        echo "==> Marcando ${failed_migration} como aplicada..."
        ./node_modules/.bin/prisma migrate resolve --applied "${failed_migration}"
        rm -f "${log}"
        ./node_modules/.bin/prisma migrate deploy
        return $?
      fi
    fi
  fi
  rm -f "${log}"
  return 1
}

echo "==> Prisma migrate deploy..."
run_prisma_migrate

if [ -n "$(db_url_from_env)" ]; then
  echo "==> Garantindo PlatformSetting e colunas MP no User..."
  run_sql_file deploy/ensure-platform-settings.sql || true
fi

echo "==> PM2 reload..."
"${PM2_BIN}" reload ecosystem.config.js --env production --update-env \
  || "${PM2_BIN}" start ecosystem.config.js --env production
"${PM2_BIN}" save

echo "✅ school-backend em produção ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
