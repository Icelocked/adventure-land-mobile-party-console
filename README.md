# Party Console Companion

[![Download latest release](https://img.shields.io/github/v/release/Icelocked/adventure-land-mobile-party-console?label=Download&style=for-the-badge)](https://github.com/Icelocked/adventure-land-mobile-party-console/releases/latest)

An independent companion app for
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console),
available as a native **Android app** or a self-hosted **PWA (works on
iPhone too)**. Neither modifies or depends on party-console's source code -
they're separate clients of the same HTTP + Server-Sent-Events API
party-console's own web dashboard talks to (`/party-api/*`, and
`/party-api/dashboard-stream` for live updates). If you're already running
party-console, you can install either client separately and point it at
your own server; nothing here needs to be merged into or bundled with
Ryan's project.

## Choose how to install

Both clients have full feature parity - same screens, same actions, same
data. Pick whichever fits your platform.

|  | **Android** | **PWA** (any platform, incl. iPhone) |
|---|---|---|
| **What it is** | A native Kotlin + Jetpack Compose app | A React web app you self-host and "Add to Home Screen" |
| **Install** | Sideload the `.apk` from [Releases](../../releases/latest) | Self-host with Docker (5 min), then open it in your phone's browser |
| **Works on** | Android only | Android, iPhone, iPad - anything with a browser |
| **Setup** | Nothing extra - point the app at your server | Requires Docker (or similar) on the machine running party-console |
| **Details** | [Installing (Android)](#installing-android) below | [DEPLOYMENT.md](DEPLOYMENT.md) (section 3b) |

Either way, your phone first needs a network path to your party-console
server - see "[Before you install](#before-you-install-your-phone-needs-a-path-to-your-server)"
below.

## Why this exists

party-console's web dashboard is excellent at home, on the same machine or
LAN as the game. This app is for checking on things - and acting on them -
from a phone, away from home, while party-console keeps doing the real work
on a PC or server somewhere. The goal is to make everything the web
dashboard shows and does available from a phone in a touch-friendly layout,
not a scaled-down subset.

## What it does

- **Character list** - class icon, level, HP/MP, one-line activity, gold
  carried per character and the account total, pull-to-refresh.
- **Character detail** - a sticky vitals header (HP/MP/XP with numbers and
  percent, gold, realm) over a scrollable panel: leader/follower control,
  quick-travel ("Send to...", "Return to leader", merchant's "Go home"),
  the merchant job queue, an equipment grid, an inventory grid, restock
  policy, gold target, and the full auto-mark rule management (view and
  remove every standing NPC-sale/deconstruction/stand/upgrade/compound/
  merchant/bank rule) - the same account-wide automation controls the web
  dashboard exposes, not just a read-only view.
- **Item details** - tapping any item (inventory, equipment, or the
  catalog) opens the same rich item-details view as party-console's own
  "left-click an item" dialog: eligible classes, a level-stat-preview
  slider using the game's real upgrade/compound scaling curve, buy/sell
  NPC prices, set bonuses, crafting recipes and what an item is used to
  craft, monster drop tables, and NPC exchange/box odds - each shown only
  when the item actually has that data, with tap-through navigation into
  related items and monsters.
- **Item actions** - equip/unequip, use, mark or auto-mark for bank/
  merchant/stand/NPC-sale/deconstruction/upgrade/compound, stat-scroll
  marking, give to another character - the same command set the web
  dashboard's item context menu offers.
- **Account-wide screens** (reachable from any character via the hamburger
  menu): Mail (inbox, compose, collect attachments), Catalog (browse and
  inspect every known item), Bestiary (monsters and their drop tables),
  Skills (per-class skill reference), Inspect Stand, View Market (ALData/
  Ponty listings plus a live player-stand search, with buying), Inspect
  Bank (shared vault, gold breakdown, withdraw/sell/deconstruct), Logs
  (combat, merchant activity, raw in-game chat/system log), and Settings
  (pairing, bankboi prefix, realm switching, roster).

## Architecture

Two independent clients live in this repo, sharing nothing but the API
they talk to and the design they're ported from - `app/` (Android, Kotlin
+ Jetpack Compose) and `web/` (the PWA, React + TypeScript + Vite). Neither
depends on the other; a change to one doesn't require touching the other,
though new features are generally ported to both.

- **Not a WebView wrapper.** The Android app is a real native app with its
  own Compose screens, and the PWA is a real React SPA - neither is a
  wrapped browser tab pointed at party-console's own dashboard, because
  that doesn't give a good mobile experience for "glance at a character
  card, tap into their inventory."
- **Talks to party-console's real API**, not a reimplementation of any of
  its logic. Several pieces are ported directly from party-console's own
  client source (`dashboard/features/party/`), deliberately kept faithful
  rather than "improved", so each client's view of the world can never
  drift from what the official web dashboard shows for the same server.
  The PWA (`web/src/`) ports the same logic straight into TypeScript,
  closer to the original source since both are TS/JS. The Android app
  (Kotlin) ports it one layer further:
  - `network/LiveProtocol.kt` ports `live-protocol.ts`'s snapshot/delta/
    heartbeat message reconciliation exactly.
  - `network/LiveConnection.kt` ports `dashboard-live.tsx`'s SSE connection
    handling (heartbeat watchdog, reconnect-on-failure) using OkHttp's SSE
    support in place of the browser's native `EventSource`.
  - `ui/itemdetail/ItemFormulas.kt` ports the item-detail math (NPC sell
    price, per-level stat scaling) verbatim from `npc-sale-value.tsx` /
    `calculated-level-properties.tsx`.
  - `model/*.kt` mirror the dashboard's own type shapes (`char.tsx`,
    `item.tsx`, `item-meta.tsx`, `condition.tsx`, ...) field-for-field.
  If party-console's own client code changes, re-port from the new source
  rather than guessing at what changed.
- **No assumption about where the server lives.** party-console is
  explicitly designed to run standalone from its display (see its own
  README) - a home PC, a Raspberry Pi, or a VPS. The Android app's
  connection screen (`ui/connection/`) just asks for a server address and
  figures out how to trust it from there; the PWA is served from wherever
  party-console itself runs, so it never needs to ask. Nothing here is
  Tailscale-specific, domain-specific, or home-network-specific.

## Connection security model

**This section is about the Android app specifically.** The PWA has no
connection screen at all - it's served *from* party-console's own machine
(see [DEPLOYMENT.md](DEPLOYMENT.md) section 3b), so it always talks to the
same origin it was loaded from; there's no address to configure or trust
decision to make.

There's no single right answer for how a self-hosted party-console server
is reached - see `network/ServerConfig.kt`'s `TrustMode` for the reasoning.
The Android app supports three, matching what similar self-hosted companion apps
(Home Assistant, Syncthing, Jellyfin, Nextcloud) already do for the exact
same problem:

1. **Ordinary HTTPS** (`TrustMode.SYSTEM`) - the server is behind a real
   domain with a normal certificate (e.g. your own reverse proxy in front
   of the coordinator on a VPS). No special setup on the phone.
2. **Pinned self-signed certificate** (`TrustMode.PINNED_CERTIFICATE`) -
   party-console's own bundled HTTPS (a local, self-issued CA meant to be
   trusted on "the game computer") isn't something a phone can install the
   same way. The connection screen shows the certificate's SHA-256
   fingerprint on first connect; you confirm it matches what your server
   actually presents (check your Caddy setup output) before it's trusted.
   Trust-on-first-use, not blind trust.
3. **Plain HTTP** (`TrustMode.CLEARTEXT`) - for a server only reachable
   through an already-encrypted tunnel (Tailscale, WireGuard, a LAN),
   where an extra layer of TLS on top is redundant.

party-console's own `/party-api/*` routes have no authentication layer of
their own (confirmed by reading its coordinator source) - the trust model
is entirely "whoever can reach the server at all is trusted." **Never**
point this app at a server exposed directly to the public internet without
your own authentication in front of it (e.g. your reverse proxy requiring
a client certificate or HTTP auth) - a real domain with just TLS and no
auth is still an open API to anyone who finds the address.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for a walkthrough of the Tailscale
path specifically - the only one actually set up and tested for this
project so far (see "Why not a domain or a public IP?" in that doc for
why the others aren't documented step-by-step here).

## Before you install: your phone needs a path to your server

This is the part that trips people up, so it's worth saying plainly, for
**either** client: party-console runs on your gaming PC (or a server),
reachable on your home network. Your phone, when you're out of the house,
is **not** on that network - so before either client can do anything, you
need *some* way for your phone to reach that machine from anywhere.

**[Tailscale](https://tailscale.com) is the recommended, tested path** -
install it on both your PC and your phone (both free), sign into the
same account on each, and your phone can reach your PC by its Tailscale
address from anywhere, as if it were on your home network. No router
configuration, no public exposure. **[`DEPLOYMENT.md`](DEPLOYMENT.md)
walks through this exact setup end to end** - start there.

A domain with a reverse proxy, or a raw port-forward, are also possible
in principle (the Android app's connection screen supports both - see
"Connection security model" above) but aren't documented here step-by-step,
because doing either *correctly* - the right reverse-proxy config, firewall
rules, and an actual authentication layer in front of an API that has
none of its own - is real work that hasn't been set up and verified for
this project yet. Tailscale sidesteps needing any of that.

## Installing (Android)

For the PWA, see [DEPLOYMENT.md](DEPLOYMENT.md) instead - self-hosting is
the install step there, there's no separate app package to download.

Once your phone has a way to reach your server (see above), grab the
latest APK from this repo's [Releases](../../releases) page and install
it - you'll need to allow "install unknown apps" for whatever app you
download it with (Chrome, Files, etc.), since this isn't distributed
through the Play Store.

It's a debug-signed build, not signed with a dedicated release key -
perfectly fine for sideloading, but if you ever uninstall and reinstall
from a build signed by a different machine, Android will ask you to
uninstall the old one first (it treats them as different apps for
upgrade purposes even though they're the same app).

On first launch, the connection screen asks for your party-console
server's address - see "Connection security model" above for what to
enter depending on how you've set your server up.

## Building from source

### Android

**With Android Studio (recommended for development):** open the project
root and let it sync; everything needed is declared in
`app/build.gradle.kts`. Point its SDK Manager at JDK 17+ and the standard
SDK components (platform 35, build-tools 35.0.0) if it doesn't already
have them.

**From the command line:** with a JDK 17+ on `PATH` and a
`local.properties` file (gitignored, not included) pointing `sdk.dir` at
an Android SDK containing `platform-tools`, `platforms;android-35`, and
`build-tools;35.0.0`:

```
./gradlew assembleDebug
```

Output APK: `app/build/outputs/apk/debug/app-debug.apk`.

**A real gotcha worth knowing about on any machine with a nearly-full
system drive:** Gradle's cache and temp directories default to the system
drive (`%USERPROFILE%\.gradle` on Windows) regardless of where the JDK/SDK/
Gradle distribution itself are installed. If that drive is low on space,
`assembleDebug` can fail late (during dexing) with a disk-space
`IOException` that has nothing to do with the app's code. Fix by
redirecting both before building:

```
$env:GRADLE_USER_HOME = "D:\wherever\has\space\gradle-home"
$env:TEMP = "D:\wherever\has\space\temp"
$env:TMP = "D:\wherever\has\space\temp"
```

### PWA

With Node 22+ on `PATH`:

```
cd web
npm ci
npm run build
```

Output: `web/dist/` - a static bundle that needs to be served alongside
party-console itself for `/party-api/*` proxying to work (see
[DEPLOYMENT.md](DEPLOYMENT.md) section 3b for the Dockerfile/nginx setup
that does this - party-console's API has no CORS headers, so anything
serving this bundle needs to proxy `/party-api/*` itself rather than
letting the browser call party-console cross-origin).

For local development (`npm run dev`), set `VITE_DEV_PROXY_TARGET` in a
gitignored `web/.env.local` to your party-console server's address - Vite's
own dev server proxies `/party-api/*` to it, mirroring what nginx does in
production.

## Contributing

Issues and PRs welcome - this is a hobby project maintained alongside
actually playing the game, so response time varies. If you're adding a
new screen or command, check whether party-console's own dashboard source
already has the equivalent (`dashboard/features/party/`) and port from
there rather than guessing at field names or command shapes; several bugs
this project has hit came from assuming a wire shape instead of checking.

## License

[MIT](LICENSE)
