Party Console Companion - PWA for Linux (no Docker)
===================================================

Requires Adventureland Party Console (by Ryan Haines and contributors)
running on this machine: https://github.com/Ryan-Haines/adventureland-party-console
Works on 64-bit Linux (x64 or arm64), including a Raspberry Pi with a
64-bit OS. Needs Node 22.18 or newer, the same as party-console's Linux
launcher.

1. Extract:  tar -xzf party-console-companion-pwa-linux-v*.tar.gz
2. Start:    ./party-console-pwa/start.sh   (as your normal user, not sudo)
3. Open http://localhost:8080 on this machine to check it works.
4. On your phone, open the PWA's address and use "Add to Home Screen".
   For HTTPS (notifications, Android's "Install app"), with Tailscale:
     sudo tailscale serve --bg 8080
   Full guide:
   https://github.com/Icelocked/adventure-land-mobile-party-console/blob/main/DEPLOYMENT.md

Updates: Settings -> Party Console PWA in the app checks for new releases
every 6 hours and can download and install them (manually or automatically).
The previous version is kept in ./versions for a rollback.

Settings: create config.env next to start.sh with any of these lines:
  PWA_PORT=8080                        port of the PWA
  PWA_HOST=127.0.0.1                   0.0.0.0 to allow other devices on your network directly
  CONSOLE_URL=http://127.0.0.1:3010    where party-console runs
  NOTIFIER_PORT=3090                   internal port of the push notifier

Your data (notification keys, subscriptions, update settings) is in ./data.
Keep that folder private.
