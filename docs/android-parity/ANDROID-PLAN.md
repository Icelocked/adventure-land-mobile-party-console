# Android native port: plan to PWA parity

Started 2026-10-04. Goal: the native Android app (`app/`, Kotlin + Compose)
does everything the PWA (`web/`) does, which itself is at parity with
party-console v1.2.0 (`docs/parity-review/BUILD-PLAN.md`).

## Ground rules

- **Native, not a wrapper.** The PWA already is the web build; the APK
  exists to be a real native app.
- **The PWA is the spec.** Same wire calls, same fields, same defaults, same
  confirmations and gating. Ryan's dashboard stays the base behind both;
  when the PWA and the dashboard disagree, the dashboard wins and the PWA
  gets fixed too.
- **Keep the layout and flow of the PWA** (home party list, character detail
  sections, account menu, item options list with Item details as one option),
  rendered with Material 3. Mobile differences (save button vs autosave,
  sheets vs dialogs) are fine as long as the result on the console is the same.
- **Mirror the PWA's module layout** so a PWA change maps to one obvious
  Kotlin file:

  | PWA | Android |
  |---|---|
  | `api/partyApi.ts` | `network/PartyApi.kt` |
  | `models/state.ts`, `models/*.ts` | `model/State.kt`, `model/*.kt` |
  | `lib/*.ts` (pure ports) | `domain/*.kt` |
  | `data/PartyDataProvider.tsx`, `data/use*.ts` | `data/PartyRepository.kt`, `data/*.kt` |
  | `components/*` | `ui/components/*` |
  | `screens/**` | `ui/**` (same names) |

- **Native extras stay.** QR pairing, the certificate trust-on-first-use
  flow and cleartext/Tailscale options are kept.

## Verification

- Every change: `./gradlew compileDebugKotlin testDebugUnitTest` locally (JDK
  17 and the SDK live in `F:\CodingProjects\tools`; verified working).
- Pure ports (`domain/*`) get JVM unit tests using the same cases as the
  PWA's Vitest tests.
- UI behavior: the PWA's 209 Playwright specs are the checklist. Proposed
  harness: Robolectric + Compose UI tests on the JVM against an OkHttp
  `MockWebServer` that mirrors `e2e/fixtures/mockPartyServer.ts`. That runs
  here and in CI without an emulator. (Alternative: install the emulator
  and a system image locally.)
- No new blocking CI job until it has run green locally.

## Current state (audit 2026-10-04)

The app is ~10.3k lines and predates the whole parity effort (no commits
since 2026-09-29). Status per BUILD-PLAN package, from the code:
**P** = partial (exists, behind the PWA), **M** = missing.

### Destructive bugs confirmed in the APK (Phase A0)

| ID | Bug in the APK |
|---|---|
| P0-01 | No `section=config` fetch; config-seeded controls read whatever `state` returns |
| P0-04 | Formation sends `leader`, `character` and `follow` in one request |
| P0-07 | Hunt settings saved without `character` |
| P0-08 | Focus radius silently resets to 400 when the field doesn't parse |
| P0-11 | Bankboi prefix can be saved blank |
| P0-15 | Sell to NPC always sends quantity 1, no quantity sheet or confirmation (character and bank) |
| P0-16 | Auto NPC-sale on the merchant sends `character` |
| P0-18 | WTB `priorityOverride` dropped when null, so it can never be cleared |
| P0-20 | Bank withdraw has no double-tap guard |
| P0-23 | No "Go home" |
| P0-24 | Realm switch has no confirmation or Fatigue/Hop Sickness warning |

The remaining P0 items (02, 03, 05, 06, 09, 10, 12, 13, 14, 17, 19, 21, 22,
25) are re-checked one by one in A0 against the PWA fix.

### A0 status (2026-10-04): done, compile- and unit-test-verified

Every P0 item fixed in the APK by porting the PWA's corrected code:
02 (no redirect-following, "Session expired" banner with Pair again, poll
survives errors), 04, 05 (`stateLoaded` gate on every server-seeded
control), 06, 07 (per-character route, field-by-field saves, read-only
for followers), 08, 09 (whole policy incl. potion item), 10, 11, 12, 13,
14, 15 (shared `NpcSaleSheet`), 16, 17, 18, 19 (origin-tagged listings +
buy confirmation), 20, 22, 23, 24, 25. P0-21 doesn't apply (no Patinder
code). P0-01 (section polling) and P0-03 (mock) belong to A1.

Found and fixed on the way, beyond BUILD-PLAN's P0 list:
- **No cookie jar**: the pairing cookie was thrown away, so the APK could
  never work with "Require secure pairing" on. Now persisted, encrypted.
- `farming-mode` sent no `character` (changed the leader's policy).
- Bank withdraw let you pick any character; it now goes through the
  configured merchant, with the auto-bank-mark confirmation.
- NPC sale from the merchant's own bag used source `character`.
- Merchant detection by class replaced with `merchantCharacter` (F1) on
  the character screen and item panel.

Known gap for A1: `androidTest` doesn't resolve (`ui-test-junit4` has no
BOM on the androidTest classpath) - pre-existing, CI only runs assembleDebug.
(Fixed in A1.)

### A1 status

- [x] Data layer: `data/PartyRepository.kt` ports PartyDataProvider.tsx -
  per-section single-flight polling on query-cache.tsx's cadences (core 2s,
  config 15s, bank/market/logs/mail/escape, catalog per referenceRevision,
  fast/inventory while the stream is down), `{...current, ...patch}` merge,
  account switch reset, action-driven refresh (`data/QueryActions.kt`,
  verbatim query-actions.ts), screen interest (`DomainInterest`), pause
  in the background (ProcessLifecycleOwner), config-loaded gate,
  diagnostics, server clock offset, latency, logs/escape/mail errors.
  The catalog (the biggest payload) is decoded once per revision and
  never fetched twice for one.
- [x] Test harness: `web/e2e/fixtures/exportAndroidFixtures.ts` writes the
  PWA mock's section payloads to `app/src/test/resources/fixtures`;
  `FakeConsole` (MockWebServer) serves them; Robolectric runs Compose
  screens on the JVM (`FormationScreenTest` ports formation.spec.ts).
- [x] `model/State.kt`: PartyStateDynamic moved here with all 105 fields of
  models/state.ts (55 were missing) and their types; shapes no ported
  feature reads yet stay raw JSON. A field whose shape changes is rejected
  alone at merge time and keeps its last good value (F6).
- [x] Typed `CharacterDiagnostics` from core's characterDetails, with the raw
  object kept and presence (`online()`, 10s) (F2).
- [x] API results: `CommandResult.data` (whole body), `Failure.status/body/code` (F3).
- [ ] Shared UI primitives: action toast, confirm, sheet, item tile (F5)
- [ ] Navigation shell matching the PWA routes; error boundary (F4)

### Packages

| Phase | Package | APK |
|---|---|---|
| 2 Account | R1 Roster, slots, session controls | M (list only) |
| | R2 Realm panel | P |
| | S1 Header and status | M |
| 3 Merchant | M1 Merchant card | P |
| | M2 Merchant settings | M |
| | M3 Routines | P |
| | M9 Rule conflicts | M |
| 4 Bank, mail | B1 Bank item actions | P |
| | B2 Floors and vaults | P |
| | B3 Bankbois | M |
| | B4 Mail (attachments) | P |
| 5 Items | I1 Inventory tiles, banners | P |
| | I2 Options list (Item details as an option) | P |
| | I3 Deconstruction | P |
| | I4 NPC-sale management | P |
| | I5 Equipment panel | P |
| | I6 Item details | P |
| | I7 Gear comparison | P |
| | I8 Auto-rule lists | P |
| 6 Market | M4 Stand sheet | P |
| | M5 Stand listing dialog | P |
| | M6 Market tabs | P |
| | M7 WTB orders | P |
| | M8 Marketplace settings | M |
| 7 Character | C1 Header, stats, statuses | P |
| | C2 Farming and Hunt | P |
| | C3 Focus and farming areas | P |
| | C7 Travel | P |
| | C8 Combat log | M |
| 8 Upgrades | U1 Offerings and upgrade preview | P |
| | U2 Mark labels | P |
| | U3 Lucky slot | M |
| | M10 Commerce carts | P |
| | M11 Exchange workflow | M |
| 9 Events, map | C4 Events and anniversary | M |
| | C5 Daily dungeons | M |
| | C6 Live map | M |
| 10 Reference | X1 Bestiary, monster detail | P |
| | I9 Catalog and comparison | P |
| | C9 Skills | P |
| | S2 Settings and console management | P |
| | S3 Logs | P |
| PWA extras | Freshness/hang indicators | M |
| | Phone notifications | M |

## Phases

- **A0 — Stop destructive behavior.** Fix every P0 item in the APK, small
  commits, then a patch release so a sideloaded APK stops writing bad data.
- **A1 — Foundations.**
  - Data layer like the PWA's: section polling (`core`, `fast`, `config`,
    `logs`, `catalog`) on the dashboard's cadences, mail, escape, the live
    stream; session-lost handling.
  - `model/State.kt`: typed port of `models/state.ts`.
  - `PartyApi.kt`: port of `partyApi.ts`; results carry parsed `data`,
    `status`, `code`, `body`.
  - Configured merchant everywhere (F1), full character details (F2).
  - Shared UI: sheet, dialog, confirm, action toast, item tile, sprite.
  - Navigation shell matching the PWA routes; error boundary.
  - Test harness: MockWebServer mock + Robolectric Compose tests.
- **A2–A10 — Feature packages** in BUILD-PLAN's order (the table above). Each
  package: read the PWA code and its e2e spec, port, port the tests, compile,
  commit.
- **A11 — Native extras.** Map canvas (C6) in Compose `Canvas`; phone
  notifications (see below).
- **Release** once all packages are done, then keep in step with every
  PWA change.

## Open decisions

1. **UI test harness:** Robolectric on the JVM (recommended) or an emulator.
2. **Notifications in the APK:** the notifier sends Web Push, which a native
   app can't receive. Options: Firebase Cloud Messaging (needs a Firebase
   project and its credentials in the notifier), UnifiedPush/ntfy
   (self-hosted friendly), or a background poll (WorkManager, at most every
   15 minutes). Decide at A11.

## Queued after A0 (not Android)

- PWA push alerts requested 2026-10-04: **inventory full** and **bank full** - done (notifier, 2026-10-04).
