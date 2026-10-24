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

# ── Runtime env: `.env.production` 파일이 단일 출처 ─────────────────────────
# 여기서 .env.production 을 셸 전역에 export 하지 않는다. PM2 는 프로세스를 띄운
# 시점의 셸 env 를 스냅샷해 restart/reload 에서 재사용하고(`pm2 save` 로 dump 에도
# 영속), 프로세스 env 는 `next start` 가 부팅 때 읽는 .env.production 파일보다
# 우선한다. 과거에 전역 export + `--update-env` 조합이 구 도메인 AUTH_URL 을 PM2 에
# 박제해, 파일을 고쳐도 반영되지 않는 장애를 만들었다. env 가 필요한 단계(빌드의
# NEXT_PUBLIC_* 인라인 등)만 서브셸로 국한한다.

. scripts/deploy/node-version.sh

# 실패한 배포를 다시 돌려도 아래 Centrifugo 설정 비교가 처음 시작한 리비전을
# 기준으로 하도록, 배포가 끝날 때까지 시작 리비전을 .git 아래에 남긴다.
REV_STATE="$(git rev-parse --git-path deploy-previous-rev)"
if [ -s "$REV_STATE" ]; then
  PREVIOUS_REV="$(cat "$REV_STATE")"
  log "Resuming an unfinished deploy started at $PREVIOUS_REV"
else
  PREVIOUS_REV="$(git rev-parse HEAD)"
  printf '%s\n' "$PREVIOUS_REV" > "$REV_STATE"
fi

# engine-strict 는 서버 Node 가 새 고정 버전보다 낮으면 pnpm install 을 막는다.
# HEAD 를 옮기기 전에, 들어올 mise.toml 의 고정 버전으로 먼저 확인한다.
log "Checking Node against the incoming mise.toml"
git fetch --quiet
WANT_NODE="$(git show '@{upstream}:mise.toml' | pinned_node_version)" || {
  echo "ERROR: no node pin in the upstream mise.toml" >&2
  exit 1
}
if ! node_satisfies_pin "$(node -v)" "$WANT_NODE"; then
  echo "ERROR: Node $(node -v) is below the incoming pin $WANT_NODE. Install it first: NODE_VERSION=$WANT_NODE bash scripts/deploy/lightsail-bootstrap.sh (docs/DEPLOY_LIGHTSAIL.md, Node 설치)." >&2
  exit 1
fi

log "Pulling latest"
git pull --ff-only

log "Installing dependencies (frozen lockfile, pnpm 9)"
pnpm install --frozen-lockfile

log "Ensuring Postgres container is up"
# --env-file: compose 인터폴레이션(${POSTGRES_PASSWORD:?} 등)에 필요한 값을 셸에
# export 하지 않고 컨테이너 정의에만 공급한다.
docker compose --env-file ./.env.production -f docker-compose.prod.yml up -d

# subscribe ACL은 connection JWT의 server-only meta를 요구한다. config가
# include_connection_meta를 켜는 릴리스에서는 새 앱보다 Centrifugo를 먼저
# 재시작해야 한다: 구 앱은 추가 meta를 무시하지만, 새 앱 + 구 proxy 조합은 모든
# 구독을 fail-closed 거부한다. 이후 config 변경도 같은 안전 순서를 자동으로 따른다.
if ! git diff --quiet "$PREVIOUS_REV" HEAD -- deploy/centrifugo/config.yaml; then
  log "Reloading changed Centrifugo config before the app"
  docker compose --env-file ./.env.production -f docker-compose.prod.yml restart centrifugo
fi

# Wait for Postgres to accept connections before the app starts.
PG_USER="$( ( set -a; . ./.env.production; set +a; echo "${POSTGRES_USER:-supporter_b}" ) )"
for i in $(seq 1 30); do
  if docker compose --env-file ./.env.production -f docker-compose.prod.yml exec -T pg \
       pg_isready -U "$PG_USER" >/dev/null 2>&1; then
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

# ── Business calendar ───────────────────────────────────────────────────
# 영업일 견적 마감은 기능 플래그 없이 항상 적용된다. 필요한 연도의 달력이 없으면
# 새 상담 요청·마감 변경·재요청이 CALENDAR_UNAVAILABLE 로 막히므로, 새 코드를
# 띄우기 전에 적재하고 coverage 를 확인한다. 공휴일 API 장애는 경고만 하고
# (이미 적재된 달력으로 충분할 수 있다) coverage 가 비었을 때만 중단한다.
# 달력 테이블 DDL(scripts/migrations/business-calendar.sql)은 이 단계보다 먼저다.
# 비상 우회: SKIP_CALENDAR_CHECK=1 — docs/BUSINESS_DEADLINES_ROLLOUT.md 참조.
if [ "${SKIP_CALENDAR_CHECK:-}" = "1" ]; then
  echo "WARN: SKIP_CALENDAR_CHECK=1 — business calendar sync/check skipped" >&2
else
  log "Syncing Korean business calendar"
  node --env-file=.env.production --import tsx scripts/calendar/sync.ts \
    || echo "WARN: calendar sync failed — checking the last loaded calendar" >&2
  log "Checking business calendar coverage"
  node --env-file=.env.production --import tsx scripts/calendar/check.ts || {
    echo "ERROR: business calendar check failed (a needed year is missing, the calendar DDL is not applied, or the DB is unreachable). Not deploying. See docs/BUSINESS_DEADLINES_ROLLOUT.md" >&2
    exit 1
  }
fi

# Cap V8 heap below total RAM so the build hits GC before the OOM-killer. On a
# 2GB box (+4GB swap) 1536MB leaves headroom for Postgres and the OS during build.
# 서브셸: 빌드가 NEXT_PUBLIC_* 를 인라인하도록 env 를 빌드에만 노출한다.
log "Building"
(
  set -a; . ./.env.production; set +a
  NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_HEAP_MB:-1536}" pnpm build
)

# PM2 는 깨끗한 셸 env 에서 기동/리로드한다 — 앱 런타임 env 는 next start 가
# .env.production 에서 직접 읽는다. `--update-env` 를 쓰지 않는다: 셸에 export 된
# 값을 프로세스 env 로 캡처해 이후 파일 수정을 영구히 가리는 박제를 만든다.
log "Reloading PM2"
if pm2 describe bidit >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
rm -f "$REV_STATE"

log "Deploy complete. App on 127.0.0.1:3000 (Caddy serves it on 443)."
