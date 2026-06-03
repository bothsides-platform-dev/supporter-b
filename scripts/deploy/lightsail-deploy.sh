#!/usr/bin/env bash
# Build + release the app on an AWS Lightsail "Amazon Linux 2023" instance.
# Run from the repo root after lightsail-bootstrap.sh and after .env.production
# is filled in.
#
#   bash scripts/deploy/lightsail-deploy.sh
#
# Re-runnable: pulls latest, installs deps, brings up Postgres, rebuilds,
# reloads PM2. Schema sync is NOT done here — see the "Schema" note below.
# Caddy is supervised separately by systemd and is NOT touched here (config
# changes: edit /etc/caddy and `sudo systemctl reload caddy`).
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production missing. cp .env.production.example .env.production and fill it." >&2
  exit 1
fi

# Export prod env so the build sees NEXT_PUBLIC_* values (and so a manual
# `pnpm db:push` picks up DATABASE_URL). Next also auto-loads .env.production;
# belt-and-suspenders.
log "Loading .env.production"
set -a; . ./.env.production; set +a

log "Pulling latest"
git pull --ff-only

log "Installing dependencies (frozen lockfile, pnpm 9)"
pnpm install --frozen-lockfile

log "Ensuring Postgres container is up"
docker compose -f docker-compose.prod.yml up -d
# Wait for Postgres to accept connections before the app starts.
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T pg \
       pg_isready -U "${POSTGRES_USER:-supporter_b}" >/dev/null 2>&1; then
    break
  fi
  [ "$i" = "30" ] && { echo "Postgres did not become ready in time" >&2; exit 1; }
  sleep 1
done

# ── Schema ───────────────────────────────────────────────────────────────
# No automatic migration here. We run push-only for now, and a non-interactive
# `drizzle-kit push --force` would apply destructive diffs (DROP / type changes)
# to prod WITHOUT review. So when the schema changed, sync it MANUALLY *before*
# deploying and review the plan:
#
#     set -a; . ./.env.production; set +a
#     pnpm db:push        # review: additive → Yes; DROP / data-loss → abort
#
# Skipping this when the schema is unchanged is safe (push detects no changes).
# TODO(추후 과제): restore an append-only `pnpm db:migrate` flow — freeze 0000
# and stop regenerating its `when` — so schema sync becomes automatic and
# auditable again. Until then, this manual reviewed push is the contract.

# Cap V8 heap below total RAM so the build hits GC before the OOM-killer. On a
# 2GB box (+4GB swap) 1536MB leaves headroom for Postgres and the OS during build.
log "Building (NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_HEAP_MB:-1536})"
NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_HEAP_MB:-1536}" pnpm build

log "Reloading PM2"
if pm2 describe bidit >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

log "Deploy complete. App on 127.0.0.1:3000 (Caddy serves it on 443)."
