# Deploying party-console to DigitalOcean

A complete guide for running
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console)
on a DigitalOcean droplet instead of your home PC, with updates handled by
party-console's own built-in updater. Verified against the actual `v1.0.6`
release's `compose.yaml` and `docs/distribution.md`, not guessed.

**This guide supports three different connection methods, and you pick
one** - a domain, Tailscale, or the droplet's raw IP. None of them are
required by the mobile app or by party-console itself; the app's
connection screen was deliberately built to support all three (and more)
for exactly this reason - your choice here only affects *your* droplet,
never what anyone else running their own copy needs to do. If you're
setting this up for the first time, skip to "Choosing a connection method"
below before Step 1.

## What you'll end up with

- A droplet running party-console fully headless (no Steam client on the
  droplet at all - your characters run headless there).
- Updates handled by party-console's own updater: toggle one setting once,
  it checks every 6 hours from then on, no `git pull`/rebuild workflow.
- Whichever connection method you pick, wired up *correctly* end to end -
  the right `.env` values, the right firewall rules, and the right trust
  mode in the mobile app, so nothing is half-configured for the path you
  actually chose.

## Choosing a connection method

| | Domain | Tailscale | Direct IP |
|---|---|---|---|
| Cost | ~$10-15/yr (or free via a dynamic-DNS service) | Free | Free |
| Reachable from | Anywhere with internet, any device, no extra app | Anywhere with internet, but only devices on your tailnet | Anywhere, no restrictions - that's the problem |
| Public internet exposure | Yes (behind TLS + a password) | No - never reachable outside your tailnet | Yes, in the clear, unauthenticated |
| Setup effort | Moderate (DNS + reverse proxy) | Moderate (Tailscale on the droplet + phone/PC) | Lowest |
| Recommended for | Sharing access with people not on your tailnet, or wanting a normal URL | Personal/small-group use - probably the best fit for "check on things from my phone" | **Quick first test only - never leave running this way** |

If you're unsure: Tailscale is the best default for what this project has
actually been built for so far (you, checking in from your phone). Pick
Domain if you specifically want a shareable normal URL. Direct IP is
included because it's genuinely useful for the first 10 minutes of
verifying the droplet works at all - not as a real, ongoing setup.

---

## Step 1: Create the droplet (all paths)

1. In the DigitalOcean control panel, create a new Droplet:
   - **Image:** Ubuntu 24.04 LTS
   - **Size:** the cheapest "Basic" droplet (1 GB RAM / 1 vCPU) is enough
     to start.
   - **Authentication:** SSH key, not a password.
   - **Region:** whichever is closest to you.
2. Note the droplet's public IP address once it's created.

## Step 2: Basic server setup (all paths)

SSH in as root and run:

```bash
apt update && apt upgrade -y
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Log out and back in as `deploy` (`ssh deploy@<droplet-ip>`) from here on.

---

## Step 3: Set up your chosen connection method

### 3a. Domain path

Add an **A record** at your domain's DNS provider: host `party` (or `@`),
value the droplet's IP. Wait for it to propagate
(`nslookup party.yourdomain.com` should return the droplet's IP).

**Firewall** - DigitalOcean Cloud Firewall (Networking → Firewalls):
inbound SSH (22), HTTP (80), HTTPS (443) from anywhere. **Never** open
3010 publicly - it stays behind the reverse proxy below.

**Reverse proxy with real HTTPS + a password gate** - a second, separate
Caddy instance from the one party-console bundles internally (that one's
local-CA HTTPS is for a LAN, not the public internet). Required here
because party-console's own API has no authentication of its own, and
this path puts it on the public internet:

```bash
sudo apt install -y caddy
caddy hash-password   # paste a password, copy the resulting hash
```

`/etc/caddy/Caddyfile`:

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

Caddy gets and renews a real Let's Encrypt certificate automatically.

**→ Continue to Step 4, using the "Domain" `.env` block.**

### 3b. Tailscale path

On the droplet:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

This prints a URL - open it in a browser and log into your Tailscale
account to authorize the droplet (this one step needs you personally,
same as any account login).

In the [Tailscale admin console](https://login.tailscale.com/admin/dns),
enable **HTTPS Certificates** under DNS settings (one-time, per tailnet).
Then find your droplet's full Tailscale name - run `tailscale status` on
the droplet (it's the hostname shown next to its Tailscale IP), or look
it up under **Machines** in the admin console; it looks like
`droplet.your-tailnet.ts.net`. Note it down, then:

```bash
tailscale cert droplet.your-tailnet.ts.net
```

(substituting your actual name). This writes a real, normally-trusted
certificate (not self-signed) for that name.

Point Caddy at it instead of doing its own ACME lookup (a password gate
is optional here since only tailnet devices can reach this at all, but
costs nothing extra to keep as a second layer):

```bash
sudo apt install -y caddy
caddy hash-password   # optional, skip the basicauth block below if you don't want it
```

`/etc/caddy/Caddyfile` (replace the hostname with your actual one from
above, and the cert paths with wherever `tailscale cert` wrote them -
it prints the paths):

```
droplet.your-tailnet.ts.net {
    tls /path/to/droplet.your-tailnet.ts.net.crt /path/to/droplet.your-tailnet.ts.net.key
    basicauth {
        yourusername <paste the hash here>
    }
    reverse_proxy 127.0.0.1:3010
}
```

```bash
sudo systemctl reload caddy
```

**Firewall** - DigitalOcean Cloud Firewall: inbound SSH (22) only. Do
**not** open 80/443/3010 - Tailscale doesn't need them (it connects
outbound), and this path's entire point is that nothing else is public.

**→ Continue to Step 4, using the "Tailscale" `.env` block.**

### 3c. Direct IP path (quick test only)

Nothing to set up here beyond the droplet itself - this is the "skip
straight to it" option. **Do not leave this running long-term**; use it
to confirm the droplet works, then move to 3a or 3b.

**Firewall** - if you use this at all, at minimum restrict port 3010 in
the Cloud Firewall to specific source IPs you control (your home IP),
not "anywhere" - though note this won't work from a phone on cellular
data, whose IP changes, which is exactly why this path doesn't really
serve the "check in from my phone" goal at all.

**→ Continue to Step 4, using the "Direct IP" `.env` block.**

---

## Step 4: Run party-console itself (all paths)

```bash
mkdir ~/party-console && cd ~/party-console
curl -LO https://github.com/Ryan-Haines/adventureland-party-console/releases/latest/download/compose.yaml
```

Create `.env` next to it - **use the block matching the path you chose:**

**Domain (3a):**
```
AL_HOST=127.0.0.1
AL_PORT=3010
AL_PUBLIC_URL=https://party.yourdomain.com
```

**Tailscale (3b):**
```
AL_HOST=127.0.0.1
AL_PORT=3010
AL_PUBLIC_URL=https://droplet.your-tailnet.ts.net
```

**Direct IP (3c):**
```
AL_HOST=0.0.0.0
AL_PORT=3010
AL_PUBLIC_URL=http://<droplet-ip>:3010
```

`AL_HOST=127.0.0.1` (Domain/Tailscale) is what keeps party-console's own
port reachable only from the droplet itself - Caddy is the only thing
actually exposed. `AL_HOST=0.0.0.0` (Direct IP) is what makes it directly
reachable, which is exactly the risk that path carries.

```bash
docker compose up -d
docker compose logs -f
```

## Step 5: Complete party-console's own setup (all paths)

Visit the address for your path (`https://party.yourdomain.com`,
`https://droplet.your-tailnet.ts.net`, or `http://<droplet-ip>:3010`) and
complete party-console's first-run setup - connecting your game account,
choosing headless characters. This needs you personally present with the
game running (the session-token step) regardless of path.

In **Settings**, turn on **"Automatically download and install new
versions when available."** That's the entire update story from here -
checks run at startup and every 6 hours.

## Step 6: Opening it from your PC / mobile app

Nothing to install on your PC - it's just a browser hitting whichever
address matches your path. For the mobile app's connection screen:

| Path | Address to enter | Trust mode |
|---|---|---|
| Domain | `party.yourdomain.com` | System (ordinary HTTPS - no pinning needed) |
| Tailscale | `droplet.your-tailnet.ts.net` | System (the `tailscale cert` certificate is genuinely trusted, same as a domain's) |
| Direct IP | `<droplet-ip>:3010` | Cleartext (plain HTTP - there's no certificate at all on this path) |

If you set a Basic Auth password (Domain, or Tailscale if you kept it),
the app doesn't have a login screen for that yet - see "Concrete next
features" below. For now, test with credentials in the URL:
`https://user:pass@party.yourdomain.com`.

## Verifying it end to end

- [ ] The address for your path loads (with a real padlock, no warning,
      for Domain/Tailscale).
- [ ] A password/tailnet membership actually blocks access without it.
- [ ] party-console's own setup completes and a character shows connected.
- [ ] `docker compose ps` shows both `party-console` and `updater` healthy.
- [ ] Automatic updates are turned on in Settings.

---

# Continuing the mobile app

1. **Install a real Android toolchain to actually run it.** The build was
   only verified via command-line Gradle so far (see this repo's README) -
   install Android Studio to run it on an emulator or a real phone, and
   see the UI for the first time instead of just a successful compile.

2. **First real fixes to expect**, once pointed at a live server for the
   first time (the live-protocol port has only ever been checked against
   party-console's source, never real SSE traffic):
   - Does the character list actually populate?
   - Does a stat change (HP dropping in combat) show up live?
   - Does the app reconnect cleanly if the container restarts
     (`docker compose restart party-console`)?

3. **Concrete next features, roughly in order of value:**
   - A login screen for Basic Auth (store username/password alongside the
     server URL in `ServerConfigStore`, send as an `Authorization` header
     in `network/PartyApiClient.kt`) - only matters for the Domain/
     Tailscale-with-basicauth paths.
   - 2-3 real command buttons based on what you actually want from a
     phone first (`PartyApiClient.sendCommand` already exists, untested
     against a real server).
   - Push notifications (a death, a completed upgrade) - the SSE stream
     already carries this; needs a background service to survive Android's
     aggressive backgrounding, a real piece of work, not a quick add.

4. **Publish the app's own GitHub repo**, if you want it installable by
   others - currently only committed locally at
   `F:\CodingProjects\adventureland-party-mobile`.
