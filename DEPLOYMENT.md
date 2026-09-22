# Deploying party-console to DigitalOcean

A complete, verified-against-the-real-release-assets guide for running
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console)
on a DigitalOcean droplet instead of your home PC, reachable over a real
domain with real HTTPS (so this companion app - or any browser, anywhere -
can just connect normally, no certificate trust dance), with updates as
Ryan releases them handled by party-console's own built-in updater.

Everything here was checked against the actual `v1.0.6` release's
`compose.yaml` and `docs/distribution.md` - not guessed.

## What you'll end up with

- A droplet running party-console fully headless (no Steam client on the
  droplet at all - your characters run headless there; if you also want
  to *watch* the game's native client sometimes, that's a separate,
  optional thing, not required for the dashboard/mobile app to work).
- A real domain (or subdomain) with a normal, publicly-trusted HTTPS
  certificate in front of it - the "cleanest path for a real server"
  option from this project's earlier research, not party-console's own
  bundled local-CA HTTPS (that's built for a LAN, not the public internet).
- Updates handled by party-console's own updater: toggle one setting once,
  it checks every 6 hours from then on.
- A password gate in front of the whole thing, because **party-console's
  own API has no authentication of its own** - confirmed by reading its
  coordinator source. A real domain with just TLS and no auth is still a
  fully open control panel for your account to anyone who finds the
  address. This is not optional.

## Step 1: Create the droplet

1. In the DigitalOcean control panel, create a new Droplet:
   - **Image:** Ubuntu 24.04 LTS
   - **Size:** the cheapest "Basic" droplet (1 GB RAM / 1 vCPU) is enough
     to start - party-console's coordinator is lightweight; bump up later
     if the dashboard feels slow with more characters running.
   - **Authentication:** SSH key (upload your public key, or have
     DigitalOcean generate one) - not a password. Password-only root login
     on a public server is asking for it to get brute-forced.
   - **Region:** whichever is geographically closest to you.
2. Note the droplet's public IP address once it's created.

## Step 2: Point a domain at it

1. In whatever registrar/DNS provider manages a domain you own (or a free
   subdomain service if you don't have one), add an **A record**:
   - Host: `party` (or whatever subdomain you want, e.g.
     `party.yourdomain.com`) or `@` for the bare domain.
   - Value: the droplet's public IP.
   - TTL: default is fine.
2. Wait for it to propagate (usually minutes, occasionally up to an hour).
   Check with `nslookup party.yourdomain.com` - it should return the
   droplet's IP.

## Step 3: Basic server setup

SSH into the droplet (`ssh root@<droplet-ip>`) and run:

```bash
apt update && apt upgrade -y

# A non-root user to work as, rather than staying root permanently
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Docker + Compose plugin (official install script)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Log out and back in as `deploy` from here on (`ssh deploy@<droplet-ip>`).

**Firewall - use DigitalOcean's Cloud Firewall** (Networking → Firewalls in
the control panel) rather than configuring `ufw` by hand; it's enforced
outside the droplet itself, so a misconfiguration on the droplet can't
accidentally expose something. Create one rule set:
- Inbound: SSH (22) from your IP only if you know it and it's static,
  otherwise from anywhere; HTTP (80) from anywhere; HTTPS (443) from
  anywhere.
- **Do not** open port 3010 (party-console's own port) to the public
  internet - it stays reachable only from the droplet itself (`127.0.0.1`),
  behind the reverse proxy set up next.
- Apply it to the droplet.

## Step 4: Reverse proxy with real HTTPS + a password gate

This is a second, separate Caddy instance from the one party-console
bundles internally - this one terminates real public HTTPS with a
Let's-Encrypt certificate and requires a password before anything reaches
party-console at all.

```bash
sudo apt install -y caddy
```

(If that package isn't available on your Ubuntu version, use Caddy's own
apt repo instructions at https://caddyserver.com/docs/install#debian-ubuntu-raspbian.)

Generate a password hash for the gate:

```bash
caddy hash-password
# paste a password when prompted, copy the resulting hash
```

Edit `/etc/caddy/Caddyfile` (replace the domain and the hash):

```
party.yourdomain.com {
    basicauth {
        yourusername <paste the hash here>
    }
    reverse_proxy 127.0.0.1:3010
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically gets and renews a real Let's Encrypt certificate for
your domain the first time it's requested - nothing else to configure.

## Step 5: Run party-console itself

```bash
mkdir ~/party-console && cd ~/party-console
curl -LO https://github.com/Ryan-Haines/adventureland-party-console/releases/latest/download/compose.yaml
```

Create a `.env` file next to it:

```
AL_HOST=127.0.0.1
AL_PORT=3010
AL_PUBLIC_URL=https://party.yourdomain.com
```

`AL_HOST=127.0.0.1` is what keeps party-console's own port reachable only
from the droplet itself, not the public internet - Caddy (Step 4) is the
only thing the internet can actually reach. `AL_PUBLIC_URL` tells
party-console its own real public address, so links/redirects it
generates are correct.

```bash
docker compose up -d
docker compose logs -f    # watch it start; Ctrl+C to stop watching (the containers keep running)
```

## Step 6: Complete party-console's own setup

Visit `https://party.yourdomain.com`, enter the password from Step 4, and
you'll land in party-console's own first-run setup - connecting your game
account, choosing headless characters, etc. This is the part that needs
you personally present with the game running (the `show_json(parent.user_id
+ "-" + parent.user_auth)` session-token step from earlier) - nothing
about running this on a droplet instead of your PC changes that step.

Once set up, in **Settings**, turn on **"Automatically download and
install new versions when available."** That's the entire "keep it
updated as Ryan updates his code" story from here on - checks run at
startup and every 6 hours; when a new stable release exists, it downloads
in the background and shows a green `!` you click to restart into it.
Nothing to `git pull` or rebuild yourself.

## Step 7: "Opening the program from Ryan on my PC"

Once it's running on the droplet, there's nothing to install on your PC at
all for this - the "program" now lives on the droplet, and your PC's
browser is just a client of it, the same way any other browser or the
mobile app will be. Open `https://party.yourdomain.com`, log in with the
password, and that's the dashboard - same as it would look running
locally, just reached over the internet instead of `localhost`.

## Verifying it end to end

- [ ] `https://party.yourdomain.com` loads over real HTTPS (padlock, no
      certificate warning) from your PC.
- [ ] The password gate actually blocks access without the password (try
      it in a private/incognito window).
- [ ] party-console's own setup completes and at least one character
      shows as connected in the dashboard.
- [ ] `docker compose ps` on the droplet shows both `party-console` and
      `updater` containers healthy.
- [ ] Automatic updates are turned on in Settings.

---

# Continuing the mobile app

With a real server running on a real domain, several things that were
blocked before are now possible:

1. **Point the app at it for real, using the simplest trust mode.** Open
   the connection screen, enter `party.yourdomain.com` (the app defaults
   to `https://`). Since this is now a real Let's Encrypt certificate, it
   should succeed via ordinary `TrustMode.SYSTEM` - no certificate pinning
   needed at all, unlike the LAN/self-signed scenarios the trust-mode
   system was built to also handle.
   - The reverse proxy's HTTP Basic Auth (Step 4 above) isn't something
     the app currently sends - you'll hit a 401 first. The pragmatic fix
     for now: put the username/password directly in the URL when testing
     (`https://user:pass@party.yourdomain.com`), which OkHttp and most
     HTTP clients honor. A real fix (a login screen that stores Basic
     Auth credentials alongside the server settings) is a small, concrete
     next feature - see below.

2. **Install a real Android toolchain to actually run it.** The build was
   only ever verified via command-line Gradle on this machine (see this
   repo's own README) - install Android Studio to run it on an emulator
   or a real phone over USB debugging, and see the UI for the first time
   instead of just a successful compile.

3. **First real fixes to expect.** The live-protocol port
   (`network/LiveProtocol.kt`, `network/LiveConnection.kt`) has only ever
   been checked against party-console's *source code*, never real SSE
   traffic. Point the app at the live droplet and watch for:
   - Does the character list actually populate?
   - Does a stat change (HP dropping in combat) show up live?
   - Does the app reconnect cleanly if you kill the droplet's container
     for a few seconds (`docker compose stop party-console` then
     `start`)?

4. **Concrete next features, roughly in order of value:**
   - A login screen for the reverse proxy's Basic Auth (store username +
     password alongside the server URL in `ServerConfigStore`, send as an
     `Authorization` header on every request - a small, well-scoped
     addition to `network/PartyApiClient.kt`).
   - Wire up 2-3 real command buttons based on what you actually find
     yourself wanting from a phone first (a merchant "send to bank" button
     is a natural first candidate - `PartyApiClient.sendCommand` already
     exists and is untested against a real server).
   - Push notifications for something worth knowing about away from the
     phone (a character death is the obvious first one) - the SSE stream
     already carries this; it needs a background service to keep the
     connection alive when the app isn't in the foreground, which Android
     restricts more aggressively than most platforms, so this is a real
     piece of work, not a quick add.

5. **Publish the app's own GitHub repo**, if you want it installable by
   others per the original goal - it's currently only committed locally
   at `F:\CodingProjects\adventureland-party-mobile`. `git remote add
   origin <a repo you create>` and push whenever you're ready; nothing
   about the code depends on where it's hosted.
