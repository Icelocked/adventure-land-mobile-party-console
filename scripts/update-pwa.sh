#!/usr/bin/env bash
# Opt-in auto-updater for the self-hosted PWA (see DEPLOYMENT.md section 3d).
#
# Moves PWA_VERSION in .env to the latest tagged release and rebuilds the
# container. Run it by hand or from cron/Task Scheduler; it changes nothing
# when already up to date.
#
# Run from the directory holding the compose.yaml with the party-console-pwa
# service and a .env defining PWA_VERSION (e.g. PWA_VERSION=v0.2.0).

set -euo pipefail

REPO="Icelocked/adventure-land-mobile-party-console"
SERVICE="party-console-pwa"
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE here - run this from the same directory as your compose.yaml (see DEPLOYMENT.md section 3b/3d)." >&2
  exit 1
fi

current=$(grep -E '^PWA_VERSION=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)
if [ -z "$current" ]; then
  echo "No PWA_VERSION= line found in $ENV_FILE - add one (e.g. PWA_VERSION=v0.2.0) first." >&2
  exit 1
fi

latest=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
if [ -z "$latest" ]; then
  echo "Could not determine the latest release (GitHub API request failed) - leaving things as they are." >&2
  exit 1
fi

if [ "$latest" = "$current" ]; then
  echo "Already on the latest release ($current) - nothing to do."
  exit 0
fi

echo "Updating PWA_VERSION: $current -> $latest"
# The .bak suffix form of -i works on both GNU and BSD/macOS sed.
sed -i.bak -E "s/^PWA_VERSION=.*/PWA_VERSION=$latest/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"

docker compose build --pull "$SERVICE"
docker compose up -d --force-recreate "$SERVICE"

echo "Done - $SERVICE rebuilt and restarted on $latest."
