#!/usr/bin/env bash
# One-time provisioning for a fresh AWS Lightsail "Amazon Linux 2023" instance.
# Run as the default `ec2-user` (has passwordless sudo). Idempotent-ish:
# safe to re-run; existing installs are skipped.
#
#   bash scripts/deploy/lightsail-bootstrap.sh
#
# Installs: 4GB swap, Node at the mise.toml pin (official binary — AL2023 has
# glibc 2.34, so no workaround needed), pnpm 9 (corepack), Docker + compose v2,
# PM2, Caddy (static binary + systemd unit).
#
# ── NO host firewall by design ──────────────────────────────────────────────
# AWS Lightsail's CONSOLE firewall (instance → Networking tab) filters traffic
# at the AWS edge, exactly like a Security Group. That is the firewall. Open
# 80 + 443 THERE (22 is open by default). Amazon Linux 2023 ships no ufw, and
# firewalld is not enabled on the Lightsail image — a host firewall would only
# duplicate the console rules. Postgres binds 127.0.0.1 only (compose), so the
# sole public listeners are Caddy (80/443, intentional) and SSH (22). Nothing
# for a host firewall to protect that the console firewall doesn't already.
# (This is the Lightsail analogue of the OCI VCN gotcha — different mechanism:
#  OCI needed iptables surgery; Lightsail needs a console click. See the runbook.)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$REPO_ROOT/scripts/deploy/node-version.sh"

NODE_VERSION="${NODE_VERSION:-$(pinned_node_version < "$REPO_ROOT/mise.toml")}" || {
  echo "ERROR: no node = \"x.y.z\" pin in $REPO_ROOT/mise.toml" >&2
  exit 1
}
COMPOSE_VERSION="${COMPOSE_VERSION:-v2.29.7}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# --- 1. Swap 4GB (next build peaks >1GB and OOM-kills on a 2GB box; give the
#        build room to spill to disk instead of getting killed) -------------
if ! sudo swapon --show | grep -q '/swapfile'; then
  log "Creating 4GB swapfile"
  sudo fallocate -l 4G /swapfile 2>/dev/null \
    || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab \
    || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  log "Swap already present — skipping"
fi

# --- 2. Base packages (dnf) -------------------------------------------------
# Don't install `curl`: AL2023 ships `curl-minimal` which provides the curl
# command; `dnf install curl` would hit a file conflict.
log "dnf update + base packages"
sudo dnf -y update
sudo dnf -y install git tar xz gzip shadow-utils

# --- 3. Node (official linux-x64 binary; AL2023 glibc 2.34 is fine) ----------
# Installs when node is missing, on another major, or below NODE_VERSION.
# install-node.sh verifies the tarball against nodejs.org's SHASUMS256.txt.
if ! command -v node >/dev/null 2>&1 || ! node_satisfies_pin "$(node -v 2>/dev/null)" "$NODE_VERSION"; then
  log "Installing Node ${NODE_VERSION} (official binary) to /usr/local"
  bash "$REPO_ROOT/scripts/deploy/install-node.sh" "$NODE_VERSION"
  hash -r
else
  log "Node already installed: $(node -v)"
fi
log "node $(node -v), npm $(npm -v)"

# --- 4. pnpm 9 via corepack -------------------------------------------------
log "Enabling corepack + pnpm 9"
sudo corepack enable
corepack prepare pnpm@9 --activate

# --- 5. PM2 (supervises the native `next start`) ----------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  sudo npm install -g pm2
else
  log "PM2 already installed: $(pm2 --version)"
fi

# --- 6. Docker + compose v2 (for the same-box Postgres container) -----------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker (dnf)"
  sudo dnf -y install docker
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  echo "NOTE: log out/in (or run 'newgrp docker') for docker group to take effect."
else
  log "Docker already installed: $(docker --version)"
  sudo systemctl enable --now docker
fi
if ! sudo docker compose version >/dev/null 2>&1; then
  log "Installing docker compose v2 plugin (${COMPOSE_VERSION})"
  sudo mkdir -p /usr/libexec/docker/cli-plugins
  sudo curl -fsSL \
    "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/libexec/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
else
  log "docker compose already present"
fi

# --- 7. Caddy (static binary + systemd unit) --------------------------------
# Distro-agnostic: drop the static binary in and write the standard systemd
# unit. CAP_NET_BIND_SERVICE lets the non-root caddy user bind 80/443.
# {$APP_DOMAIN} in the Caddyfile is read from caddy.env.
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy (static binary)"
  tmp="$(mktemp -d)"
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o "$tmp/caddy"
  sudo install -m 0755 "$tmp/caddy" /usr/local/bin/caddy
  rm -rf "$tmp"
else
  log "Caddy already installed: $(caddy version)"
fi

id caddy >/dev/null 2>&1 || sudo useradd --system --home-dir /var/lib/caddy --shell /sbin/nologin caddy
sudo mkdir -p /etc/caddy /var/lib/caddy
sudo chown -R caddy:caddy /var/lib/caddy

log "Installing /etc/caddy/Caddyfile (from repo)"
sudo cp "$REPO_ROOT/deploy/Caddyfile" /etc/caddy/Caddyfile

if [ ! -f /etc/caddy/caddy.env ]; then
  log "Writing /etc/caddy/caddy.env (EDIT APP_DOMAIN before starting Caddy)"
  echo 'APP_DOMAIN=support-b.com' | sudo tee /etc/caddy/caddy.env >/dev/null
fi

log "Writing /etc/systemd/system/caddy.service"
sudo tee /etc/systemd/system/caddy.service >/dev/null <<'UNIT'
[Unit]
Description=Caddy reverse proxy
After=network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
EnvironmentFile=/etc/caddy/caddy.env
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload

cat <<EOF

$(printf '\033[1;32m')Bootstrap complete.$(printf '\033[0m')

Next steps (see docs/DEPLOY_LIGHTSAIL.md):
  1. Open 443 (and confirm 80) in the Lightsail CONSOLE firewall.
  2. Point your domain's A record at the Lightsail static IP, then:
       sudo sed -i 's/your-domain.com/<your-domain>/' /etc/caddy/caddy.env
       sudo systemctl enable --now caddy
  3. cp .env.production.example .env.production && \$EDITOR .env.production
  4. bash scripts/deploy/lightsail-deploy.sh
  5. pm2 startup  (run the printed command), then  pm2 save
EOF
