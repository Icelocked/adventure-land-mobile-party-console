# Party Console Companion

[![Download latest release](https://img.shields.io/github/v/release/Icelocked/adventure-land-mobile-party-console?label=Download&style=for-the-badge)](https://github.com/Icelocked/adventure-land-mobile-party-console/releases/latest)

A phone companion for
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console):
a native **Android app**, and a self-hosted **PWA** that also works on
iPhone. Both talk to the same API as party-console's own web dashboard
(`/party-api/*`, with `/party-api/dashboard-stream` for live updates). They
don't modify party-console; install either one next to your existing setup.

## Install

|  | **Android app** | **PWA** (Android, iPhone, iPad) |
|---|---|---|
| **What it is** | A native Kotlin + Jetpack Compose app | A React web app you add to your home screen |
| **Install** | Download the `.apk` from the [latest release](../../releases/latest) | Add one container to party-console's `compose.yaml` |
| **Updates** | In-app (Settings → App updates) or [Obtainium](https://github.com/ImranR98/Obtainium) | In-app (Settings → Party Console PWA), optionally automatic |
| **Guide** | [DEPLOYMENT.md § 3](DEPLOYMENT.md#3-android-app) | [DEPLOYMENT.md § 4](DEPLOYMENT.md#4-pwa-self-hosted-next-to-party-console) |

Both clients have the same screens and actions. Either way, your phone needs
a network path to the PC running party-console first. [Tailscale](https://tailscale.com)
is the tested way; [DEPLOYMENT.md](DEPLOYMENT.md) walks through it.

## Why this exists

party-console's dashboard works best on the PC next to the game. This app is
for checking on your characters, and acting on them, from a phone while
party-console keeps running at home. Everything the dashboard shows and does
is available in a touch-friendly layout, not a reduced subset.

## What it does

- **Characters**: class, level, HP/MP, current activity and gold per
  character, with the account total.
- **Character detail**: vitals, leader/follower control, travel ("Send
  to…", "Return to leader", the merchant's "Go home"), the merchant's job
  queue, equipment and inventory, restock policy, gold target, and every
  automatic rule (NPC sale, deconstruction, stand, upgrade, compound,
  merchant, bank).
- **Item details**: the dashboard's item dialog: eligible classes, stats by
  upgrade level, NPC prices, set bonuses, recipes, drop tables and exchange
  odds, with links between related items and monsters.
- **Item actions**: equip, use, give, and mark or auto-mark for bank,
  merchant, stand, NPC sale, deconstruction, upgrade or compound.
- **Account screens**: mail, item catalog, bestiary, skills, your stand,
  market (ALData, Ponty and live WTB orders, buying and selling), WTB orders,
  bank, logs, hunt settings, merchant shopping, crafting and exchange,
  events and the Cave of Many Dreams, and settings.
- **Live map**: each character's map with the party, monsters and targets,
  the Cave's floor map, and farming-area previews.
- **Phone notifications**: stuck or idle characters, deaths, errors, full
  bags and bank, finished rules and orders, ended events, rare drops, sales
  and mail ([DEPLOYMENT.md § 5](DEPLOYMENT.md#5-phone-notifications)).

## How it's built

`app/` (Android, Kotlin + Jetpack Compose) and `web/` (the PWA, React +
TypeScript + Vite) are independent clients of party-console's API. New
features go into both.

- **Native, not a wrapper.** Neither app embeds party-console's dashboard in
  a web view.
- **The console's own rules.** Where the dashboard computes something on the
  client (live-update reconciliation, item formulas, rule keys, labels), both
  apps use the same logic as party-console's `dashboard/features/party/`
  source, so they show the same thing the dashboard does. When party-console
  changes that code, update it here to match.
- **No assumption about where the server lives.** The Android app asks for
  an address; the PWA is served from the machine that runs party-console.

## Connection security

party-console protects its API with **pairing**: a browser or app gets a
random pairing token from a device that is already trusted (a QR code or an
invitation link), and every request must carry it. Keep "Require secure
pairing" on.

The PWA needs no connection settings: it is served from party-console's own
machine and always talks to the origin it was loaded from.

The Android app supports three ways to reach a server (see `TrustMode` in
`network/ServerConfig.kt`):

1. **Ordinary HTTPS**: a real domain with a normal certificate.
2. **Pinned self-signed certificate**: the app shows the certificate's
   SHA-256 fingerprint on first connect, and you confirm it matches your
   server before it's trusted.
3. **Plain HTTP**: for a server reached through an encrypted tunnel
   (Tailscale, WireGuard) or your LAN.

Don't expose party-console's own port (3010) to the internet. To reach the
PWA from a network that blocks Tailscale, see Funnel in
[DEPLOYMENT.md § 6](DEPLOYMENT.md#6-reaching-the-pwa-without-tailscale-funnel).

## Building from source

### Android

Open the project in Android Studio, or from the command line, with JDK 17+
and an Android SDK (platform 35, build-tools 35.0.0) named in a
`local.properties` file (`sdk.dir=...`):

```
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

The APK lands in `app/build/outputs/apk/debug/`.

For a signed release build, put a `keystore.properties` (gitignored) in the
project root:

```
storeFile=/path/to/release.jks
storePassword=...
keyAlias=companion
keyPassword=...
```

then run `./gradlew assembleRelease -PappVersion=1.0.0`. The version code
comes from the version (1.0.0 → 10000), so each release upgrades in place.

If the build fails late with a disk-space error on Windows, Gradle's cache
and temp folders are on a full system drive: point `GRADLE_USER_HOME`,
`TEMP` and `TMP` at a drive with space.

### PWA

With Node 22+:

```
cd web
npm ci
npm run build      # static bundle in web/dist/
npx vitest run     # unit tests
npx playwright test
```

The bundle needs a server that also forwards `/party-api/*` to party-console
(see `web/nginx.conf`); `docker build web` builds the same image the
releases publish. For `npm run dev`, set `VITE_DEV_PROXY_TARGET` in
`web/.env.local` to your party-console address.

### Releases

Pushing a tag like `v1.0.0` runs `.github/workflows/release.yml`: tests, the
signed APK (from the `RELEASE_KEYSTORE_BASE64` and
`RELEASE_KEYSTORE_PASSWORD` repository secrets), the PWA image
`ghcr.io/icelocked/party-console-pwa` for amd64 and arm64, and a GitHub
Release with the APK and a zip of the PWA bundle.

### Development

- `main` holds released code; releases are tags on `main`. Day-to-day work
  happens on `dev`, which CI also tests, and merges into `main` for a release.
- Debug builds of the Android app are a separate app, "Party Console (dev)",
  so they install next to the release app on the same phone.
- To try PWA changes on a live setup without touching the released PWA, run
  a second container built from your checkout on another port (see
  [DEPLOYMENT.md § 4e](DEPLOYMENT.md#4e-optional-a-development-copy)).

## Contributing

Issues and PRs are welcome. This is a hobby project maintained alongside
playing the game, so replies can take a while. For a new screen or command,
start from the matching code in party-console's
`dashboard/features/party/` rather than guessing field names or command
shapes.

## License

[MIT](LICENSE)
