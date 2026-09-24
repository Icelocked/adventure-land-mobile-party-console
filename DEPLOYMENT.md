# Connecting your phone to party-console via Tailscale

The setup this project has actually been built and used against: party-
console running on your own gaming PC, reached from your phone anywhere
via [Tailscale](https://tailscale.com). This is the one path documented
here because it's the one that's actually been run, end to end, not just
read about - both for the Android app and the PWA.

This guide does **not** cover installing party-console itself - that's
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console)'s
own job to document, and duplicating it here risks drifting out of sync
with it. Install and set up party-console on your PC first, following
its own README, until its web dashboard works normally in a browser on
that same PC. Then come back here for the "reach it from my phone" part.

## 1. Install Tailscale on both devices

- On your PC: [download Tailscale](https://tailscale.com/download) and
  sign in (a free personal account is enough).
- On your phone: install the Tailscale app from the Play Store/App Store
  and sign into the **same** account.

Both devices now show up in your [Tailscale admin
console](https://login.tailscale.com/admin/machines) and can reach each
other directly, wherever they actually are - your phone doesn't need to
be on the same WiFi as your PC anymore.

## 2. Find your PC's Tailscale address

Run `tailscale ip` on your PC (or open the Tailscale app and look at "This
device") - it's an address starting with `100.`. That's what your phone
will use instead of your PC's normal LAN address.

## 3a. Android app

On the app's connection screen, enter:

```
<your-pc's-tailscale-ip>:3010
```

(`3010` is party-console's default port - check what port your own setup
actually uses if you changed it). Choose the **Plain HTTP (Cleartext)**
trust mode - Tailscale's own tunnel is already encrypted, so there's no
need for a second layer of TLS on top of it.

## 3b. PWA (self-hosted alongside party-console)

Unlike the Android app, the PWA **can't** just be pointed at
`<tailscale-ip>:3010` from a publicly-hosted page - party-console's
coordinator sends no `Access-Control-Allow-Origin` header at all (a
browser security check with no native-app equivalent), so a page loaded
from anywhere else is blocked from talking to it. The fix: the PWA is
served *from* the same place, alongside party-console itself, so it's
never cross-origin in the first place - `web/Dockerfile` + `web/
nginx.conf` build exactly that (static files + an nginx proxy for
`/party-api/*`), verified this session against the real container.

Add it as a second service in the **same `compose.yaml`** you already
run party-console from (the service name `party-console` in the proxy
config below must match whatever your `services:` block actually calls
it - `party-console` is what this project's own local install uses):

```yaml
services:
  party-console:
    # ... your existing party-console service, unchanged ...

  party-console-pwa:
    build: https://github.com/Icelocked/adventure-land-mobile-party-console.git#main:web
    ports:
      - "100.125.193.9:8080:80"   # replace with YOUR Tailscale IP
    restart: unless-stopped
```

(Building straight from the git repo like this means `docker compose up`
pulls the latest PWA source each time you recreate it - `git clone` the
repo yourself first and use `build: ./adventure-land-mobile-party-console/web`
instead if you'd rather pin to a specific checkout.)

```bash
docker compose up -d party-console-pwa
```

Then on your phone, open `http://<your-pc's-tailscale-ip>:8080/` in the
browser and use its "Add to Home Screen" (Chrome/Safari) - no address to
type into the app itself, since it's already talking to the party-
console instance it's deployed next to.

## Why not a domain or a public IP?

Those are real options in general (any self-hosted app can be put behind
a domain+reverse-proxy, or exposed on a raw port), and the Android app's
connection screen supports them (see the README's "Connection security
model"). They're just not documented step-by-step here, because doing so
correctly - the right reverse-proxy config, the right firewall rules, an
actual authentication layer in front of an API that has none of its own -
is real, easy-to-get-subtly-wrong work that hasn't actually been done and
verified for this project. Tailscale sidesteps all of it: nothing is ever
publicly reachable, so there's no exposure to get wrong.

If you set one of those paths up yourself and want to contribute a
verified, tested guide for it, a PR is welcome.
