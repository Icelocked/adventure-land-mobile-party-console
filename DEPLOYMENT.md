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
it - `party-console` is what this project's own local install uses).

**This is pinned to a specific version by default, on purpose** - nothing
about your setup changes until *you* decide to update, by changing one
line and rebuilding. Add a `.env` file next to your `compose.yaml`:

```
PWA_VERSION=v0.2.0
```

and reference it in the service itself:

```yaml
services:
  party-console:
    # ... your existing party-console service, unchanged ...

  party-console-pwa:
    build: https://github.com/Icelocked/adventure-land-mobile-party-console.git#${PWA_VERSION}:web
    ports:
      - "100.125.193.9:8080:80"   # replace with YOUR Tailscale IP
    restart: unless-stopped
```

```bash
docker compose up -d party-console-pwa
```

**To update later:** check the [Releases page](https://github.com/Icelocked/adventure-land-mobile-party-console/releases)
for the newest tag, bump `PWA_VERSION` in `.env` to match, then:

```bash
docker compose build --pull party-console-pwa
docker compose up -d --force-recreate party-console-pwa
```

If you'd rather always build whatever's newest on `main` instead of a
specific tag (accepting that "newest" can occasionally mean "not yet
released"), set `PWA_VERSION=main` instead - same rebuild command applies
whenever you want to pick up new commits, since Compose doesn't do this
on its own. See section 3d below if you'd like that check to happen
automatically instead of by hand.

Then on your phone, open `http://<your-pc's-tailscale-ip>:8080/` in the
browser and use its "Add to Home Screen" (Chrome/Safari) - no address to
type into the app itself, since it's already talking to the party-
console instance it's deployed next to.

**This gets you a fully working PWA on iPhone.** Safari's "Add to Home
Screen" never required HTTPS or a service worker - just the manifest and
icons, which this setup already serves correctly. **On Android, though,
it's a smaller win than it could be:** Chrome only offers its full
"Install app" experience (a real standalone window, not just a bookmark)
to pages served over HTTPS with a registered service worker - and plain
`http://<tailscale-ip>` doesn't qualify (browsers only treat `localhost`
as a secure context, not Tailscale's `100.x` addresses). Without it,
Chrome falls back to "Create shortcut," which just opens the site in an
ordinary browser tab. The next section fixes that.

## 3c. Optional: real HTTPS for full Android installability

Tailscale can issue actual, browser-trusted TLS certificates for your
tailnet's own MagicDNS name (`<machine>.<tailnet>.ts.net`) via `tailscale
cert` - still never exposed publicly (only reachable over Tailscale), but
genuine HTTPS, which is what unlocks Chrome's real "Install app" flow on
Android. `web/Dockerfile` already ships support for this: it's inert by
default (nothing changes unless you opt in) and activates automatically
the moment a cert is mounted at the right path - verified this session by
building the image and confirming both cases (no cert mounted → still
plain HTTP-only on :80 exactly as before; cert mounted → :443 comes up
serving the identical app over real TLS, `/party-api/*` proxying included).

**One-time: enable HTTPS Certificates for your tailnet.** In the
[Tailscale admin console → DNS](https://login.tailscale.com/admin/dns),
turn on "HTTPS Certificates" (off by default). This is an account setting
you have to do yourself in the admin console - nothing here can do it for
you.

**Find your machine's MagicDNS name** with `tailscale status` (look for
your own device's `DNSName`, e.g. `desktop-abc123.tailXXXXXX.ts.net`).

**Issue the certificate**, on the same machine that runs party-console:

```bash
tailscale cert --cert-file=tailscale.crt --key-file=tailscale.key desktop-abc123.tailXXXXXX.ts.net
```

This writes `tailscale.crt`/`tailscale.key` into your current directory -
put them somewhere durable, e.g. `C:\tailscale-certs\`. **They expire
(~90 days)** - re-run the same command periodically to renew (it's
idempotent, same filenames), then recreate the container so it picks up
the new files.

**Mount them into the PWA container and publish 443**, alongside the
existing service from section 3b:

```yaml
  party-console-pwa:
    build: https://github.com/Icelocked/adventure-land-mobile-party-console.git#${PWA_VERSION}:web
    ports:
      - "100.125.193.9:8080:80"    # replace with YOUR Tailscale IP
      - "100.125.193.9:8443:443"   # same IP, HTTPS port
    volumes:
      - "C:/tailscale-certs:/etc/nginx/tailscale-certs:ro"   # replace with wherever you put the cert files (forward slashes even on Windows - YAML treats backslash as an escape character)
    restart: unless-stopped
```

```bash
docker compose up -d --force-recreate party-console-pwa
```

Then, **from your phone, open `https://<the-MagicDNS-name>:8443/`** -
using the MagicDNS name, not the raw `100.x` IP, since the certificate is
issued for that name specifically and a browser will warn if you use the
IP instead. Chrome should now offer a real "Install app" prompt, not just
"Create shortcut."

## 3d. Optional: automatic updates

By default (3b/3c above), your PWA container is **pinned** to whatever
`PWA_VERSION` you set - it will run that exact version forever until you
manually bump it and rebuild. That's deliberate: nobody's code should
change on your machine without you choosing it.

If you'd rather not think about it and just always run the latest
release, [`scripts/update-pwa.sh`](scripts/update-pwa.sh) automates the
"check for a new release, bump `PWA_VERSION`, rebuild, restart" steps from
the previous section. It only touches anything if a newer release
actually exists - run it any time to check by hand:

```bash
curl -fsSLo update-pwa.sh https://raw.githubusercontent.com/Icelocked/adventure-land-mobile-party-console/main/scripts/update-pwa.sh
chmod +x update-pwa.sh
./update-pwa.sh
```

(run it from the same directory as your `compose.yaml`/`.env`, same as
the manual update commands above)

**To have that check happen on its own**, schedule it - entirely your
call, and easy to undo (just remove the scheduled entry; your `.env`
stays pinned to whatever version it last updated to):

- **Linux/macOS (cron)** - `crontab -e`, add a line to check daily at 3am:
  ```
  0 3 * * * cd /path/to/your/compose/dir && ./update-pwa.sh >> update-pwa.log 2>&1
  ```
- **Windows (Task Scheduler)** - create a daily task running:
  ```
  bash.exe -c "cd /path/to/your/compose/dir && ./update-pwa.sh >> update-pwa.log 2>&1"
  ```
  (`bash.exe` from Git for Windows or WSL - whichever you already have;
  Docker Desktop itself doesn't ship one)

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
