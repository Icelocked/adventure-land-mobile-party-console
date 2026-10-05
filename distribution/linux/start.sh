#!/usr/bin/env bash
# Starts Party Console Companion's PWA without Docker on Linux (x64 or arm64,
# including a Raspberry Pi with a 64-bit OS). Needs Node 22.18+ and
# party-console running on this machine. Run it as your normal user.
# Settings: optional config.env next to this file (see README.txt).
set -u
cd "$(dirname "$(readlink -f "$0")")"
HOME_DIR="$PWD"

if ! command -v node >/dev/null 2>&1; then
  echo "Node 22.18 or newer is required (the same Node party-console's Linux launcher uses)." >&2
  exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)'; then
  echo "Node $(node -v) is too old; 22.18 or newer is required." >&2
  exit 1
fi

# config.env: KEY=VALUE lines for the settings below; anything else is ignored.
if [ -f config.env ]; then
  while IFS='=' read -r key value; do
    key="$(echo "$key" | tr -d '[:space:]')"
    value="$(echo "${value:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/\r$//')"
    case "$key" in PWA_PORT|PWA_HOST|CONSOLE_URL|NOTIFIER_PORT) export "$key=$value" ;; esac
  done < config.env
fi
PORT="${PWA_PORT:-8080}"
export PWA_HOME="$HOME_DIR" PWA_DATA="$HOME_DIR/data"
mkdir -p data

if command -v tailscale >/dev/null 2>&1 && [ ! -f data/tailscale-asked ]; then
  touch data/tailscale-asked
  echo "For HTTPS on your phone (notifications, Android's \"Install app\"), run once:"
  echo "  sudo tailscale serve --bg $PORT"
fi

while true; do
  ROOT="$(node -e 'try{process.stdout.write(require("./active.json").root||"app")}catch{process.stdout.write("app")}')"
  echo "Starting Party Console PWA. Open http://localhost:$PORT once ready. Press Ctrl+C to stop."
  node "$ROOT/server/supervisor.mjs"
  code=$?
  [ "$code" -eq 75 ] && continue
  [ "$code" -eq 130 ] || [ "$code" -eq 0 ] && exit 0
  # A new version that can't even start goes back to the previous one.
  if node -e 'const a=require("./active.json");process.exit(a.pending&&a.previous?0:1)' 2>/dev/null; then
    echo "The new version failed to start; going back to the previous one."
    node -e '
      const fs=require("fs");const a=require("./active.json")
      fs.writeFileSync("active.json",JSON.stringify({root:a.previous}))
      fs.mkdirSync("data/updates",{recursive:true})
      fs.writeFileSync("data/updates/result.json",JSON.stringify({error:"The new version did not start; rolled back"}))'
    continue
  fi
  echo "The PWA stopped (exit code $code). Restarting in 10 seconds; press Ctrl+C to stop."
  sleep 10
done
