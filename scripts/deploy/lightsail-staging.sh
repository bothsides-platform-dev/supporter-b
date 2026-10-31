#!/usr/bin/env bash
# Activate a CI-built standalone archive. No source checkout or build tools.
set -euo pipefail
if [ "$#" -ne 3 ] || [[ ! "$2" =~ ^[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*$ ]] || [[ ! "$3" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'ERROR: expected deployment root, release ID and SHA-256 digest.' >&2
  exit 1
fi
ROOT="$(cd "$1" && pwd)"
RELEASE_ID="$2"
ARCHIVE="$ROOT/incoming/$RELEASE_ID.tar.gz"
RELEASE="$ROOT/releases/$RELEASE_ID"
ENV_FILE="$ROOT/shared/.env.production"
exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo 'ERROR: another deployment is running.' >&2; exit 1; }
node - "$ENV_FILE" <<'NODE'
const env = require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (env.APP_ENV !== 'staging' || env.APP_DOMAIN !== 'dev.support-b.com') {
  throw new Error('Only the isolated dev.support-b.com environment can be deployed here.');
}
NODE
node - "$ARCHIVE" "$3" <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
if (createHash('sha256').update(readFileSync(process.argv[2])).digest('hex') !== process.argv[3]) {
  console.error('ERROR: artifact digest does not match CI.');
  process.exit(1);
}
NODE

link_current() {
  node - "$ROOT" "$1" <<'NODE'
const fs = require('node:fs');
const [root, release] = process.argv.slice(2);
const temporary = `${root}/.current-${process.pid}`;
fs.symlinkSync(`releases/${release}`, temporary);
fs.renameSync(temporary, `${root}/current`);
NODE
}
compose() {
  docker compose -p bidit-staging --env-file "$ENV_FILE" -f "$1/.ops/docker-compose.yml" up -d
}
PREVIOUS="$(readlink "$ROOT/current" 2>/dev/null || true)"
PROMOTED=0
INFRA_CHANGED=0
CANARY_PID=''
UNPACKED=''
stop_canary() {
  if [ -n "$CANARY_PID" ]; then
    kill "$CANARY_PID" 2>/dev/null || true
    wait "$CANARY_PID" 2>/dev/null || true
    CANARY_PID=''
  fi
}
finish() {
  result=$?
  trap - EXIT
  stop_canary
  if [ -n "$UNPACKED" ]; then rm -rf "$UNPACKED"; fi
  if [ "$result" -ne 0 ] && [ "$INFRA_CHANGED" = 1 ]; then
    set +e
    if [ -n "$PREVIOUS" ]; then
      compose "$ROOT/$PREVIOUS"
      if [ "$PROMOTED" = 1 ]; then
        link_current "${PREVIOUS#releases/}"
        sudo systemctl restart supporter-b-staging
        if curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 --max-time 10 --output /dev/null http://127.0.0.1:3000/api/auth/session; then
          echo "Rolled back to $PREVIOUS" >&2
        else
          echo 'ERROR: rollback requires operator attention.' >&2
        fi
      fi
    elif [ "$PROMOTED" = 1 ]; then
      sudo systemctl stop supporter-b-staging
      rm "$ROOT/current"
    fi
  fi
  exit "$result"
}
trap finish EXIT
mkdir -p "$ROOT/releases"
if [ -d "$RELEASE" ]; then
  if [ "$(cat "$RELEASE/.artifact-sha256" 2>/dev/null)" != "$3" ]; then
    echo 'ERROR: refusing to overwrite an immutable release.' >&2
    exit 1
  fi
else
  UNPACKED="$(mktemp -d "$ROOT/.unpack-XXXXXX")"
  tar -xzf "$ARCHIVE" -C "$UNPACKED"
  printf '%s\n' "$3" > "$UNPACKED/.artifact-sha256"
  mv "$UNPACKED" "$RELEASE"
  UNPACKED=''
fi
ACTION="$(node - "$ROOT" "$RELEASE_ID" <<'NODE'
const fs = require('node:fs');
const [root, id] = process.argv.slice(2);
const candidate = JSON.parse(fs.readFileSync(`${root}/releases/${id}/.release.json`, 'utf8'));
const build = fs.readFileSync(`${root}/releases/${id}/.next/BUILD_ID`, 'utf8').trim();
if (candidate.releaseId !== id || candidate.sha !== id.split('-')[0] || build !== candidate.sha ||
    candidate.runNumber !== Number(id.split('-')[1]) || !/^[0-9a-f]{64}$/.test(candidate.schema)) {
  throw new Error('The artifact manifest and build identity must match the CI release.');
}
const previous = fs.existsSync(`${root}/current/.release.json`)
  ? JSON.parse(fs.readFileSync(`${root}/current/.release.json`, 'utf8')) : null;
if (previous && (previous.runNumber > candidate.runNumber || previous.releaseId === id ||
    (previous.runNumber === candidate.runNumber && Number(previous.releaseId.split('-')[2]) > Number(id.split('-')[2])))) {
  console.log('skip');
  process.exit(0);
}
const receipt = fs.existsSync(`${root}/shared/schema-ready`)
  ? fs.readFileSync(`${root}/shared/schema-ready`, 'utf8').trim() : null;
if (previous?.schema !== candidate.schema && receipt !== candidate.schema) {
  throw new Error('Apply the reviewed staging DDL and write its fingerprint to shared/schema-ready first.');
}
console.log('deploy');
NODE
)"
if [ "$ACTION" = skip ]; then
  echo 'Skipping an already active or superseded release.'
  exit 0
fi
INFRA_CHANGED=1
compose "$RELEASE"
NODE_ENV=production node --env-file="$ENV_FILE" "$RELEASE/.ops/sync.cjs" || echo 'WARN: calendar sync failed; checking existing coverage.' >&2
NODE_ENV=production node --env-file="$ENV_FILE" "$RELEASE/.ops/check.cjs"
# Smoke-test the candidate before changing the running service.
NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3100 node --env-file="$ENV_FILE" "$RELEASE/server.js" \
  9>&- >"$ROOT/shared/candidate.log" 2>&1 &
CANARY_PID=$!
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 \
  --max-time 10 --output /dev/null http://127.0.0.1:3100/api/auth/session
kill -0 "$CANARY_PID"
stop_canary
link_current "$RELEASE_ID"
PROMOTED=1
sudo systemctl restart supporter-b-staging
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 \
  --max-time 10 --output /dev/null http://127.0.0.1:3000/api/auth/session
# Keep five recent releases and always preserve the immediate rollback target.
node - "$ROOT" "$PREVIOUS" <<'NODE'
const fs = require('node:fs');
const [root, previous] = process.argv.slice(2);
const entries = fs.readdirSync(`${root}/releases`).filter(id => /^[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*$/.test(id));
entries.sort((a, b) => fs.statSync(`${root}/releases/${b}`).mtimeMs - fs.statSync(`${root}/releases/${a}`).mtimeMs);
const keep = new Set([...entries.slice(0, 5), previous.replace(/^releases\//, ''), fs.readlinkSync(`${root}/current`).replace(/^releases\//, '')]);
for (const id of entries) {
  if (!keep.has(id)) fs.rmSync(`${root}/releases/${id}`, { recursive: true });
}
NODE
rm -f "$ARCHIVE"
echo "Staging deployed: $RELEASE_ID"
