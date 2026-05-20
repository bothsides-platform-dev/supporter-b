#!/usr/bin/env bash
# Build + release the app on the instance. Run from the repo root after
# bootstrap.sh and after .env.production is filled in.
#
#   bash scripts/deploy/deploy.sh
#
# Re-runnable: pulls latest, installs deps, migrates DB, rebuilds, reloads PM2.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production missing. cp .env.production.example .env.production and fill it." >&2
  exit 1
fi

# Export prod env for drizzle-kit (db:migrate) and to guarantee the build sees
# NEXT_PUBLIC_BASE_URL. Next also auto-loads .env.production; this is belt-and-suspenders.
log "Loading .env.production"
set -a; . ./.env.production; set +a

log "Pulling latest"
git pull --ff-only

log "Installing dependencies (frozen lockfile, pnpm 9)"
pnpm install --frozen-lockfile

log "Ensuring Postgres container is up"
docker compose -f docker-compose.prod.yml up -d
# Wait for Postgres to accept connections before migrating.
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T pg pg_isready -U "${POSTGRES_USER:-supporter_b}" >/dev/null 2>&1; then
    break
  fi
  [ "$i" = "30" ] && { echo "Postgres did not become ready in time" >&2; exit 1; }
  sleep 1
done

log "Running migrations"
pnpm db:migrate

log "Building"
pnpm build

log "Reloading PM2"
if pm2 describe bidit >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

log "Deploy complete. App on 127.0.0.1:3000 (Caddy serves it on 443)."
