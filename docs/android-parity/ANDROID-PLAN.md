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
- [x] Action toast on every POST (lib/actionToast.ts) at the app root (F5).
  Confirm/sheet primitives are Material 3's; item tiles come with I1.
- [x] Account menu sheet from home and every character, in the dashboard's
  order with Mail (N) and Inspect stand · N/16 (`domain/StandInspection.kt`,
  verbatim stand-inspection.ts); the per-character menu screen is gone.
  Crash report on next launch as the error boundary (F4).
- [x] Live vitals: numeric `target` and fractional `ping` no longer fail
  the decode (the character showed as not reporting).

Robolectric notes: `app/src/test/resources/robolectric.properties` sets
SDK 34, NATIVE graphics (the legacy mode doesn't lay out popups/sheets)
and a 411x891dp phone.

**A1 done.**

### A2 status: done

- R1: home lists live characters in the console's order
  (`domain/Roster.kt`: character-order.ts, pending-character-cards.tsx),
  pending cards with portrait (the coordinator's doll HTML in a WebView),
  status and delayed help; "Load character slot N" with the roster picker
  (headless / Steam / switch Steam primary) and Create character; Bankboi
  Active card; session controls (Steam, headless, log out - confirmed,
  refused if the session changed) on the character screen.
- R2: realm panel (done in A0: confirmation, split realms, operation).
- S1: header version line, console-update "!", party gold (bank +
  carried, exact on tap), latency, freshness badges per character.
- Not yet: the debug-instance browser link (S2), daily-dungeon panel and
  in-dungeon Escape (C5).

### A3 status: done

- M1: merchant logistics (stuck warning, priority/label/target/status per
  job, retry, Merchant's Luck upkeep, cancel rules) with the activity log
  inline (the separate activity screen is gone); merchant controls with
  gathering readiness / No tool, Send to party group picker, donation XP
  preview, giveaway realm + online-player picker. `domain/Merchant.kt`:
  merchant-job-label.ts, duration, party-groups.ts verbatim.
- M2: merchant settings (bank sorting, upgrade buy batch, stand location,
  delivery/withdrawal trips, thresholds).
- M3: routines (done in A0).
- M9: shared-rule conflicts card (shared-rules.ts itemRuleConflicts and
  automatic-commerce-rule-key.tsx verbatim).

### A4 status: done

- B1: bank screen (gold breakdown, sort-on-next-visit, search with
  dimming, collapsible packs with free counts and items1's RESERVED slots,
  per-item Withdraw/Stand/NPC/Deconstruct marks, Auto stand, Merchant's
  Luck clover) and the bank item panel in the dashboard's order: Item
  details, withdrawal (one / all, auto-bank-mark consent), stand (mark /
  unmark / auto, full 13-preset listing form), upgrade (via withdrawal /
  auto), deconstruction (mark / auto with rewards), NPC sale (sell /
  auto), Clear all marks. Shared `StandListingForm`,
  `DeconstructionConfirmation`, `AutoNpcSaleConfirmation`.
- B2: additional storage - floors (accessible / key needed, keys owned),
  vault unlocks, all confirmed; `bank/unlock` now always sends `kind`.
- B3: bankbois - create (first one confirmed), state, load, error, items
  with bank options, two-step delete when empty.
- B4: mail - inbox, message sheet (collect, two-step delete, reply,
  attachment details), compose with attachments from the merchant, every
  bank pack and each bankboi, quantity, postage, two-step send.
- Fixed on the way: auto-stand sent `character` (the rule is the
  merchant's).
- Offering rows in the bank upgrade options landed with A8 (disabled, as on
  the dashboard).

### A5 status: done

- I1: inventory tiles (item-action-banner.ts priority, stat badges, +level,
  operation overlay, lucky-slot outline, merchant suggested-price details)
  and equipment tiles (15 fixed slots, set progress, mluck clover).
  `domain/ItemValue.kt` (upgradeEstimate reproduces the dashboard's seeded
  JS numbers exactly), `LuckySlot.kt`, `ItemBanner.kt`.
- I2-I5: the item options panel in inventory-panel.tsx's order: Item
  details (opens the browser in its own sheet), Show lucky slot data,
  Equip / Use / Use elixir, Compare with equipped (ring/earring/1-handed
  slot picker), Deliver to (online members, no bankbois; the merchant
  picks Equip / Don't equip), stat scroll, Auto exchange, bank / merchant
  marks and autos, stand (mark / edit / auto), upgrade and auto upgrade
  (tier costs), Buy another level 0, compounding and auto compound (+7
  cap), deconstruction and NPC sale with their confirmations, Clear all
  marks. Equipment: Unequip, Active elixir effect, upgrade marks, Clear all
  marks (equipped).
- I6: item details - live meta over the catalog, character · slot
  context, Add to stand (merchant inventory / bank; disabled when the
  stand is full), Tracktrix bonuses, Compare (character, then slot) into
  the gear comparison, the derived equip slot instead of `type`, hands
  required, exchange sections following the preview level, box / cosmo /
  sixcake labels, drop sort.
- I7: gear comparison ported in full - diagnostics-based projection of
  HP/MP/attack/speeds/armor/resistance/attributes/combat stats, per-side
  level and stat-scroll previews (exotic stats too), the character doll,
  set changes (GAINED / LOST), and the slot picked in the options list.
- I8: automatic rules (merchant only) - NPC sales incl. manual marks,
  deconstruction incl. marks with Retry, stand, upgrades and compounds
  with inline target / remaining edits, upgrade offering rules (Edit /
  Remove / clear), merchant and bank marks; two-tap clear and remove,
  errors shown, tap a tile for its item details. API: removeNpcSaleMark,
  removeDeconstructionMark, retryDeconstructionMark.
- Not yet (owned by later packages): exchange reward tiles with their
  automatic options (M10, A8); the bestiary monster view and "Compare from
  catalog" (X1, A10). Add to WTB landed with A6.

### A6 status: done

- M4: Inspect stand - sales reconciled with the trade slots (Live / Paused,
  read-only unmanaged rows, "Queued sales for stand"), price opens the
  stand form, two-step Remove, long-press suggested price; buy orders with
  N wanted, native batch, priority (saved with the bid revision), Auto,
  Use stand, two-step cancel.
- M5/M7: shared WTB components (`ui/components/Wtb.kt`): the WTB dialog with
  its 15 presets at the exact level, Use stand / Accept higher levels,
  priority, and the full-stand "Make room for a buy order" retry; the WTB
  orders screen with filter, single-field quantity / priority edits with
  the bid revision, price via the dialog, preferences-only toggles, the
  Auto badge and native-stand problems, item picker. Add to WTB in item
  details.
- M6: market - status / setup banner, Live WTS / Live WTB / Classifieds /
  Ponty tabs with counts, one search, WTS filters (deals, bad deals,
  affordable, blacklisted), grouped listings with deal colouring and stale
  dimming, confirmed buys split across grouped listings, Make WTB, selling
  into WTB offers or List when stale, classifieds' Add to WTB / Add to
  stand, Ponty lots. `domain/Market.kt` ports market.ts.
- M8: marketplace settings - auto stand buys, blacklist toggle, manual
  block, strike records with Clear, two-step Clear all.
- Fixed on the way: `aldata-order` now echoes the listing as received (it
  sent only the key); Ponty buys send every key of the lot; `saveBid`
  takes the PWA's options (clear, single-field edits, preferencesOnly,
  replaceStandEntry) and omits an unset priority; a listing without a
  slot no longer sends slot 0. The unused live stand search was dropped
  (Ryan's dashboard never renders its dialog).

### A7 status: done

- C1: character header - party gold and latency in the top bar, the
  switcher row even when the character isn't reporting; vitals header with
  the portrait (opens the stats sheet, Tracktrix badge), online dot, ping,
  BANKING / BANK QUEUED / STOCKING UP, cave map names; the stats sheet
  (character-stats-dialog.tsx: damage reduction, attribute effects,
  primary stat, combat stats); "Active status" with ticking countdowns over
  a depleting bar (`domain/StatusDuration.kt`, status-duration.ts) and the
  condition details sheet.
- C2/C3: farming - live combat target, saved / live mode badge, active
  farming zone, Hunt status block, Hunt that opens the backup setup when no
  backup focus+location exists (use-party-console.tsx setFarmingPolicy),
  monster focus with per-monster priorities and the radius context, the
  route-to-monster farming-area picker (party-monster-travel for the
  leader, character-travel otherwise, Phoenix's ordered patrol via
  navigate-to-monster), followers blocked from routing. `domain/
  FarmingZones.kt` ports farming-zones.ts and farming-areas.ts verbatim.
  Merchant-class non-merchant characters now get the focus picker.
- C7: travel - "Travel to place…" / "Send to…" with the coordinate form
  (character-travel-dialog.tsx), Return to leader only while a different
  leader is online, "Send merchant to…" merchant visits.
- C8: combat log - collapsed, logs-domain interest while open, last 50
  newest first coloured by type, Clear history.
- Not yet (owned by later packages): the live target's monster type and the
  character map / farming-area preview need the map stream (A11); the
  Events chip in Formation (C4, A9); the lucky slot section (U3, A8).

### A8 status: done

- U1: offerings (`ui/components/Offerings.kt`, Offerings.tsx): under Mark
  for upgrade, "Upgrade with Primling / Primordial Essence / Primordial X"
  (needs stock and a source) confirming a one-tier mark, and the server
  upgrade preview (polled every 2 s, Refresh chances); under Auto mark for
  upgrade, "Add upgrade rule" (range, offering, Required / Only if
  available, overlap and destination checks). Equipped items get the same;
  the bank's stay disabled as on the dashboard. Rule Edit in Automatic
  rules uses the same dialog. The separate Offerings screen and its menu
  entry are gone (the PWA has none).
- U2: the option labels (tier counts, "to +N", stat scroll trigger,
  grouped compounding) landed with the A5 options panel.
- U3: the lucky upgrade slot card (merchant) and its 42-slot evidence
  sheet, also opened from the inventory's lucky slot and its options.
- M10: commerce carts - Buy with target level and the 90%-confidence
  budget / max attempts sent with the order, Craft with owned / to-buy
  materials, the recipe preview, next-craft cost and the aggregate
  availability gate, Exchange; missing-material errors listed;
  inventory counts include bankbois.
- M11: exchange workflow - fixed-reward exchanges grouped under their
  currency ("Choose"), box/table results as reward tiles with automatic
  rule banners and their options (Item details, auto bank / stand /
  exchange / upgrade + rule / compound / NPC sale), "Mark multiple" bulk
  rules saved on Done, nested box drill-down, exchange "Add" from item
  details.

Next: A9 (C4, C5, C6 events, dungeons and map).

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
