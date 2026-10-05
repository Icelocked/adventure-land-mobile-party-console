#!/usr/bin/env bash
# Adds Party Console Companion's PWA to a party-console that runs in Docker
# (Linux, including Raspberry Pi): finds party-console's Compose project and
# starts compose.pwa.yaml in it. Safe to run again; it then updates the PWA.
#
#   curl -fsSL https://github.com/Icelocked/adventure-land-mobile-party-console/releases/latest/download/install-pwa-docker.sh | bash
set -euo pipefail
RELEASES=https://github.com/Icelocked/adventure-land-mobile-party-console/releases/latest/download
PORT="${PWA_PORT:-8080}"
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail "Docker was not found. If party-console runs without Docker, use the Linux package (party-console-companion-pwa-linux-*.tar.gz) instead."
if ! docker info >/dev/null 2>&1; then
  fail "Can't reach Docker. Start it, or run this with sudo (or add your user to the docker group)."
fi
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing (the same one party-console needs)."

# Next to this script when run from the release ZIP; otherwise downloaded
# into ~/party-console-pwa.
here="$(dirname "$(readlink -f "${BASH_SOURCE[0]:-$0}")" 2>/dev/null || pwd)"
if [ -f "$here/compose.pwa.yaml" ]; then
  compose="$here/compose.pwa.yaml"
else
  mkdir -p "$HOME/party-console-pwa"
  compose="$HOME/party-console-pwa/compose.pwa.yaml"
  curl -fsSL "$RELEASES/compose.pwa.yaml" -o "$compose" || fail "Downloading compose.pwa.yaml failed."
fi

# party-console's container carries its Compose project name.
consoles="$(docker ps -a --filter label=com.docker.compose.service=party-console --format '{{.Label "com.docker.compose.project"}}|{{.State}}')"
[ -n "$consoles" ] || fail "party-console was not found in Docker. Install and start it first; if it runs without Docker, use the Linux package instead."
projects="$(printf '%s\n' "$consoles" | cut -d'|' -f1 | awk '!seen[$0]++')"
if [ -n "${PARTY_CONSOLE_PROJECT:-}" ]; then
  printf '%s\n' "$projects" | grep -qx "$PARTY_CONSOLE_PROJECT" || fail "No party-console in Docker project '$PARTY_CONSOLE_PROJECT'. Found: $(echo $projects)"
  project="$PARTY_CONSOLE_PROJECT"
elif [ "$(printf '%s\n' "$projects" | wc -l)" -gt 1 ]; then
  printf '%s\n' "$projects" | awk '{ printf "  [%d] %s\n", NR, $0 }'
  # From the terminal: under curl | bash, stdin is the script itself.
  read -r -p "More than one party-console found. Add the PWA to which one? " pick < /dev/tty || pick=""
  case "$pick" in ''|0|*[!0-9]*) fail "Nothing chosen; nothing was changed." ;; esac
  project="$(printf '%s\n' "$projects" | sed -n "${pick}p")"
  [ -n "$project" ] || fail "Nothing chosen; nothing was changed."
else
  project="$projects"
fi
printf '%s\n' "$consoles" | grep -qx "$project|running" || echo "Note: party-console ($project) is not running right now; the PWA will connect once it is."
echo "Found party-console in Docker project '$project'."

# A PWA set up by hand in party-console's own compose.yaml stays as it is.
existing="$(docker ps -a --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=party-console-pwa --format '{{.Label "com.docker.compose.project.config_files"}}' | head -n1)"
if [ -n "$existing" ] && [[ "$existing" != *compose.pwa.yaml* ]]; then
  fail "The PWA is already set up in $existing. Update it there (docker compose pull && docker compose up -d), or remove its services from that file and run this again."
fi

# The PWA shares party-console's project, so Compose would call party-console
# an "orphan" and suggest --remove-orphans, which would delete it.
export COMPOSE_IGNORE_ORPHANS=True
echo "Downloading the PWA..."
docker compose -p "$project" -f "$compose" pull || fail "Downloading the PWA image failed. Check your internet connection and run this again."
docker compose -p "$project" -f "$compose" up -d || fail "Starting the PWA failed. If port $PORT is taken, run again with PWA_PORT=8081 in front."

for _ in $(seq 30); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/"; then ready=1; break; fi
  sleep 1
done
[ "${ready:-}" = 1 ] || fail "The PWA started but doesn't answer on port $PORT yet. Check: docker compose -p $project -f $compose logs"

printf '\n\033[32mThe PWA is running: http://localhost:%s\033[0m\n' "$PORT"
if command -v tailscale >/dev/null 2>&1; then
  echo "For your phone over HTTPS (notifications, Android's \"Install app\"), run once:"
  echo "  sudo tailscale serve --bg $PORT"
else
  echo "To use it from your phone, see DEPLOYMENT.md section 4b (Tailscale)."
fi
echo
echo "Updates: in the app, Settings -> Party Console PWA."
echo "To remove it (party-console stays): docker compose -p $project -f $compose rm --stop --force"
