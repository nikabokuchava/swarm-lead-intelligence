#!/usr/bin/env bash
set -e

# ─── Usage ────────────────────────────────────────────────────────────────────
if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh <user@VPS_IP>"
  echo "Example: ./deploy.sh root@204.168.141.219"
  exit 1
fi

TARGET="$1"
REMOTE_DIR="~/swarm-lead-scraper"

# ─── Phase 1: Sync project files ─────────────────────────────────────────────
echo "══ Phase 1: Syncing project files to $TARGET ══"
rsync -avz --progress \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='dashboard/' \
  --exclude='dist/' \
  --exclude='logs/' \
  --exclude='samples/' \
  --exclude='*.csv' \
  --exclude='.env' \
  ./ "$TARGET:$REMOTE_DIR/"

# ─── Phase 2: Transfer .env securely ─────────────────────────────────────────
echo "══ Phase 2: Transferring .env ══"
scp .env "$TARGET:$REMOTE_DIR/.env"

# ─── Phase 3: Build & restart worker on VPS ──────────────────────────────────
echo "══ Phase 3: Building and restarting worker container ══"
ssh "$TARGET" "cd $REMOTE_DIR && docker compose up -d --build scraper-worker"

echo "══ Deploy complete ══"
