# Party Console Companion (Android)

An independent Android companion app for
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console).
It does not modify or depend on party-console's source code at all - it's a
separate client of the same HTTP + Server-Sent-Events API party-console's
own web dashboard talks to (`/party-api/*`, and `/party-api/dashboard-stream`
for live updates). Anyone running party-console can install this app
separately and point it at their own server; nothing here needs to be
merged into or bundled with Ryan's project.

## Why this exists

party-console's web dashboard is excellent at home, on the same machine or
LAN as the game. This app is for checking on things (and sending simple
commands) from a phone, away from home, while party-console keeps doing the
real work on a PC or server somewhere.

## Architecture

- **Not a WebView wrapper.** A real native Android app (Kotlin + Jetpack
  Compose) with its own screens, because a wrapped browser tab doesn't
  give a good mobile experience for "glance at a character card, tap into
  their inventory."
- **Talks to party-console's real API**, not a reimplementation of any of
  its logic. Two things are ported directly from party-console's own
  client source (`dashboard/features/party/`), deliberately kept faithful
  rather than "improved", so this app's view of the world can never drift
  from what the official web dashboard shows for the same server:
  - `network/LiveProtocol.kt` ports `live-protocol.ts`'s snapshot/delta/
    heartbeat message reconciliation exactly.
  - `network/LiveConnection.kt` ports `dashboard-live.tsx`'s SSE connection
    handling (heartbeat watchdog, reconnect-on-failure) using OkHttp's SSE
    support in place of the browser's native `EventSource`.
  - `model/*.kt` mirror `char.tsx`/`item.tsx`/`condition.tsx`'s actual field
    names and shapes.
  If party-console's own client code changes, re-port from the new source
  rather than guessing at what changed.
- **No assumption about where the server lives.** party-console is
  explicitly designed to run standalone from its display (see its own
  README) - a home PC, a Raspberry Pi, or a VPS. This app's connection
  screen (`ui/connection/`) just asks for a server address and figures out
  how to trust it from there; nothing here is Tailscale-specific,
  domain-specific, or home-network-specific.

## Connection security model

There's no single right answer for how a self-hosted party-console server
is reached - see `network/ServerConfig.kt`'s `TrustMode` for the reasoning.
This app supports three, matching what similar self-hosted companion apps
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

## Project status

**Confirmed to actually build** (`./gradlew assembleDebug` → BUILD
SUCCESSFUL, a real debug APK) - not just written and hoped to compile.
Still never run against a live party-console server or a device/emulator
(see the sibling `Adventureland-Team` repo's session notes for why - the
actual account connection needs the user present), so the UI has never
been visually verified, only the compile step. What's here:

- Full Gradle project structure, verified to build end to end.
- Connection screen with all three trust modes.
- Live character list (name, level, HP/MP, one-line activity readout).
- Character detail with Activity / Equipment / Inventory tabs.
- The ported live-update protocol and SSE connection handling.

What's deliberately not built yet, in rough priority order:
- Sending actual commands (the network layer's `PartyApiClient.sendCommand`
  exists and is tested against the real route shape, but no UI button
  calls it yet - add these as real party-console usage reveals which
  commands are actually wanted from a phone, rather than building all ~70
  `/party-api/*` routes' UI speculatively).
- Verifying the live-protocol port against a REAL running coordinator (only
  checked against its source, not live traffic) - do this first, before
  adding more screens, since everything else depends on it being right.
- Push notifications for events worth knowing about away from the phone
  (a death, a completed upgrade run) - the SSE stream already carries
  everything needed; this would be a foreground/background service layer
  on top, not a new data source.
- A nav-graph-scoped shared PartyViewModel so navigating between the list
  and detail screens doesn't open a second live connection (see the TODO
  in `ui/AppNavigation.kt`).
- App icon (currently a placeholder vector shape).

## Building

**With Android Studio (recommended for actual development):** open the
project root and let it sync; everything needed is declared in
`app/build.gradle.kts`. Point its SDK Manager at JDK 17+ and the standard
SDK components (platform 35, build-tools 35.0.0) if it doesn't already
have them.

**From the command line** (this is how the build was actually verified,
without Android Studio installed): with a JDK 17+ on `PATH` and
`local.properties` pointing `sdk.dir` at an Android SDK containing
`platform-tools`, `platforms;android-35`, and `build-tools;35.0.0`:

```
./gradlew assembleDebug
```

Output APK: `app/build/outputs/apk/debug/app-debug.apk`.

**A real gotcha hit during setup, worth knowing about on any machine with
a nearly-full system drive:** Gradle's cache and temp directories default
to the system drive (`%USERPROFILE%\.gradle` on Windows) regardless of
where the JDK/SDK/Gradle distribution itself are installed. If that drive
is low on space, `assembleDebug` can fail late (during dexing) with a
disk-space `IOException` that has nothing to do with the app's code. Fix
by redirecting both before building:

```
$env:GRADLE_USER_HOME = "D:\wherever\has\space\gradle-home"
$env:TEMP = "D:\wherever\has\space\temp"
$env:TMP = "D:\wherever\has\space\temp"
```

## Relationship to Adventureland-Team

This project and [party-console](https://github.com/Ryan-Haines/adventureland-party-console)
itself both exist because of a separate project,
[Adventureland-Team](https://github.com/Icelocked/adventureland-team) - a
fully-autonomous 4-character bot built over one long debugging session,
which turned out to be more automation than was actually wanted. See that
repo's `LEGACY.md` and `PARTY-CONSOLE-COMPARISON.md` for the full story and
for hard-won logic worth drawing on if this app or party-console itself
ever need it (gear-priority logic, reliability lessons from a similar
live-update/timeout system).
