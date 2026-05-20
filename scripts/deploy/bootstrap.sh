#!/usr/bin/env bash
# One-time provisioning for a fresh Ubuntu 22.04/24.04 OCI instance.
# Run as the default `ubuntu` user (has passwordless sudo). Idempotent-ish:
# safe to re-run; existing installs are skipped.
#
#   bash scripts/deploy/bootstrap.sh
#
# Installs: 4GB swap, Node 22, pnpm 9 (corepack), Docker + compose, PM2, Caddy,
# and opens the OCI instance firewall for HTTP/HTTPS (the gotcha that bites
# half of all OCI deploys — the VCN security list alone is not enough).
set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# --- 1. Swap (so `next build` doesn't OOM, esp. on the x86 micro fallback) ---
if ! sudo swapon --show | grep -q '/swapfile'; then
  log "Creating 4GB swapfile"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  log "Swap already present — skipping"
fi

# --- 2. Base packages -------------------------------------------------------
log "apt update + base packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git build-essential \
  debian-keyring debian-archive-keyring apt-transport-https gnupg netfilter-persistent

# --- 3. Node 22 + pnpm 9 ----------------------------------------------------
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" != "22" ]; then
  log "Installing Node 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node 22 already installed: $(node -v)"
fi
log "Enabling corepack + pnpm 9"
sudo corepack enable
corepack prepare pnpm@9 --activate

# --- 4. Docker engine + compose plugin (for the Postgres container) ---------
if ! command -v docker >/dev/null; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "NOTE: log out/in (or run 'newgrp docker') for group membership to take effect."
else
  log "Docker already installed: $(docker --version)"
fi

# --- 5. PM2 -----------------------------------------------------------------
if ! command -v pm2 >/dev/null; then
  log "Installing PM2"
  sudo npm install -g pm2
else
  log "PM2 already installed: $(pm2 --version)"
fi

# --- 6. Caddy (apt repo) ----------------------------------------------------
if ! command -v caddy >/dev/null; then
  log "Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
else
  log "Caddy already installed: $(caddy version)"
fi

# --- 7. OS firewall: open 80/443 -------------------------------------------
# OCI Ubuntu images ship an iptables INPUT chain that REJECTs everything except
# SSH. The VCN security list opening 80/443 is necessary but NOT sufficient —
# the OS must accept them too. Insert ACCEPT rules before the trailing REJECT.
open_port() {
  local port="$1"
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    log "Opening TCP $port in iptables"
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  else
    log "TCP $port already open"
  fi
}
open_port 80
open_port 443
sudo netfilter-persistent save
log "Verify with: sudo iptables -L INPUT --line-numbers   (ACCEPT 80/443 must sit ABOVE the REJECT line)"

log "Bootstrap complete. Next: configure .env.production and run scripts/deploy/deploy.sh"
