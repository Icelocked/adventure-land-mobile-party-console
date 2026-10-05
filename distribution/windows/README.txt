Party Console Companion - PWA for Windows (no Docker)
=====================================================

Requires Adventureland Party Console (by Ryan Haines and contributors)
running on this PC: https://github.com/Ryan-Haines/adventureland-party-console

1. Extract this ZIP to a folder you can write to (not Program Files).
2. Double-click Start.cmd. The first start downloads a private Node runtime
   (checksum-verified, from nodejs.org); nothing is installed system-wide.
3. Open http://localhost:8080 on this PC to check it works.
4. On your phone, open the PWA's address and use "Add to Home Screen".
   With Tailscale, Start.cmd offers to set up Tailscale Serve once, which
   gives the phone an HTTPS address (needed for notifications and Android's
   "Install app"). Full guide:
   https://github.com/Icelocked/adventure-land-mobile-party-console/blob/main/DEPLOYMENT.md

Keep the Start.cmd window open while you use the PWA; closing it stops it.

Updates: Settings -> Party Console PWA in the app checks for new releases
every 6 hours and can download and install them (manually or automatically).
The previous version is kept in .\versions for a rollback.

Settings: create config.env next to Start.cmd with any of these lines:
  PWA_PORT=8080                        port of the PWA
  PWA_HOST=127.0.0.1                   0.0.0.0 to allow other devices on your network directly
  CONSOLE_URL=http://127.0.0.1:3010    where party-console runs
  NOTIFIER_PORT=3090                   internal port of the push notifier

Your data (notification keys, subscriptions, update settings) is in .\data.
Keep that folder private.
