#!/usr/bin/env bash
# Opt-in auto-updater for the self-hosted PWA (see DEPLOYMENT.md section 3d).
#
# Nothing about this project runs this script for you - it's here for
# anyone who explicitly wants their PWA container to track this repo's
# latest tagged release automatically, instead of the default (pinned to
# whatever version you set in .env until you change it yourself). Run it
# by hand whenever you want to check now, or schedule it (cron/Task
# Scheduler - see DEPLOYMENT.md) if you want that check to happen on its
# own. Deleting the scheduled task/cron line fully reverts to manual-only;
# this script itself changes nothing unless a newer release actually exists.
#
# Expects to be run from the same directory as the compose.yaml you added
# the party-console-pwa service to (see section 3b), with a .env file
# there defining PWA_VERSION (e.g. PWA_VERSION=v0.2.0).

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
# Portable in-place sed (the .bak suffix form works on both GNU and BSD/macOS sed).
sed -i.bak -E "s/^PWA_VERSION=.*/PWA_VERSION=$latest/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"

docker compose build --pull "$SERVICE"
docker compose up -d --force-recreate "$SERVICE"

echo "Done - $SERVICE rebuilt and restarted on $latest."
