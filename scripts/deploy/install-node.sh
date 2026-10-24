#!/usr/bin/env bash
# Install or replace Node only — the official nodejs.org linux-x64 binary into
# /usr/local. Used by lightsail-bootstrap.sh and for changing Node on a live
# server (patch upgrade or rollback). Never run the full bootstrap for that: it
# also runs `dnf update` and rewrites Caddy.
#
#   bash scripts/deploy/install-node.sh            # the mise.toml pin
#   bash scripts/deploy/install-node.sh 22.24.0    # an explicit version
#
# Verifies the tarball against nodejs.org's SHASUMS256.txt before unpacking,
# and does nothing when that exact version is already installed. Running PM2
# apps keep the old binary until restarted — see docs/DEPLOY_LIGHTSAIL.md
# (Node 설치) for the restart and verification steps.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$REPO_ROOT/scripts/deploy/node-version.sh"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  VERSION="$(pinned_node_version < "$REPO_ROOT/mise.toml")" || {
    echo "ERROR: no node = \"x.y.z\" pin in $REPO_ROOT/mise.toml" >&2
    exit 1
  }
fi
is_node_version "$VERSION" || {
  echo "ERROR: invalid Node version '$VERSION' (expected x.y.z)" >&2
  exit 1
}

if [ "$(node -v 2>/dev/null || true)" = "v$VERSION" ]; then
  echo "Node v$VERSION already installed"
  exit 0
fi

base="https://nodejs.org/dist/v${VERSION}"
file="node-v${VERSION}-linux-x64.tar.xz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$base/$file" -o "$tmp/$file"
curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
(cd "$tmp" && grep "  $file\$" SHASUMS256.txt | sha256sum -c --status -) || {
  echo "ERROR: $file does not match nodejs.org SHASUMS256.txt — not installing" >&2
  exit 1
}

sudo tar -xJf "$tmp/$file" -C /usr/local --strip-components=1
hash -r
echo "Installed Node $(node -v) to /usr/local"
