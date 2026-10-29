#!/usr/bin/env bash
# Copied over SSH by CI; stdin carries the job's temporary read-only token.
set -euo pipefail

if [ "$#" -ne 2 ] || [[ ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'ERROR: expected a checkout path and full verified commit SHA.' >&2
  exit 1
fi
IFS= read -r github_token
test -n "$github_token"
cd "$1"
DEPLOY_COMMIT="$2"
exec 9>"$(git rev-parse --git-path staging-deploy.lock)"
flock -n 9 || { echo 'ERROR: another staging deployment is running.' >&2; exit 1; }

# Source only in a subshell: PM2 must not retain a snapshot of these values.
if ! (
  . ./.env.production
  [ "${APP_ENV:-}" = staging ] && [ "${APP_DOMAIN:-}" = dev.support-b.com ]
); then
  echo 'ERROR: this checkout must use the dev.support-b.com staging configuration.' >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo 'ERROR: staging checkout has local changes; refusing to overwrite them.' >&2
  exit 1
fi
DEPLOYED_FILE="$(git rev-parse --git-path staging-deployed)"
DEPLOY_PREVIOUS_REV="$(cat "$DEPLOYED_FILE" 2>/dev/null || git rev-parse HEAD)"
export DEPLOY_COMMIT DEPLOY_PREVIOUS_REV

GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 \
  GIT_CONFIG_KEY_0=http.https://github.com/bothsides-platform-dev/supporter-b.git.extraheader \
  GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$github_token" | base64 | tr -d '\n')" \
  git fetch origin dev
unset github_token
if [ "$(git rev-parse origin/dev)" != "$DEPLOY_COMMIT" ]; then
  echo "Skipping superseded dev commit $DEPLOY_COMMIT"
  exit 0
fi
if ! git diff --quiet "$DEPLOY_PREVIOUS_REV" "$DEPLOY_COMMIT" -- lib/db/schema scripts/migrations scripts/sql docs/migrations drizzle.config.ts; then
  SCHEMA_READY_FILE="$(git rev-parse --git-path staging-schema-ready)"
  if [ "$(cat "$SCHEMA_READY_FILE" 2>/dev/null || true)" != "$DEPLOY_COMMIT" ]; then
    echo 'ERROR: database changes need applying first; record the target SHA in .git/staging-schema-ready.' >&2
    exit 1
  fi
fi
# Preserve the schema baseline across a failed first build and its retry.
if [ ! -f "$DEPLOYED_FILE" ]; then
  printf '%s\n' "$DEPLOY_PREVIOUS_REV" > "$DEPLOYED_FILE"
fi
git checkout --detach "$DEPLOY_COMMIT"
# The wrapper holds the lock; PM2 and its long-lived children must not inherit it.
bash scripts/deploy/lightsail-deploy.sh 9>&-
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 \
  --max-time 10 --output /dev/null http://127.0.0.1:3000/api/auth/session
printf '%s\n' "$DEPLOY_COMMIT" > "$DEPLOYED_FILE"
echo "Staging deployed: $DEPLOY_COMMIT"
