# Installing Party Console Companion

This guide gets the companion onto your phone: the Android app, the PWA, or
both. It assumes party-console already runs on your PC and its dashboard
works in a browser there. Installing party-console itself is covered by
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console).

The tested setup is party-console on a home PC, reached from the phone
through [Tailscale](https://tailscale.com).

## 1. Install Tailscale on both devices

- On your PC: [download Tailscale](https://tailscale.com/download) and sign
  in (a free personal account is enough).
- On your phone: install the Tailscale app and sign in to the **same**
  account.

Both devices now reach each other wherever they are, without opening any
ports on your router.

## 2. Find your PC's Tailscale name

Run `tailscale status` on the PC. Your PC is listed with an address starting
with `100.` and a MagicDNS name like `desktop-abc123.tailXXXXXX.ts.net`.
Either works; the name is needed for HTTPS (sections 3c and 5).

## 3. Android app

1. Download `party-console-companion-v1.0.0.apk` (or newer) from the
   [latest release](https://github.com/Icelocked/adventure-land-mobile-party-console/releases/latest)
   and open it. Android asks you to allow installs from your browser or file
   manager once.
2. On the connection screen, enter `<your PC's Tailscale address>:3010` and
   choose **Plain HTTP**: Tailscale already encrypts the connection.
3. Pair the app: scan the pairing QR code from party-console's dashboard on
   your PC, or paste the pairing link.

If you installed a build older than 1.0.0, uninstall it once first. Those
builds were signed with a different key, and Android refuses to update
across signing keys. From 1.0.0 on, every release installs over the last
one and keeps your server, pairing and notification settings.

To check a download, compare its signing certificate with
`apksigner verify --print-certs`. Release key (SHA-256):
`02:2B:51:59:59:FC:35:EC:63:28:0D:C8:CE:05:4A:6D:2D:35:37:C9:46:03:3B:B9:BD:16:9B:5D:41:9F:2D:28`

### Keeping the app up to date

- **In the app:** Settings → App updates shows your version, checks for new
  releases every 6 hours (with a notification when one is out) and has
  **Check now** and **Download and install update**. Android asks you to
  confirm each install; the first time, it also asks you to allow "Install
  unknown apps" for this app.
- **With [Obtainium](https://github.com/ImranR98/Obtainium):** a free app
  that watches GitHub releases and updates sideloaded apps. Add
  `https://github.com/Icelocked/adventure-land-mobile-party-console` as a
  source; it picks up the `.apk` from each release. Turn off the in-app
  check if you'd rather Obtainium do it.

## 4. PWA (self-hosted next to party-console)

The PWA runs in its own container next to party-console, so the browser
talks to one origin: it serves the app and forwards `/party-api/*` to the
console. (party-console sends no CORS headers, so a PWA hosted anywhere else
can't reach it.)

### 4a. Add the service

Add these services to the **same `compose.yaml`** that runs party-console.
The proxy expects the console's service to be called `party-console`.

```yaml
services:
  party-console:
    # ... your existing party-console service, unchanged ...

  party-console-pwa:
    image: ghcr.io/icelocked/party-console-pwa:${PWA_VERSION:-latest}
    ports:
      - "127.0.0.1:8080:80"     # this machine only; Tailscale forwards to it
    volumes:
      - pwa-notifier:/data/notifier
      - pwa-updates:/data/updates
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # Optional: installs PWA updates from Settings (section 4d).
  party-console-pwa-updater:
    image: ghcr.io/icelocked/party-console-pwa:${PWA_VERSION:-latest}
    command: ["node", "/opt/updater/agent.mjs"]
    user: root
    volumes:
      - pwa-updates:/data/updates
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "1m"
        max-file: "2"

volumes:
  pwa-notifier:
  pwa-updates:
```

```bash
docker compose up -d party-console-pwa party-console-pwa-updater
```

To stay on one version, add `PWA_VERSION=1.0.0` to the `.env` next to your
`compose.yaml` and leave out the updater service.

### 4b. Reach it from your phone

Let Tailscale forward your tailnet address to the container:

```bash
tailscale serve --bg --tcp 8080 tcp://127.0.0.1:8080
```

Don't bind the container to the `100.x` address directly: if Tailscale
starts after Docker (after a reboot, say), Docker can't bind it and the
container stays down. `tailscale serve` is saved across restarts.

If the Android app reaches party-console directly, do the same for its port:
bind it to `127.0.0.1:3010` and run
`tailscale serve --bg --tcp 3010 tcp://127.0.0.1:3010`.

On the phone, open `http://<your PC's Tailscale address>:8080/` and use the
browser's **Add to Home Screen**.

- **iPhone:** this is a fully working home-screen app.
- **Android:** Chrome only offers a real "Install app" over HTTPS. Over
  plain HTTP you get a shortcut that opens a browser tab. Section 4c fixes
  that.

### 4c. Optional: HTTPS

Notifications (section 5) and Chrome's "Install app" need HTTPS with a
trusted certificate. The simplest way is Tailscale's own:

1. In the [Tailscale admin console → DNS](https://login.tailscale.com/admin/dns),
   turn on **HTTPS Certificates**.
2. Run `tailscale serve --bg 8080` on the PC.
3. Open `https://<machine>.<tailnet>.ts.net` on the phone.

The site stays private to your tailnet. Tailscale renews the certificate
itself.

Alternatively, mount a certificate into the container: create one with
`tailscale cert --cert-file=tailscale.crt --key-file=tailscale.key <MagicDNS name>`,
then mount its folder and publish 443:

```yaml
  party-console-pwa:
    ports:
      - "127.0.0.1:8080:80"
      - "127.0.0.1:8443:443"    # tailscale serve --bg --tcp 8443 tcp://127.0.0.1:8443
    volumes:
      - "C:/tailscale-certs:/etc/nginx/tailscale-certs:ro"   # forward slashes, even on Windows
```

The container turns on HTTPS when it finds the certificate. These
certificates expire after about 90 days: re-run `tailscale cert` and restart
the container to renew.

### 4d. Updates

Settings → **Party Console PWA** shows the installed version and checks
GitHub for new releases every 6 hours. **Check now** checks immediately; it
also reloads the app on this device when the server has a newer build.

With the updater service from 4a running:

- **Download and install update** installs the new release now.
- **Automatically download and install new versions when available**
  installs each release once the 6-hour check finds it.

The updater pulls the release image, replaces the PWA container with the
same settings, volumes and network, and checks that the new version starts.
If it doesn't, it puts the previous version back and shows the error in
Settings. The app reconnects by itself and then offers **Reload to update**.

About the updater's access: it mounts the Docker socket, which gives it full
control of Docker on this machine (party-console's own updater works the
same way). It has no network port. It acts only on a request file in its
volume, and the only request it accepts is "install the latest release",
whose version it looks up on GitHub itself. The PWA can only set that
request, and only for paired browsers. If you'd rather not give any
container that access, leave the updater out and update by hand:

```bash
docker compose pull party-console-pwa
docker compose up -d party-console-pwa
```

Without the updater, Settings still tells you when a release is out.

**Building from source instead:** replace the `image:` line with
`build: https://github.com/Icelocked/adventure-land-mobile-party-console.git#v1.0.0:web`.
A local build has no version, so Settings only shows update notices; update
it the way you built it (`docker compose build --pull party-console-pwa`).

### 4e. Optional: a development copy

To test PWA changes against your real console while the released PWA keeps
running, add a second service that builds from your local checkout. The
`dev` profile keeps it from starting unless you ask for it:

```yaml
  party-console-pwa-dev:
    build: /path/to/adventure-land-mobile-party-console/web
    profiles: ["dev"]
    ports:
      - "127.0.0.1:8081:80"
    volumes:
      - pwa-dev-notifier:/data/notifier
    restart: "no"

volumes:
  pwa-dev-notifier:
```

```bash
docker compose --profile dev up -d --build party-console-pwa-dev
docker compose --profile dev stop party-console-pwa-dev
```

It's a separate site, so pair it separately. To open it from your phone,
forward it like the main one: `tailscale serve --bg --tcp 8081 tcp://127.0.0.1:8081`.
The updater only manages `party-console-pwa`, so it never touches this copy.

## 5. Phone notifications

**Android app:** nothing to set up on the server. Open Settings →
Notifications, pick the alerts and tap **Enable notifications on this
device** (Android 13+ asks for permission first). The app checks about every
15 minutes in the background (Android's shortest interval), or every 15
seconds with **Live alerts** on, which keeps an ongoing notification while
it runs. The phone needs to reach the console when it checks (Tailscale on).

**PWA:** the PWA container runs a small push notifier. It watches
party-console the way a paired browser does and sends Web Push to phones
that enabled notifications. Each phone picks which alerts it wants:

| Group | Alert | When |
|---|---|---|
| Character health | Stuck or offline | No status report for N minutes (default 2), a lost connection or stopped CODE; again when it recovers |
| | No actions | No fighting, looting, logging or moving for N minutes (default 5); the merchant is excluded |
| | Repeated deaths | N deaths within M minutes (default 3 in 30) |
| | Error bursts | N errors within M minutes (default 5 in 10): game-log errors and the merchant's errors |
| Storage | Inventory full | A character's bag has no free slots (again each time it fills back up) |
| | Bank full | Every unlocked bank pack is out of free slots |
| Progress | Auto-upgrade / auto-compound rule done | A rule's remaining count reaches zero |
| | Buy-and-upgrade order done | A Buy order with a target level leaves the merchant's queue |
| | Event completed | An event one of your characters is signed up for ends |
| Loot | Rare drops | A looted item has a drop chance under 1 in N, is worth at least N gold, or both (your choice) |
| Trading and mail | Sales and orders filled | Stand sales, WTB fills, Ponty and ALData purchases |
| | New mail | A new message arrives |

The limits and the rare-drop rule are shared by every phone and are set in
Settings → Notifications next to each alert. Each phone also has its own
quiet hours (Character health alerts still arrive) and can mute individual
characters. The Android app has the same alerts, stored on the phone.

Requirements for the PWA:

- **HTTPS with a trusted certificate** (section 4c). Phones only allow push
  for HTTPS pages with a trusted certificate. Notifications travel through
  Google's (Android) or Apple's (iOS) push service, so they reach the phone
  anywhere, even with Tailscale off. Tapping one opens the app, which then
  needs Tailscale (unless you use Funnel, below).
- **The `pwa-notifier` volume** from 4a, so its keys and subscriptions
  survive updates.
- **iOS 16.4 or later.** Add the app to the Home Screen and open it from
  there before enabling notifications.

Turn them on in Settings → Notifications on each phone. The notifier reads
the console with that browser's pairing. If the pairing stops working, it
sends one "Notifications paused" message; enable notifications again to
reconnect.

Optional environment variables for `party-console-pwa`:

- `CONSOLE_URL`: where to reach party-console. Default `http://party-console:3010`.
- `POLL_MS`: how often the notifier checks the console. Default 15000.

Each alert sent is logged (`docker compose logs party-console-pwa`).

## 6. Reaching the PWA without Tailscale (Funnel)

Some networks (a work network, for example) block Tailscale. **Tailscale
Funnel** publishes the PWA at the same `https://<machine>.<tailnet>.ts.net`
address on the public internet: `tailscale funnel --bg 8080`.

The PWA is built for this, but take it seriously:

- Keep **Require secure pairing** on in Settings. Every console request then
  needs this browser's pairing cookie (a random 256-bit token); without it,
  nothing but the sign-in pages is served.
- Funnel only the PWA (port 8080), never party-console's own port 3010.
- Create an invitation link only when you're about to pair a device, and
  don't share it: it works until it's used.
- The container rate-limits each visitor, sends security headers (no
  framing, HTTPS-only once on HTTPS), cleans game markup before showing it,
  and its notifier and updater endpoints accept only same-site requests from
  paired browsers.

## Why not a domain or a public IP?

Both are possible, and the Android app's connection screen supports a real
domain with HTTPS or a pinned self-signed certificate (see the README's
"Connection security"). They aren't documented step by step because doing
them correctly (reverse-proxy config, firewall rules, certificates) hasn't
been set up and tested for this project. Tailscale avoids all of it. A
tested guide for another setup is a welcome PR.
