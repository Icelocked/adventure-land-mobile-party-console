#!/usr/bin/env bash
# Builds the PWA release packages from an already built web/dist:
#   party-console-companion-pwa-windows-v<V>.zip   Start.cmd + app (no Docker)
#   party-console-companion-pwa-linux-v<V>.tar.gz  start.sh + app (no Docker)
#   party-console-companion-pwa-docker-v<V>.zip    Docker installers + compose file
#   install-pwa-docker.sh, compose.pwa.yaml        the same, for curl | bash
# Usage: distribution/package.sh <version without v> <output dir>
set -euo pipefail
version="$1"
out="$(mkdir -p "$2" && cd "$2" && pwd)"
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The app: the same for both launchers (web-push is plain JavaScript).
app="$work/app"
mkdir -p "$app/server" "$app/notifier"
cp -r "$repo/web/dist" "$app/dist"
cp "$repo/web/server/gateway.mjs" "$repo/web/server/supervisor.mjs" "$app/server/"
cp "$repo/web/notifier/"{server.mjs,detect.mjs,updates.mjs,package.json,package-lock.json} "$app/notifier/"
(cd "$app/notifier" && npm ci --omit=dev --no-audit --no-fund >/dev/null)
node -p "require('$repo/web/package.json').version" > "$app/notifier/base-version.txt"
printf '{ "version": "%s", "repository": "Icelocked/adventure-land-mobile-party-console" }\n' "$version" > "$app/release.json"

# Windows: flat, like party-console's own ZIP.
mkdir -p "$work/windows"
cp -r "$app" "$work/windows/app"
cp "$repo/distribution/windows/"{Start.cmd,Start.ps1,README.txt} "$work/windows/"
(cd "$work/windows" && zip -qr "$out/party-console-companion-pwa-windows-v$version.zip" .)

# Linux: one top-level folder, as tarballs usually have.
mkdir -p "$work/linux/party-console-pwa"
cp -r "$app" "$work/linux/party-console-pwa/app"
cp "$repo/distribution/linux/"{start.sh,README.txt} "$work/linux/party-console-pwa/"
chmod +x "$work/linux/party-console-pwa/start.sh"
tar -czf "$out/party-console-companion-pwa-linux-v$version.tar.gz" -C "$work/linux" party-console-pwa

# Docker: installers next to the compose file.
mkdir -p "$work/docker"
cp "$repo/distribution/docker/"{"Install PWA.cmd",install-pwa.ps1,install-pwa.sh,compose.pwa.yaml} "$work/docker/"
chmod +x "$work/docker/install-pwa.sh"
(cd "$work/docker" && zip -qr "$out/party-console-companion-pwa-docker-v$version.zip" .)
cp "$repo/distribution/docker/install-pwa.sh" "$out/install-pwa-docker.sh"
cp "$repo/distribution/docker/compose.pwa.yaml" "$out/compose.pwa.yaml"

ls -l "$out"
