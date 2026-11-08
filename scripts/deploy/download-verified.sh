#!/usr/bin/env bash
# Download only reviewed release bytes. Nothing is extracted or executed here.
set -euo pipefail
if [ "$#" -ne 3 ] || [[ ! "$2" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo 'ERROR: expected official HTTPS URL, reviewed artifact key and output file.' >&2
  exit 1
fi
case "$1" in
  https://nodejs.org/dist/* | https://github.com/docker/compose/releases/download/* | https://github.com/caddyserver/caddy/releases/download/*) ;;
  *) echo 'ERROR: unsupported release origin.' >&2; exit 1 ;;
esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY="$(awk -v artifact="$2" '$3 == artifact { print $1 " " $2 }' "$SCRIPT_DIR/release-checksums.txt")"
if [[ "$ENTRY" =~ ^sha256\ ([0-9a-f]{64})$ ]]; then
  CHECKSUM=sha256sum
  EXPECTED="${BASH_REMATCH[1]}"
elif [[ "$ENTRY" =~ ^sha512\ ([0-9a-f]{128})$ ]]; then
  CHECKSUM=sha512sum
  EXPECTED="${BASH_REMATCH[1]}"
else
  echo 'ERROR: release checksum is missing, ambiguous or malformed; review the official release first.' >&2
  exit 1
fi
TEMP_DOWNLOAD="$(mktemp -d)"
trap 'rm -rf "$TEMP_DOWNLOAD"' EXIT
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 10 --max-time 300 "$1" -o "$TEMP_DOWNLOAD/payload"
if ! printf '%s  %s\n' "$EXPECTED" "$TEMP_DOWNLOAD/payload" | "$CHECKSUM" --check --status; then
  echo 'ERROR: release checksum mismatch; installation is unchanged.' >&2
  exit 1
fi
cp "$TEMP_DOWNLOAD/payload" "$3"
