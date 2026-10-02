# 01 — App shell, live data, roster, realms, account/hosting settings, logs, debug

Auditor 01. Dashboard = `console-v1.2.0` (paths below relative to `dashboard/` or repo root as shown). PWA = `F:\CodingProjects\adventureland-party-mobile\web\src` (paths relative to `src/`).
All findings verified against code; the older PARTY-CONSOLE-COMPARISON.md was not used as evidence.

---

## Summary

| Classification | Count |
|---|---|
| PRESENT | 13 |
| PARTIAL | 27 |
| BROKEN | 7 (plus BROKEN-8, low severity, counted as PARTIAL B2) |
| MISSING | 34 |
| UNREACHABLE | 1 (A7, also counted PARTIAL) |
| N/A (dashboard dead code / desktop-only / browser-agent API) | 4 |

Rows: 81 features across sections A-F. C15 (farming pickers) and D24 (PWA-only extras) are not counted.

### Top 5 most impactful gaps

1. **BROKEN (critical, cross-cutting): the PWA never fetches `GET /party-api/state?section=config`.** In v1.2.0 the coordinator strips every config field out of `section=core&dashboard=1` (`runtime/coordinator/telemetry/public-state.ts:65-82` field list, `:101-105` `omitConfigFields`, `:258-276` core branch). The dashboard fetches `config` separately every 15 s (`dashboard/features/party/query-cache.tsx:128`, `use-party-console.tsx:152-156`). The PWA only polls `core/bank/market/logs/mail/escape` (`data/PartyDataProvider.tsx:134-146`) and gets `catalog` (`:109`). So **`leader`, `followers`, `farmingPolicy`, `farmingProfiles`, `monsterFocus*`, `monsterSearchRadiusByCharacter`, `threshold`, `itemCollectionThreshold`, `marked`, `merchantMarked`, `autoItemMarks`, `autoUpgradeMarks`, `merchantDeliveries`, `standListings`, `standBids`, `npcSaleMarks`, `deconstructionMarks`, `autoNpcSales`, `autoStandMarks`, `upgrades`, `statScrolls`, `compounds`, `autoCompounds`, `autoExchanges`, `goldTargets`, `restockPolicies`, `merchantRoutinePriorities`, `merchantAutomations`, `merchantForceStand`, `huntSettings`, `huntBlacklist`, `bankboiPrefix`, `anniversaryAutoChat`, `phoenixRouteOrder`, `characterAppearances`, `roster`, `classChoices`, `giveawayRealms`** never reach the PWA after startup. They stay at the `emptyPartyStateDynamic()` defaults (`models/state.ts:740-790`). This explains the PWA's own temporary "farmingPolicy/leader never updates" debug banner (`data/queryKeys.ts:16-21`, `screens/character-detail/CharacterDetailScreen.tsx:67-79`). The e2e mock hides the bug because it returns the full state for every `section` (`e2e/fixtures/mockPartyServer.ts:660-664`). Fixing it means adding `api.get('state?section=config')` to the poll and merging it. One small change repairs dozens of read paths across every auditor's slice.
2. **BROKEN: the Follow toggle clears the party leader.** `LeaderFollowerSection.tsx:32` sends `{character, follow, leader: dynamicState.leader ?? null}`. Because of #1, `dynamicState.leader` is always `undefined`, so every Follow tap POSTs `leader: null` and the server sets `state.leader = null` (`runtime/coordinator/http/formation.ts:57-61`). Even after #1 is fixed, sending `leader` on a follow toggle can overwrite a newer leader. The dashboard sends `{character, follow}` only (`connected-character-card.tsx:128`) and `{leader}` only for the leader radio (`party-workspace.tsx:46`).
3. **MISSING: all roster/session management.** None of these exist in the PWA (grepped `slots/`, `steam/action`, `steam/recover`, `roster/create`, `activeSlots`, `characterConnections`, `steamSwitch`: zero hits):
   - loading characters into slots (`roster-controls.tsx`, `roster-picker.tsx` → `/slots/:n/spawn`, `/steam/action login`)
   - Steam primary switching (`/steam/action primary`)
   - per-character session controls (Steam/headless/logout with confirmation; `character-session-controls.tsx`)
   - pending/connecting character cards (`pending-character-cards.tsx`)
   - Create character (`create-character.tsx` → `/roster/create`)
   - Recover Steam handoff (`/steam/recover`)

   A mobile user cannot start, stop, or move any character.
4. **MISSING/PARTIAL: Settings dialog sections.**
   - Console update management (`console-updates.tsx`, `/console-update*`): MISSING.
   - Dashboard state import/export (`dashboard-state-import.tsx`, `settings-export.ts`, `/dashboard-state*`): MISSING.
   - Debug instance (`/console-debug*`): MISSING.
   - "Load setup" link: MISSING.
   - Realm switching is reduced to a bare list, with none of these: confirmation dialog, Realm Fatigue/Hop Sickness warnings, split-realm display, operation progress, or disabled states (`party-inventory-panels.tsx:326-426, 533-601` vs `screens/account/SettingsScreen.tsx:108-146`).
5. **PARTIAL/UNREACHABLE: shell, navigation and logs.**
   - Every account tool (Settings, Logs, Mail, Bank, Stand, Market...) is reachable only from the hamburger on a character detail screen (`CharacterDetailScreen.tsx:61,216`). The home screen's gear opens the server-address override instead (`CharacterListScreen.tsx:37`). With no character online there is no navigation path to Settings or Logs.
   - The Logs screen has no filters, timestamps, character/source selection, anniversary activity, colours, or per-character combat-log clear (`log-sidebar.tsx`, `combat-log.tsx`).
   - The live layer has no SSE-down polling fallback, and there is no render-error boundary.

---

## Feature table

Legend: D = dashboard (`console-v1.2.0/dashboard/...`), P = PWA (`web/src/...`).

### A. App shell / header / session

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| A1 | Title + "Game vX · Console vY" version line | features/party/party-header.tsx:40-41 | `state.gameVersion`; GET `/console-update` → `displayVersion\|current` | MISSING | none: grepped `gameVersion`, `console-update`, `displayVersion` | `gameVersion` is in core (not config), so it is available but unused. |
| A2 | Console-update "!" indicator. Click opens Settings and scrolls to updates. | party-header.tsx:40; console-updates.tsx:33-44 | GET `/console-update` (polled 3 s, console-updates.tsx:20) `.available` | MISSING | none: grepped `console-update`, `available` | PWA `UpdateBanner` (components/UpdateBanner.tsx) is only for the PWA's own service worker, not the console. |
| A3 | Mail button with unread count | party-header.tsx:44-51; mail-count.tsx:2-5 | GET `/mail` `.count` (useInbox 10 s) | PARTIAL | screens/character-detail/AccountMenu.tsx:12 ("Mail", no count); screens/account/MailScreen.tsx:27 (count only inside the screen) | No badge at the entry point. |
| A4 | Catalog / Bestiary / Skills / View market / Inspect bank header buttons | party-header.tsx:52-99 | open dialogs | PRESENT (content audited elsewhere) | AccountMenu.tsx:13-18 | Navigation gap is in A7. |
| A5 | "Inspect stand · N/16" occupied-slot count | party-header.tsx:82; stand-count.tsx:7-15 → stand-inspection `occupiedStandSlots(listings, nativeStand, merchant inventory+presence, bids)` | `standListings`, `nativeStand`, `standBids` (config), merchant inventory `trade*` slots | BROKEN | AccountMenu.tsx:16 (no count); screens/account/StandScreen.tsx:19 uses `dynamicState.standListings.length` | `standListings` is a config field that is never fetched (gap #1), so the count is always 0/16. The formula also differs: it ignores native stand offers, WTB bids, and actual `trade` slots. |
| A6 | Logs toggle (right sidebar) | party-header.tsx:100; party-console.tsx:19,27 | — | PRESENT (as screen) | AccountMenu.tsx:20 → /logs | See section E for content. |
| A7 | Settings gear: opens Settings, seeds realm destination, auto-reveals ALData key | party-header.tsx:101-116 | GET `/aldata/key` if `aldata.hasKey` | PARTIAL / UNREACHABLE | CharacterListScreen.tsx:37 opens the **server-address override** (App.tsx:85-120), not Settings. Settings is only at AccountMenu.tsx:21, which is reachable only from CharacterDetailScreen.tsx:61. | With zero online characters the list screen has no route to /settings, /logs, /mail, /bank etc. (App.tsx:44-59 routes exist but are not linked from `/`). No ALData auto-reveal. |
| A8 | Party gold: bank gold (abbrev.) + combined total, with tooltip of exact bank/carried/combined | party-gold.tsx:9-70 | `bankGold` (core), per-character `vitals.gold` for **active, non-bankboi** slots only (`partyGoldNames`, :9-24); total is null if any balance is unknown (:26-39) | PARTIAL | CharacterListScreen.tsx:24; CharacterDetailScreen.tsx:46 (`bank.gold + Σ every SSE character's gold`) | One combined number only. No bank/total split and no tooltip. It includes any streamed character (bankbois if streamed). Unknown balances count as 0 instead of "—". |
| A9 | Debug-instance banner + "Open game client" link | debug-browser.tsx:16-25; party-console.tsx:24 | GET `/console-debug` `.insideDebug`; link `/debug-game/vnc.html` | MISSING | none: grepped `console-debug`, `debug-game` | Only shows on a debug instance. Low priority. |
| A10 | Session-expired screen with Reconnect on any 401/403/redirect | query-cache.tsx:50-87, 94-101; query-actions.ts:123-124 | any `/party-api/*` 401/403 | PARTIAL | screens/PairingGate.tsx:34-46 checks `/setup/state` only once at startup; partyApi.ts:178-182 turns a later 401 into a toast | If pairing is revoked mid-session, every action fails with "HTTP 401" toasts and no re-pair prompt. |
| A11 | Account-switch detection resets caches | query-cache.tsx:181-198 | core `accountId` | MISSING | none: grepped `accountId` | Data from two accounts can mix after the coordinator is re-pointed. |
| A12 | Global render-error page with auto-recovery, "Retry now" and "Reload now" | app/global-error.tsx:4-52; lib/dashboard-recovery.ts:30-102; app/page.tsx:8-15 | GET `/__dashboard/state` + page probe | MISSING | none: grepped `ErrorBoundary`, `componentDidCatch` (main.tsx has none) | A render error white-screens the installed PWA. The probe target differs for the PWA; the pattern is what to port. |
| A13 | "Couldn't complete action" modal for model-level action errors | party-reference-panels.tsx:128-148; use-party-console.tsx:427-431 etc. | — | PRESENT (equivalent) | lib/actionToast.ts; api/partyApi.ts:160-192 | Uses a toast instead of a modal. Acceptable on mobile. |
| A14 | Workspace load/empty states: "Party Console is loading…", "Reconnecting to Party Console…", "No characters connected yet… open setup" button | party-workspace.tsx:39-42 | core query state; `/setup` | PARTIAL | CharacterListScreen.tsx:49 ("No characters online yet." / "Connecting...") | No "open setup" link. Cannot tell loading from unavailable. |
| A15 | WebMCP `document.modelContext` tools `set_bank_threshold`, `send_character_to_bank` | use-party-console.tsx:232-284 | POST `/config {threshold}`, `/command {character,type:'bank'}` | N/A | — | Browser-agent API, not a user control. |
| A16 | DashboardModeControl (production/dev build) and DashboardHealth | dashboard-mode-control.tsx:9-127; dashboard-health.tsx:5-32 | `/__dashboard/state`, `/__dashboard/mode` | N/A | — | Dead code in v1.2.0: grepped every `.tsx`, neither component is rendered anywhere. `connectionNotice` (use-party-console.tsx:178) is also unused. |

### B. Live data layer

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| B1 | SSE `/dashboard-stream` snapshot/delta/heartbeat receiver | dashboard-live.tsx:53-149; live-protocol.ts:15-69 | GET `/party-api/dashboard-stream` | PRESENT | api/liveConnection.ts:44-127; api/liveProtocol.ts:37-93 (file lines) | Faithful port. See B2 for validation gaps. |
| B2 | Message validation: `Number.isSafeInteger(sequence)` and `typeof epoch === 'string'` | live-protocol.ts:24-29 | — | PARTIAL | liveProtocol.ts:53 checks only `message.sequence < 0` | A frame with a missing or NaN `sequence` would be accepted and poison ordering (`x <= undefined` is false, so later deltas are accepted out of order). Port the dashboard check verbatim. |
| B3 | Heartbeat watchdog (15 s) + 1 s reconnect | dashboard-live.tsx:88-97, 112-113, 137-139 | — | PRESENT | liveConnection.ts:13-15, 96, 111-119 | The PWA resets the watchdog on any accepted message and on `onopen`. The dashboard resets only on heartbeat/snapshot. Benign. |
| B4 | Character removal (`characters[name] = null`, or omitted from a snapshot) | live-protocol.ts:37-49; dashboard-live.tsx:67-71 (nulls vitals/position/inventory, card stays because the list is driven by `activeSlots`) | delta `{characters:{name:null}}` (runtime/coordinator/telemetry/dashboard-stream.ts:197-203) | PARTIAL | PartyDataProvider.tsx:299-307 deletes the character entry | The PWA list is built from SSE records (CharacterListScreen.tsx:23), so offline or briefly-reconnecting characters disappear instead of showing an offline card. |
| B5 | Fixed-length inventory array from `vitals.inventorySize` | dashboard-live.tsx:74-86 (`Number(size) \|\| keys.length`) | — | PRESENT | PartyDataProvider.tsx:68-73 | Edge case: `inventorySize: 0` gives `0` in the PWA and `keys.length` in the dashboard. |
| B6 | Polling fallback while SSE is unhealthy (`fast` 250 ms, `inventory` 2 s) | dashboard-live.tsx:47-52; query-cache.tsx:129-130, 224-272 | GET `/state?section=fast`, `?section=inventory` | MISSING | none: grepped `section=fast`, `section=inventory` | When SSE fails (proxies, mobile networks), vitals and inventory freeze with no fallback. |
| B7 | Domain cadences: core 1 s, config 15 s, logs 1 s, bank 2 s, mail 2 s, market 10 s, catalog on `referenceRevision` change | query-cache.tsx:122-136, 137-150; use-party-console.tsx:162-167 | `/state?section=…` | PARTIAL | PartyDataProvider.tsx:28, 134-146 (everything at 6 s), :36 (catalog every 10 min) | Logs and core are about 6x staler. The catalog ignores `referenceRevision`. |
| B8 | **Config domain** `/state?section=config` | query-cache.tsx:128; use-party-console.tsx:152-161 | config fields (public-state.ts:65-82) + `roster, classChoices, eventStrategy, giveawayRealms, autoUpgradeMarks` (:84-99) | **BROKEN (never fetched)** | PartyDataProvider.tsx:134-146 | See Summary #1 and BROKEN-1. |
| B9 | Roster kept fresh (comes in config) | query-cache.tsx:128 (15 s) | `roster` | BROKEN | PartyDataProvider.tsx:218-256 fetches full `GET /state` **once** (3 retries) | New or created characters and level changes never reach the PWA roster until reload. |
| B10 | `characterDetails` → per-character diagnostics + presence (`seenAt` < 10 s ⇒ online) | query-cache.tsx:206-222 | core `characterDetails` | PARTIAL | PartyDataProvider.tsx:165-174 keeps only `monsterHunt` | No presence/online indicator. Other diagnostics are dropped (other auditors' cards depend on them). |
| B11 | ALData auth polling while a verification mail is pending (15 s) | use-party-console.tsx:181-189; party-send-mail-dialog.tsx:30 | GET `/aldata/auth` | MISSING | none: grepped `authPending` | |
| B12 | Live metrics (`window.dashboardLiveMetrics`) | live-metrics.ts; dashboard-live.tsx:126 | — | N/A | — | Diagnostics only. |

### C. Workspace / roster / sessions

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| C1 | Character list = `activeSlots` order, excluding bankbois, sorted primary → Steam → headless → merchant last | use-party-console.tsx:782-795; character-order.ts → runtime/roster/character-order.ts:1-24 | core `activeSlots`, `bankbois`, `roster` | PARTIAL | CharacterListScreen.tsx:23 (`Object.keys(characters)`, SSE insertion order) | `activeSlots` is in core but the PWA model does not type or read it (grepped `activeSlots`: none). |
| C2 | "Load character slot N" buttons for empty headless slots, disabled during a Steam switch | roster-controls.tsx:6-34; party-workspace.tsx:34-38, 51 | `activeSlots[].kind/character`, `steamSwitch.phase` | MISSING | none: grepped `activeSlots`, `steamSwitch` | |
| C3 | Roster picker: Headless/Steam hosting toggle, hides already-active/online members, shows "Lv N class", "No available roster members", Create character | roster-picker.tsx:15-96; party-roster-picker.tsx:5-20 | `roster[].online`, `activeSlots` | MISSING | none | |
| C4 | Spawn headless | use-party-console.tsx:301-309 | POST `/slots/:slot/spawn {character}` (runtime/roster/routes.ts:195) | MISSING | none: grepped `slots/` | |
| C5 | Login to Steam client | use-party-console.tsx:303 | POST `/steam/action {character, action:'login', clientSetup?}` (query-actions.ts:117, steam-client-setup.ts:2-8) | MISSING | none: grepped `steam/action` | |
| C6 | Slot 0 "Switch Steam character" | roster-picker.tsx:45-50; use-party-console.tsx:319-326 | POST `/steam/action {character, action:'primary'}` | MISSING | none | |
| C7 | Per-character session controls: Steam (become primary / join background / join as primary), Headless, Log out. Confirmation dialog with per-action text, a stale-state guard ("session or Steam primary changed"), busy/error. | character-session-controls.tsx:14-234; connected-character-card.tsx:262-273 | POST `/steam/action {character, action:'primary'\|'login'\|'headless'}`; POST `/slots/:n/logout {}` or `/steam/action {action:'logout'}` for native (use-party-console.tsx:310-341) | MISSING | none | Highest-impact roster gap. |
| C8 | Debug-browser link replaces session controls on a debug instance | character-session-controls.tsx:86-91 | `/console-debug` | MISSING | none | Debug only. |
| C9 | Pending character cards: portrait, class, hosting kind (Headless / Steam primary / Steam companion), status labels (Loading in Steam, CODE active, CODE stopped, Waiting, Connection lost), delayed-help text, error | pending-character-cards.tsx:1-90 | core `characterConnections`, `activeSlots`, `characterAppearances` (config), `bankboiTransaction` | MISSING | none: grepped `characterConnections` | Users cannot see why a character isn't connecting. |
| C10 | Create character dialog: name (A-Z 0-9 _, max 12, 4-12 validation), class select from `classChoices`, 4 appearance previews from `appearanceChoices`, "Create and spawn", busy/error | create-character.tsx:22-136; party-create-character.tsx:5-39; use-party-console.tsx:349-367 | POST `/roster/create {name, class, look}` | MISSING | none: grepped `roster/create`, `classChoices`, `appearanceChoices` | Entry points: roster picker, Settings "Create character". |
| C11 | "Bankboi Active" card (bankboi name, mode · phase) | party-workspace.tsx:52-68 | core `bankboiTransaction` | MISSING | none: grepped `bankboiTransaction` | |
| C12 | Leader selection (radio on each card) | party-workspace.tsx:44-47 | POST `/formation {leader}` | BROKEN | LeaderFollowerSection.tsx:20-28 sends `{character, follow, leader}` | See BROKEN-2. The PWA "Leader" chip can also *clear* the leader (sends `null`), which the dashboard cannot do. That is an extra, not a gap. |
| C13 | "Send party to town" | party-workspace.tsx:69-75; use-party-console.tsx:440-446 | POST `/town-party {}` | PRESENT | CharacterListScreen.tsx:80; partyApi.ts:405-407 | |
| C14 | Escape (stage label, spinner, failed/success). In a dungeon it becomes "Escape — exit dungeon". | escape-control.tsx:10-64 | POST/GET `/escape`; dungeon `/daily-dungeons {action:'exit'}` | PARTIAL | CharacterListScreen.tsx:67-102 | No dungeon-exit variant (dungeons are out of slice). PWA polls escape at 6 s; the dashboard polls at 1 s. |
| C15 | Hunt setup / farm-area / monster navigation pickers hosted in the workspace | party-workspace.tsx:80-144; use-party-console.tsx:454-476, 737-781 | `/farming-mode`, `/navigate-to-monster`, `/command party-monster-travel\|character-travel` | (out of slice, farming auditor) | components/FarmingAreaPicker.tsx | Body shapes are in the matrix (section M). |
| C16 | Character travel dialog submit | use-party-console.tsx:723-736 | POST `/command {character,type:'character-travel',location,label}` | PRESENT | partyApi.ts:391-393 | |

### D. Settings dialog (Interface settings)

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| D1 | "Recover Steam handoff after characters are offline" (shown when `steamSwitch.phase === 'failed'`) | party-inventory-panels.tsx:319-324; use-party-console.tsx:342-348 | POST `/steam/recover {}` | MISSING | none: grepped `steam/recover` | |
| D2 | Dashboard state import/export block: canonical/local/Docker paths, help text | dashboard-state-import.tsx:78-87 | GET `/dashboard-state` (SourceInfo) | MISSING | none: grepped `dashboard-state` | SettingsScreen.tsx:11-14 explicitly defers it. |
| D3 | Export state file (save picker or download) | state-export-button.tsx:5-11; settings-export.ts:3-12 | GET `/dashboard-state/export` | MISSING | none | Download-link fallback works on mobile. Logic ports almost verbatim. |
| D4 | Import state file: pick `.json`/`.jsonl`, 128 MB guard, preview (characters, skipped characters with labelled fields, field list, backup notice), Import/Cancel, success with backup path | dashboard-state-import.tsx:41-111 | POST `/dashboard-state/preview` (text/plain body); POST `/dashboard-state/import` with header `X-State-Preview: <digest>` | MISSING | none | |
| D5 | Realm header: "Current: <label>" or "Mixed realms" (red), "Home: <label>" | party-inventory-panels.tsx:326-348 | `realmControl.currentRealm`, `.split`, `.homeRealm`, `.realms[].label` | PARTIAL | SettingsScreen.tsx:110-111 shows raw `activeRealm` and `homeRealm` keys | Shows `activeRealm` instead of `currentRealm`, no labels, no split state. PWA `RealmControl` type lacks `currentRealm/split/characters/operation/merchantRealm` (models/state.ts:474-478). |
| D6 | Split-realm per-character list ("name: realm\|offline") | party-inventory-panels.tsx:354-362 | `realmControl.characters` | MISSING | none | |
| D7 | Realm select: every realm with "(N players)", PVP shown but disabled with "— disabled" | party-inventory-panels.tsx:364-390 | `realmControl.realms[].players/pvp` | PARTIAL | SettingsScreen.tsx:122-142 (PVP filtered out; "(N online)") | |
| D8 | "Change realm" disabled when no destination, same as current (unless split), or an operation is running; spinner while running | party-inventory-panels.tsx:349-352, 391-407 | `realmControl.operation.phase` | MISSING | SettingsScreen.tsx:125-139 (always enabled) | |
| D9 | Realm operation progress panel (phase, error, per-character realm/"waiting", coloured by state) | party-inventory-panels.tsx:409-425 | `realmControl.operation` | MISSING | none | |
| D10 | "Switch realm?" confirmation: Realm Fatigue (~30 min) warning, Hop Sickness warning (−80 Luck/Gold/XP, −20% output) or "already home"; "Set as home realm" shown only when the destination isn't home, with Bean explanation; Cancel / "Switch all characters" busy; error | party-inventory-panels.tsx:533-601 | — | PARTIAL | SettingsScreen.tsx:116-142: a tap on the realm name switches immediately; the set-home checkbox is always shown | Missing confirmation and warnings (the brief counts confirmations). |
| D11 | Realm switch request | use-party-console.tsx:285-300 | POST `/realm/switch {realm, setHome}` | PRESENT | partyApi.ts:674-676 | Body matches. |
| D12 | Characters → "Create character" button | party-inventory-panels.tsx:427-446 | opens C10 | MISSING | none | |
| D13 | Account member grid: portrait (live sprite/doll or saved `characterAppearances`, "Appearance saved after first connection"), name, class, live level, includes bankbois, pads to 8 dotted empty slots | account-settings.tsx:10-21 | `roster`, `bankbois`, `characterAppearances` (config), live `characters` | PARTIAL | SettingsScreen.tsx:148-153, 331-339 (name + "Lv N ctype" from the one-time roster) | No portraits, no bankbois, no empty-slot count, stale levels. |
| D14 | Bankboi default name: input (maxLength 11), help "3–11 letters… e.g. MyBank0", Save → "Saved", inline error | account-settings.tsx:22-25 | POST `/dashboard-preferences {bankboiPrefix: trimmed}`; read `bankboiPrefix` (config) | BROKEN | SettingsScreen.tsx:43 (seeded from `dynamicState.bankboiPrefix`, never fetched), :67-73 | The input always starts empty, so it looks unset. The body is not trimmed (`partyApi.ts:680-682`). No maxLength, help, saved state or inline error. |
| D15 | ALData status line "Auth: X · Publish: Y", with "Check status" result overriding it; pending banner "Waiting for mail delivery…" | party-inventory-panels.tsx:449-458; use-party-console.tsx:145, 218-221 | GET `/aldata/auth`; `aldata.auth/publishStatus` | PARTIAL | SettingsScreen.tsx:176-197 | `checkAlDataAuth` result is discarded (only the error is used, :190-191). The display waits for the next state poll. No pending banner or polling (B11). |
| D16 | Key field (password), Reveal (fetch on first reveal), Copy | party-inventory-panels.tsx:469-501 | GET `/aldata/key` | PRESENT | SettingsScreen.tsx:200-226 | |
| D17 | Generate key | party-inventory-panels.tsx:503-509 | POST `/aldata/key` | PRESENT | SettingsScreen.tsx:229-244; partyApi.ts:698-700 | |
| D18 | "Prepare mail": closes Settings, opens the full Mail composer prefilled (earthiverse / aldata_auth / key) so the user reviews postage, then Send sets auth-pending polling | use-party-console.tsx:194-200; party-send-mail-dialog.tsx:28-31 | GET `/aldata/key` → POST `/merchant/send-mail`; GET `/mail/postage` | PARTIAL | SettingsScreen.tsx:245-284 inline Send | No postage shown (the dashboard text says "Review the postage"). No pending state afterwards. |
| D19 | ALData help text + `aldata.error` | party-inventory-panels.tsx:519-527 | `aldata.error` | PRESENT | SettingsScreen.tsx:286-290 | |
| D20 | Hosting: "Require secure pairing" checkbox (disabled while busy/unknown), description, "This browser is authorized…" note when on, inline error | hosting-settings.tsx:5-37 | GET `/setup/state`; POST `/setup/pairing {requirePairing}` → uses returned `requirePairing` | PARTIAL | SettingsScreen.tsx:27-40, 50-65 | Optimistically sets local state instead of using `result.requirePairing`. Never disabled. No warning text or authorized note. Errors appear only as a toast. |
| D21 | "Load setup" button (→ `/setup`: invites, Steam connections, HTTPS) | hosting-settings.tsx:34 | `/setup` page | MISSING | none: grepped `'/setup'` in screens | Could be a plain link to `${baseUrl}/setup`. |
| D22 | Console updates: installed version, "New release available: X" + Release notes link, phase status text, Check now, Download and install, Restart now, "Automatically download and install" toggle, help text, development-checkout notice, error | console-updates.tsx:45-64 | GET `/console-update`; POST `/console-update/check`, `/download`, `/restart`, `/preferences {automatic}` (tools/update/hosting.ts:43-52) | MISSING | none: grepped `console-update` | PWA "App updates" (SettingsScreen.tsx:299-329) covers the PWA bundle only. |
| D23 | Cave of Many Dreams debug instance: Start, Stop running, Open debug console, spinner, status, error; inside-debug notice | debug-instance.tsx:7-49 | GET `/console-debug`; POST `/console-debug/start`, `/stop` | MISSING | none | Needs Docker on host. Low priority, but it is a Settings control. |
| D24 | PWA-only extras (no dashboard counterpart in this dialog) | — | `/dashboard-preferences {anniversaryAutoChat}`, `/anniversary/chat-advertise`, server-address override | (extra) | SettingsScreen.tsx:75-104 | Anniversary toggle: see Out-of-slice O3 (BROKEN). |

### E. Logs

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| E1 | Logs view with Game logs / Dashboard logs tabs | log-sidebar.tsx:28 | GET `/state?catalog=0&dashboard=1&section=logs` (1 s, :10) | PARTIAL | screens/account/LogsScreen.tsx:9-60 (three stacked sections, 6 s) | |
| E2 | Game-log category filter toggles: Kills (off by default), Gold, Party, Items, Upgr., Errors, Info. Persisted in `localStorage['party-log-filters']`. | log-sidebar.tsx:12-14, 29; runtime/game-log-filters.ts:3-18 | `gameLogs[name][].message` classification | MISSING | none: grepped `logFilters`, `party-log-filters` | Pure module, can be ported verbatim. |
| E3 | Dashboard-log source select (All / Combat / Merchant-coordinator / Anniversary) | log-sidebar.tsx:29 | — | MISSING | none | |
| E4 | Anniversary activity in dashboard logs | log-sidebar.tsx:19 | core `anniversary.activity` | MISSING | none: grepped `anniversary.activity` | |
| E5 | Character filter (union of live characters, game-log names, bankbois) | log-sidebar.tsx:22, 30 | — | MISSING | none | |
| E6 | Status line: "Disconnected — showing retained logs" / "Character offline — showing retained logs" (seenAt > 15 s) / "Live updates · latest 1,000 matching entries" | log-sidebar.tsx:31 | logs query error; `characters[c].seenAt` | MISSING | none | |
| E7 | Each row: local time, `[name]` or `[source]`, message, game-log colour (`e.color` hex), errors in red | log-sidebar.tsx:23 | `GameLog.color`, `.category` | PARTIAL | LogsScreen.tsx:65-80 (no time, no colour, no error styling) | |
| E8 | Chronological, latest 1000 matching, auto-follow scroll | log-sidebar.tsx:20-21, 32 | — | PARTIAL | LogsScreen.tsx:13-18 (reverse-chronological), :33 (game log capped at 100; others uncapped) | |
| E9 | Per-character combat log on each card: collapsible, count, last 50, colours by type (skill/kill/loot/death/item), "No combat events yet" | connected-combat-log.tsx:8-37; combat-log.tsx:5-65; connected-character-card.tsx:352 | logs `combatLogs[name]` | PARTIAL | only mixed into the global LogsScreen.tsx:49-58 | Not on the character screen. No type colours. |
| E10 | Combat log "Clear history" | combat-log.tsx:28-41 | POST `/combat-log/:character/clear {}` | MISSING | none: grepped `combat-log` | |
| E11 | Merchant activity log on merchant card: newest first, time with full-date tooltip, `— details` suffix, error/success colouring, scroll anchoring | components/merchant-activity.tsx:7-106; merchant-card-controls.tsx:193 | logs `merchantActivity[]` (`at, level, message, details`) | PARTIAL | LogsScreen.tsx:39-48 (message only) | `details` and `level` are dropped. |
| E12 | Merchant activity "Clear history" with result text | merchant-card-controls.tsx:179-191 | POST `/merchant/activity/clear {}` | PRESENT | MerchantControlsSection.tsx:108; partyApi.ts:512-514 | |
| E13 | Resizable/keyboard-resizable sidebar | log-sidebar.tsx:26 | — | N/A | — | Desktop layout only. |

### F. Management dialogs hosted in my slice (party-management-panels.tsx, use-party-console.tsx)

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| F1 | Join giveaway: explanatory description, realm **Select** from `giveawayRealms`, merchant **searchable combobox** of online players for that realm with "N online players loaded", disabled until a realm is chosen, inline error | party-management-panels.tsx:92-211; use-party-console.tsx:535-548 | POST `/merchant/join-giveaway {realm, seller}`; `giveawayRealms` (config+core), `giveawayPlayers` (core) | PARTIAL | MerchantControlsSection.tsx:87-90, 206-224 (two free-text inputs) | Body is correct. Both pickers and the online-player list are missing (grepped `giveawayPlayers`, `giveawayRealms`: none). |
| F2 | Stand listing dialog (manual and auto): title/description by mode; "Buy from NPC: Xg / unavailable"; "Current number on market: N"; price input; 13 price buttons (NPC sale +10%, Ponty sells for, Default −10%, Default, Default +10%, Market low −5% (guarded vs NPC price), Market price, Highest WTB price, Recent +5%, Recent price, Recent −5%, Input −5%, Input +5%); help text; quantity input for stacks; "Mark all for stand" checkbox; Mark disabled when 16 listings and not editing; error | party-management-panels.tsx:212-435; use-party-console.tsx:578-603, 829-849; use-panel-model.ts:88-111 | POST `/merchant/stand {id, slot, item, bankPack, price, quantity, markAll, remove}`; POST `/merchant/auto-stand {item, price, action}`; `standPriceHistory` (market), `aldata.listings` | PARTIAL | screens/itempanel/ItemActionPanel.tsx:213-219, 465-489 (price field only); BankScreen.tsx:337 | Missing: helper buttons, NPC/market context, quantity (always 1, partyApi.ts:254), `markAll` (never sent; grepped `markAll` only in partyApi withdraw), 16-slot guard. |
| F3 | Automatic NPC-sale confirmation dialog: item name +level, "You will receive Xg per sale", rule scope text, Enable/Cancel, error | party-management-panels.tsx:436-496; use-party-console.tsx:650-663 | POST `/merchant/auto-npc-sale {item, character, action:'set'}` | PARTIAL | ItemActionPanel.tsx:236 (fires immediately, no confirmation) | Body matches. Missing the confirmation and value preview for a standing rule. |
| F4 | NPC-sale dialog: title (single or "Sell all matching bank items"), source line (Merchant / `<char>` inventory / Bank · pack · slot / N slots across bank panes), quantity input defaulting to the **whole stack**, "You will receive: total g (each)", modified-gear acknowledgement checkbox, "Queueing…" busy, Sell/Sell all, sequential multi-target bank sale with live remaining count | party-management-panels.tsx:497-613; use-party-console.tsx:604-649; connected-inventory.tsx (quantity `String(entry.item.q \|\| 1)`) | POST `/merchant/npc-sale {source, character?, pack?, slot, item, quantity, acknowledged}` | PARTIAL | ItemActionPanel.tsx:222-235 (immediate, `quantity` defaults to **1**, partyApi.ts:273); BankScreen.tsx:433-456 | A character-stack NPC sale from the PWA sells 1, not the stack. There is no proceeds preview. The bank "Sell all" exists (BankScreen.tsx:445-448). |
| F5 | Merchant routine priorities dialog | party-management-panels.tsx:614-624 | POST `/merchant/routine-priorities {priorities, enabled}`; reads `merchantRoutinePriorities`, `merchantAutomations` (config), `gatheringModes` | BROKEN (read side) | screens/account/RoutinesScreen.tsx:21-36, 114 | Seeds from config fields that are never fetched (gap #1), so the screen starts from empty/defaults. Saving can overwrite the real priorities and enabled flags. Detailed UI audit belongs to the merchant auditor. |
| F6 | Bank gold threshold / item-collection threshold save (validation: non-negative int; 1-42) | use-party-console.tsx:368-392 | POST `/config {threshold}` / `{itemCollectionThreshold}`; read `threshold`, `itemCollectionThreshold` (config) | BROKEN | MerchantControlsSection.tsx:168-169 (seeded from `dynamicState.threshold` = default **0**, models/state.ts:780), :189, :198 | The form shows 0 and 1 instead of the real values. Tapping Apply writes `threshold: 0`, which triggers bank runs constantly. Invalid input is coerced to 0 instead of rejected. |

---

## BROKEN details

**BROKEN-1: config section never fetched (B8, B9, A5, D14, F5, F6, plus most other auditors' slices).**
- Server, `runtime/coordinator/telemetry/public-state.ts:258-276`:
  ```ts
  core: () => request.query?.dashboard !== "1" ? corePayload(fullPayload(state, ports, true))
          : omitConfigFields({ ...fullPayload(state, ports, true, true), ... }),
  config: () => configPayload(state, ports),
  ```
  `omitConfigFields` (:101-105) deletes every key in `configFields` (:65-82) plus `roster, classChoices, eventStrategy, giveawayRealms, autoUpgradeMarks`.
- Dashboard, `features/party/use-party-console.tsx:151-156`: `useDomain("core")`, `useDomain("config")`, `useDomain("catalog")`, merged into `state`.
- PWA, `data/PartyDataProvider.tsx:134-146`:
  ```ts
  api.get('state?section=core&dashboard=1'), api.get('state?section=bank'), api.get('state?section=market'),
  api.get('state?catalog=0&dashboard=1&section=logs'), api.get('mail'), api.get('escape'),
  ```
  There is no `section=config`. The e2e mock (`e2e/fixtures/mockPartyServer.ts:660-664`) answers every `section` with the full state, so tests pass against a server shape that doesn't exist.
- Fix: add `api.get('state?section=config')` to the poll (15 s is enough; matching the dashboard's 1 s core / 15 s config split is better) and spread it into `dynamicState`. Also take `roster` from it (fixes B9). Then remove the `coreFetchDebug` banner.
- Note: the non-dashboard `section=core` (without `dashboard=1`) does keep config fields (`corePayload(fullPayload(...))`). Dropping `&dashboard=1` would also work, but it also drops `characterDetails`, `bankGold` and `accountId`. Fetching `section=config` is the correct mirror.

**BROKEN-2: Follow toggle sends `leader` (C12).**
- PWA, `screens/character-detail/sections/LeaderFollowerSection.tsx:32`: `await api.setFormation(dynamicState.leader ?? null, characterName, !isFollowing)`. `partyApi.ts:221-223` posts `{ character, follow, leader }`.
- Server, `runtime/coordinator/http/formation.ts:57-61`: `if (body.leader !== undefined) { … state.leader = body.leader === null ? null : … }`.
- Dashboard: `formation({ character: name, follow: !!checked })` (connected-character-card.tsx:128) and `formation({ leader: value })` (party-workspace.tsx:46).
- Effect today: `dynamicState.leader` is always undefined (BROKEN-1), so every Follow tap clears the party leader. The Leader chip's `isFollowing` (:15) is also always false, so tapping Leader sends `follow:false` and silently un-follows the character.
- Fix: split `setFormation` into `setLeader(leader)` → `{leader}` and `setFollow(character, follow)` → `{character, follow}`.

**BROKEN-3: Stand count (A5).** `StandScreen.tsx:19` uses `dynamicState.standListings.length` (config, never fetched, so always 0). The dashboard uses `occupiedStandSlots(listings, nativeStand, merchant, bids)` (stand-count.tsx:14).

**BROKEN-4: Bankboi prefix (D14).** Seeded from the never-fetched `bankboiPrefix` (SettingsScreen.tsx:43), so it always shows empty. The body is untrimmed; the dashboard sends `prefix.trim()` (account-settings.tsx:24).

**BROKEN-5: Thresholds (F6).** `MerchantControlsSection.tsx:168` `useState(String(threshold))` where threshold is the `emptyPartyStateDynamic` default 0 (models/state.ts:780). The dashboard validates `Number.isSafeInteger(n) && n >= 0` and `1..42` with an error message (use-party-console.tsx:371, 383-384). The PWA coerces bad input with `Number(x) || 0`.

**BROKEN-6: Routine priorities seed (F5).** RoutinesScreen.tsx:21 `useState(dynamicState.merchantRoutinePriorities)` is always `{}`.

**BROKEN-7: Roster never refreshes (B9).** PartyDataProvider.tsx:218-256 fetches `GET /state` once with 3 retries.

**BROKEN-8: Live-protocol sequence validation (B2) — low severity.** PWA `liveProtocol.ts:53` `if (message.sequence < 0) return false` vs dashboard `!Number.isSafeInteger(message.sequence) || typeof message.epoch !== 'string'` (live-protocol.ts:24-29). (Counted under PARTIAL in the summary; listed here for the exact diff.)

---

## Endpoint coverage matrix (cross-cutting, for all auditors)

Sources: every `router.get/post/use` under `runtime/` and `tools/` (extracted by script; 154 literal registrations), plus the `route()` helper in `runtime/roster/routes.ts:70-85` (steam/*, slots/*) and the mail loop at `runtime/coordinator/http/dashboard.ts:95-96`. All `/party-api` paths are registered via `installDashboardRoutes` (dashboard.ts:54-98) → `registration.ts` installers, `ports.maps`, `ports.liveTelemetry`, `ports.roster`, `ports.combatLogs`, plus `application.ts:2185-2191`, `dungeons/service.ts:519-520`, `inventory/production.ts:116`, `inventory/shared-rules.ts:96`, `merchant/upgrade-preview.ts:64-65`, `http/movement.ts:9`, `http/shared-convoy-route.ts:11-33`.

Status key:
- **called-OK**: the PWA calls it with a body equivalent to the dashboard's.
- **called-WRONG**: the PWA calls it but the body or semantics differ.
- **NOT CALLED**: the dashboard UI calls it and the PWA does not.
- **PWA-only**: the PWA calls it and the dashboard UI does not.
- **internal**: called only by character scripts, the Steam bridge, the updater, or nobody; not a UI endpoint.

### M1. `/party-api` routes called by the dashboard UI

| Method | Path | Registered | Dashboard caller (body) | PWA | Body / notes |
|---|---|---|---|---|---|
| GET | /state?section=core&dashboard=1 | dashboard.ts:63 | query-cache.tsx:174 | called-OK | PartyDataProvider.tsx:140 (6 s vs 1 s) |
| GET | /state?section=config | dashboard.ts:63 | query-cache.tsx:174 (15 s) | **NOT CALLED** | BROKEN-1 |
| GET | /state?section=catalog | dashboard.ts:63 | query-cache.tsx:174 (on revision) | called-OK | PartyDataProvider.tsx:109 (10 min) |
| GET | /state?section=fast | dashboard.ts:63 | dashboard-live.tsx:48 (fallback when SSE is down) | NOT CALLED | B6 |
| GET | /state?section=inventory | dashboard.ts:63 | dashboard-live.tsx:49 (fallback) | NOT CALLED | B6 |
| GET | /state?section=logs | dashboard.ts:63 | log-sidebar.tsx:10, connected-combat-log.tsx:12 | called-OK | PartyDataProvider.tsx:143 |
| GET | /state?section=bank | dashboard.ts:63 | use-panel-model.ts:60-67 (dashboard adds `&dashboard=1` → bankbois, public-state.ts:247) | called-WRONG (minor) | PartyDataProvider.tsx:141 sends `section=bank` without `dashboard=1`, so no full `bankbois` from bank. Core still has bankboi summaries. |
| GET | /state?section=market | dashboard.ts:63 | use-panel-model.ts | called-OK | PartyDataProvider.tsx:142 |
| GET | /state (no section) | dashboard.ts:63 | — | PWA-only | PartyDataProvider.tsx:222, full payload once, for roster only |
| GET | /dashboard-stream (SSE) | telemetry/dashboard-stream.ts:268 | dashboard-live.tsx:101 | called-OK | liveConnection.ts:67; serverConfig.ts:33 |
| GET | /map-stream/:character (SSE) | telemetry/map-stream.ts:114 | character-map-section.tsx:37, cave-map.tsx:44 | called (partial use) | data/useTargetMonsterType.ts:45: target-name resolution only, no map rendering |
| GET | /maps/:map?revision= | map-stream.ts:113 | query-cache.tsx:302-330 | NOT CALLED | map auditor |
| GET | /aldata/market | registration.ts:67 | query-cache.tsx:156-163 (only before first catalog) | NOT CALLED | Fine: market section covers it |
| GET | /aldata/key | registration.ts:66 | use-party-console.tsx:195, 209 | called-OK | partyApi.ts:703-705 |
| POST | /aldata/key | registration.ts:68 | use-party-console.tsx:209 (no body) | called-OK | partyApi.ts:698-700 (`{}`) |
| GET | /aldata/auth | registration.ts:69 | use-party-console.tsx:183, 209 | called-WRONG (minor) | partyApi.ts:719-728. Result not displayed (D15). No pending poll. |
| POST | /aldata/refresh | registration.ts:71 | use-party-console.tsx:207 (`aldataAction('refresh')`; in v1.2.0 no button calls it, grepped `aldataAction("refresh")`: none) | NOT CALLED | effectively unused |
| POST | /anniversary/chat-advertise | registration.ts:50 | party-reference-panels.tsx | called-OK | partyApi.ts:692-694 |
| POST | /dashboard-preferences | dashboard.ts:65 | account-settings.tsx:24 `{bankboiPrefix}`; party-reference-panels `{anniversaryAutoChat}` | called-WRONG (minor) | partyApi.ts:680-688. Prefix not trimmed. |
| GET | /dashboard-state | dashboard.ts:66 | dashboard-state-import.tsx:30 | NOT CALLED | D2 |
| GET | /dashboard-state/export | dashboard.ts:64 | settings-export.ts:7 | NOT CALLED | D3 |
| POST | /dashboard-state/preview | dashboard.ts:67 | dashboard-state-import.tsx:42 (text/plain) | NOT CALLED | D4 |
| POST | /dashboard-state/import | dashboard.ts:72 | dashboard-state-import.tsx:42 (+`X-State-Preview`) | NOT CALLED | D4 |
| POST | /roster/create | dashboard.ts:80 | use-party-console.tsx:355 `{name,class,look}` | NOT CALLED | C10 |
| POST | /bankbois/create | dashboard.ts:81 | party-inventory-panels.tsx | NOT CALLED | bank auditor |
| POST | /bankbois/:name/delete | dashboard.ts:84 | party-inventory-panels.tsx | NOT CALLED | bank auditor |
| POST | /steam/action | roster/routes.ts:118 | use-party-console.tsx:303,313,321,329,337 `{character, action: login\|logout\|primary\|headless, clientSetup?}` | NOT CALLED | C5-C7 |
| POST | /steam/recover | roster/routes.ts:145 | use-party-console.tsx:344 `{}` | NOT CALLED | D1 |
| POST | /slots/:slot/spawn | roster/routes.ts:195 | use-party-console.tsx:304 `{character}` | NOT CALLED | C4 |
| POST | /slots/:slot/logout | roster/routes.ts:158 | use-party-console.tsx:314 `{}` | NOT CALLED | C7 |
| POST | /realm/switch | dashboard.ts:86 | use-party-console.tsx:290 `{realm,setHome}` | called-OK | partyApi.ts:674-676 (no confirmation, D10) |
| POST | /escape | dashboard.ts:91 | escape-control.tsx:27 `{}` | called-OK | partyApi.ts:413-415 |
| GET | /escape | registration.ts:132 | escape-control.tsx:16 (1 s) | called-OK | PartyDataProvider.tsx:145 (6 s) |
| POST | /town-party | registration.ts:164 | use-party-console.tsx:442 `{}` | called-OK | partyApi.ts:405-407 |
| POST | /bank-party | registration.ts:131 | use-party-console.tsx:435 `{group}` | called-OK | partyApi.ts:499-501. Dashboard group picker belongs to the merchant auditor. |
| POST | /formation | registration.ts:102 | `{leader}` / `{character,follow}` / `{character,eventSelections}` | **called-WRONG** | partyApi.ts:221-223 always `{character,follow,leader}`. BROKEN-2. `eventSelections` is never sent (grepped: none). |
| POST | /focus | registration.ts:101 | use-party-console.tsx:484 `{character, monsterFocus, monsterPriorities?, monsterSearchRadius?}` | called-WRONG (missing field) | partyApi.ts:574-578. No `monsterPriorities` (grepped: none). |
| POST | /farming-mode | registration.ts:105 | use-party-console.tsx:470 `{mode,character}`; party-workspace.tsx:101 `{mode:'hunt',character,backup:{monsterFocus,location}}` | called-OK | partyApi.ts:563-569 |
| POST | /navigate-to-monster | registration.ts:99 | use-party-console.tsx:752, 756 `{monsterId,location,phoenixRouteOrder?}` | called-OK | partyApi.ts:586-592 |
| POST | /rare-hunting | registration.ts:100 | connected-character-card.tsx | NOT CALLED | farming auditor |
| POST | /hunt-blacklist | registration.ts:103 | connected-character-card.tsx | called (verify) | partyApi.ts:617-621 |
| POST | /hunt-settings | registration.ts:104 | connected-character-card.tsx | called (verify) | partyApi.ts:625-627 |
| POST | /restock | registration.ts:264 | use-party-console.tsx:496 `{character,hp,mp}` | called-OK | partyApi.ts:227-233 |
| POST | /config | registration.ts:266 | `{threshold}`, `{itemCollectionThreshold}` (use-party-console.tsx:373,386), `{buyUpgradeBatchSize}` (buy-upgrade-batch-setting.tsx) | called-WRONG (missing field, wrong seed) | partyApi.ts:541-546. No `buyUpgradeBatchSize` (grepped: none). F6 seed bug. |
| POST | /command | registration.ts:267 | many `type`s (use-party-console.tsx:393-432, 726, 766; others) | called (per-type audit by other slices) | partyApi.ts:197-216 |
| POST | /combat-log/:character/clear | telemetry/combat-log.ts:71 | combat-log.tsx:34 `{}` | NOT CALLED | E10 |
| GET | /mail | dashboard.ts:94 | mail-query.ts | called-OK | PartyDataProvider.tsx:144 |
| POST | /mail/collect | dashboard.ts:96 | send-mail-dialog.tsx:110 `{id}` | called-OK | partyApi.ts:740-742 |
| POST | /mail/delete | dashboard.ts:96 | send-mail-dialog.tsx:110 `{id}` | NOT CALLED | mail auditor |
| POST | /mail/refresh | dashboard.ts:96 | send-mail-dialog.tsx:110 | NOT CALLED | mail auditor |
| GET | /mail/postage | registration.ts:65 | send-mail-dialog.tsx | NOT CALLED | mail auditor; D18 |
| POST | /merchant/send-mail | registration.ts:227 | party-send-mail-dialog.tsx:29 `{recipient,subject,message,quantity,source?{pack,slot,item}}` | called-WRONG (missing fields) | partyApi.ts:734-736 `{recipient,subject,message}`, no attachment |
| POST | /merchant/activity/clear | registration.ts:174 | merchant-card-controls.tsx:184 | called-OK | partyApi.ts:512-514 |
| POST | /merchant/stale-orders/clear | registration.ts:175 | merchant-card-controls.tsx:171 | called-OK | partyApi.ts:506-508 (dashboard shows the removed counts; PWA doesn't) |
| POST | /merchant/stand | registration.ts:176 | use-party-console.tsx:589, 699 `{id,slot,item,bankPack,price,quantity,markAll,remove}`; merchant-stand-location-setting.tsx | called-WRONG (missing fields) | partyApi.ts:248-256. No `markAll`. Quantity defaults to 1. |
| POST | /merchant/auto-stand | registration.ts:184 | `{item,price,action:'set'\|'remove'}`, `{action:'clear-all'}` | called-OK | partyApi.ts:333-349 (extra `character` ignored) |
| POST | /merchant/npc-sale | registration.ts:177 | use-party-console.tsx:626, 633 | called-WRONG (default qty) | partyApi.ts:267-293. Character-item quantity is 1, not the stack (F4). |
| POST | /merchant/auto-npc-sale | registration.ts:183 | `{item,character,action:'set'}`, `{action:'remove',item}`, `{action:'clear-all'}` | called-OK | partyApi.ts:327-343 |
| POST | /merchant/routine-priorities | registration.ts:185 | use-party-console.tsx:687; delivery/withdrawal-trip-setting.tsx | called-OK (body), wrong seed | partyApi.ts:522-524. BROKEN-6. |
| POST | /merchant/blacklist | registration.ts:186 | stand-sheet.tsx | NOT CALLED | stand auditor |
| POST | /merchant/job/cancel | registration.ts:187 | use-party-console.tsx:693 `{id}` | called-OK | MerchantQueueSection.tsx:128 (`id ?? ''`) |
| POST | /merchant/job/retry | registration.ts:189 | merchant-card-controls.tsx:139 `{id}` | called-OK | partyApi.ts:469-471 |
| POST | /merchant/bid | registration.ts:190 | use-party-console.tsx:710 `{itemId,price,quantity,minimumQuality,clear,priorityOverride,...WTBOptions}` | called (WTB auditor to verify options) | partyApi.ts:635-654 |
| POST | /merchant/donate | registration.ts:193 | use-party-console.tsx:528 `{amount}` | called-OK | partyApi.ts:483-485 |
| POST | /merchant/join-giveaway | registration.ts:228 | use-party-console.tsx:541 `{realm,seller}` | called-OK | partyApi.ts:490-492 (UI PARTIAL, F1) |
| POST | /merchant/aldata-order | registration.ts:231 | use-party-console.tsx:566 `{listing,buyQuantity}` (full listing) | called-WRONG? | partyApi.ts:747-749 sends `{listing:{key}}`. The PWA comment says the server reads only `key`; market auditor to verify against http handler. |
| POST | /merchant/ponty-order | registration.ts:232 | use-party-console.tsx:569 `{keys,quantity,unitPrice}` | called-OK | partyApi.ts:754-756 (always one key) |
| POST | /merchant/aldata-sale | registration.ts:233 | use-party-console.tsx:576 `{order,sellQuantity}` | NOT CALLED | market auditor |
| POST | /merchant/order | registration.ts:234 | use-party-console.tsx:562 `{buys[{id,quantity,level?,budget?,maxAttempts?}],crafts,removeAutoBankMark}` | called-WRONG (missing fields) | partyApi.ts:373-379. No `budget`/`maxAttempts`. |
| POST | /merchant/exchange-order | registration.ts:237 | use-party-console.tsx:561 `{exchanges}` | called-OK | partyApi.ts:383-387 |
| POST | /merchant/clear | registration.ts:238 | use-party-console.tsx:510 `{}` | called-OK | partyApi.ts:476-478 |
| POST | /merchant/force-stand | registration.ts:239 | use-party-console.tsx:517 `{enabled}` | called-OK | partyApi.ts:457-459 |
| POST | /merchant/gather | registration.ts:171 | use-party-console.tsx:503 `{mode,enabled}` | called-OK | partyApi.ts:463-465 |
| POST | /merchant/bank-sort | registration.ts:167 | bank-sort-control.tsx | called (verify) | partyApi.ts:530-535 |
| POST | /merchant/native-stand | application.ts:2191 | party-inventory-panels.tsx | NOT CALLED | stand auditor |
| POST | /merchant/stand-location | application.ts:2189 | merchant-stand-location-setting.tsx | NOT CALLED | merchant auditor |
| POST | /merchant/rule-conflict | inventory/shared-rules.ts:96 | connected-inventory.tsx | NOT CALLED | inventory auditor |
| POST | /bank/unlock | registration.ts:259 | party-inventory-panels.tsx | called | partyApi.ts:300-302 |
| POST | /deconstruction/mark | registration.ts:179 | connected-inventory.tsx, party-inventory-panels.tsx | called | partyApi.ts:308-314 |
| POST | /deconstruction/auto | registration.ts:180 | same | called | partyApi.ts:319-323 |
| GET/POST | /daily-dungeons | dungeons/service.ts:519-520 | dungeon-query.ts | NOT CALLED | dungeon auditor |
| POST | /upgrade-preview | merchant/upgrade-preview.ts:64 | upgrade-preview-panel.tsx | NOT CALLED | upgrade auditor |

### M2. `/party-api` routes the PWA calls but the dashboard UI does not

| Method | Path | Registered | PWA caller | Note |
|---|---|---|---|---|
| POST | /merchant/stand-search | registration.ts:229 | partyApi.ts:762-764 | Dashboard `PlayerStandMarketDialog` is defined but never rendered in v1.2.0 (grepped). Extra feature. |
| POST | /merchant/stand-order | registration.ts:230 | partyApi.ts:770-780 | Same as above. |
| POST | /merchant/production `{character,action:'complete',id,success}` | inventory/production.ts:116 | partyApi.ts:450-452 | Normally a character-script endpoint (characters/shared.js). The PWA uses it as a manual recovery. |
| GET | /state (full) | dashboard.ts:63 | PartyDataProvider.tsx:222 | Large payload (includes statuses and catalogs). |

### M3. Internal `/party-api` routes (no UI caller in either app; listed for completeness)

`/anniversary/{claim,attempt,failure,handoff,return-ready,navigation-preempt,staging,advertise,chat-advertise-complete,trade,trade-complete,cake-supplies,cake-complete}` (registration.ts:39-61), `/aldata/send-auth` (:70, no caller found), `/bank-complete` (:265), `/bankboi/checkpoint`, `/bankboi/complete` (dashboard.ts:82-83), `/checkpoint` (:130), `/combat-log` POST ingest (combat-log.ts:70), `/game-logs` (combat-log.ts:69), `/console-maintenance` GET (application.ts:2185, used by tools/update/hosting.ts:22), `/convoy-{engage,complete,failed}` (:124-128), `/convoy-route` GET+POST, `/movement-barrier`, `/shared-travel` (shared-convoy-route.ts:11-33), `/movement-plan` (movement.ts:9), `/dashboard-telemetry` (dashboard-stream.ts:269, characters/shared.js), `/deconstruction/step` (:181), `/equip-delivery-complete` (:263), `/escape/resume` (:163, no caller found), `/event-{disabled,ended,return-complete,resume-complete}` (:112-120), `/farming-return` (:126), `/grouped-approach` (:125), `/hunt-event-permission` (:106), `/map-frame` (map-stream.ts:115), `/merchant/{activity (POST ingest),aldata-progress,bank-sort/checkpoint,checkpoint,cleanout,complete,config,delivery-receipt,ensure-home-realm,exchange-progress,exchange-supply,gather-status,handoff,handoff-complete,heartbeat,idle-status,leader-cluster,luck-cluster,marked-cluster,order-handoff,order-handoff-complete,ponty-progress,realm-switch,refresh-location,stack-merge-permission}`, GET `/merchant/job/:id` (characters/shared.js), `/monster-hunt/retry-return`, `/monster-hunt-interact-complete` (:107-108), `/realm/home-complete` (dashboard.ts:87), `/return-progress` (:115), `/stat-scroll-complete` (:262), `/status` (dashboard.ts:88), `/steam/{bridge,restore,realm-choice,switch}` (characters/steam-bridge.js), `/steam/headless` (legacy, no caller), GET `/steam/connection` (roster/routes.ts:61, no UI caller), `/town-complete` (:114), `/travel` (:129), `/upgrade-party` (:165, no caller found), `/upgrade-preview/result` (upgrade-preview.ts:65).

### M4. Non-`/party-api` host routes

| Method | Path | Served by | Dashboard caller | PWA | Notes |
|---|---|---|---|---|---|
| GET | /setup/state | tools/hosting/setup-routes.ts:66 | hosting-settings.tsx:10 | called-OK | PairingGate.tsx:37; SettingsScreen.tsx:29 |
| POST | /setup/pairing `{requirePairing}` | setup-routes.ts:101 | hosting-settings.tsx:20 | called-WRONG (minor) | SettingsScreen.tsx:60. Ignores the returned `requirePairing`. |
| POST | /setup/pair `{token}` | tools/hosting (authorize.ts:70) | (setup page itself) | PWA-only (needed) | PairingGate.tsx:73 |
| GET | /setup (page) | tools/hosting/gateway.ts | party-workspace.tsx:41; hosting-settings.tsx:34; dashboard-mode-control.tsx:65 | NOT LINKED | D21 |
| GET/POST | /setup/{session,invite,revoke,steam,client,transfer,https,check-https,continue,trust/*} | setup-routes.ts:92-117; gateway.ts:24-28 | setup page only | n/a | Not dashboard UI. A future mobile "invite another device" would use `/setup/invite`. |
| GET | /console-update | tools/update/hosting.ts:43 (proxied via tools/debug/gateway.ts:34) | console-updates.tsx:14 (3 s) | NOT CALLED | A1, A2, D22 |
| POST | /console-update/{check,download,restart,preferences} | tools/update/hosting.ts:46-52 | console-updates.tsx:26 | NOT CALLED | D22 |
| GET | /console-debug | tools/debug/service.ts:143 | debug-browser.tsx:10; debug-instance.tsx:14 | NOT CALLED | A9, D23 |
| POST | /console-debug/{start,stop} | tools/debug/service.ts:145-146 | debug-instance.tsx:26 | NOT CALLED | D23 |
| GET | /debug-game/vnc.html | tools/debug/viewer.ts:8 | debug-browser.tsx:5 (link) | NOT LINKED | debug only |
| GET | /__dashboard/state, POST /__dashboard/mode, GET /__dashboard/builds | tools/dashboard/supervisor.mts:270-280 | lib/dashboard-recovery.ts:83 (global-error recovery); dashboard-mode-control.tsx (dead code) | n/a | Not meaningful for a separately hosted PWA |
| GET | /api/monster-sprite?url= | dashboard/app/api/monster-sprite/route.ts | centered-monster-sprite.tsx etc. | NOT CALLED | Next.js route inside the dashboard app (not the coordinator). The PWA loads sprites itself (components/SpriteIcon.tsx). |

### M5. Live-protocol message types

| Stream | Message | Server emitter | Dashboard handling | PWA handling | Status |
|---|---|---|---|---|---|
| `/dashboard-stream` | `snapshot {epoch, sequence, characters:{name: LiveRecord}}` | dashboard-stream.ts:225 | live-protocol.ts:37-42 (null out missing, reset epoch) → dashboard-live.tsx:114-118 (healthy, cancel compat polls) | liveProtocol.ts:58-65; liveConnection.ts:97 (healthy) | PRESENT |
| `/dashboard-stream` | `delta {epoch, sequence, characters:{name: partial LiveRecord}}` (diff per vitals/items/slots, or a full record on generation change) | dashboard-stream.ts:155-177 | live-protocol.ts:32-36, 44-65 (merge by generation, drop stale samples) | liveProtocol.ts:56, 68-90 | PRESENT |
| `/dashboard-stream` | `delta {characters:{name:null}}` (character removed) | dashboard-stream.ts:197-203 | live-protocol.ts:45-48 → dashboard-live.tsx:67-71 | liveProtocol.ts:69-73 → PartyDataProvider.tsx:301-303 (deletes entry) | PARTIAL (B4) |
| `/dashboard-stream` | `heartbeat {epoch, sequence, at}` every 5 s | dashboard-stream.ts:219-222 | accepted if the epoch matches; resets watchdog | liveProtocol.ts:54 | PRESENT |
| `/dashboard-stream` | envelope validation | — | isSafeInteger(sequence), epoch string | `sequence < 0` only | PARTIAL (B2) |
| `/dashboard-stream` | LiveRecord vitals fields `hp,mp,max_hp,max_mp,x,y,map,in,xp,max_xp,gold,rip,target,standOpen,conditions,inventorySize` | dashboard-stream.ts:11-28 | all consumed by cards | PartyDataProvider.tsx:38 requires `hp,max_hp,mp,max_mp,gold,map,x,y,rip` before decoding | PRESENT (`xp/max_xp/in/standOpen` usage is for other auditors) |
| `/map-stream/:character` | raw frame JSON (no `type`), `: keepalive` comment every 15 s | map-stream.ts:63-64, 96-99 | character-map-section.tsx:37, cave-map.tsx:44 (render map/entities) | useTargetMonsterType.ts:45 (entity id → mtype only) | PARTIAL (map auditor) |

---

## Reuse opportunities

Pure logic that can be ported nearly verbatim:
- `runtime/game-log-filters.ts` (18 lines): `logFilters`, `classifyGameLog`, `showGameLog`. Drop-in for E2.
- `runtime/roster/character-order.ts` (24 lines): `orderCharacters`. Drop-in for C1.
- `dashboard/features/party/party-gold.tsx:9-39`: `partyGoldNames`, `goldTotals`. Pure; fixes A8.
- `dashboard/features/party/pending-character-cards.tsx:3-39`: `labels` + `pendingCharacters()` (takes `state` + `chars`). Pure; C9.
- `dashboard/features/party/live-protocol.ts:24-29`: copy the envelope validation into `api/liveProtocol.ts` (B2).
- `dashboard/features/party/settings-export.ts` + the request/preview/apply functions in `dashboard-state-import.tsx:41-77`. Framework-free fetch logic; D2-D4.
- `dashboard/features/party/console-updates.tsx:8-32`: `useUpdates()` hook. Copy and swap `fetch` for `PartyApiClient.getRoot/postRoot`; D22.
- `dashboard/features/party/stand-inspection.ts` `occupiedStandSlots`: needed for A5 (stand auditor may already list it).
- `dashboard/features/party/level-price-history.ts`, `npc-sale-value.tsx`, `ponty-price.tsx`, `abbreviated-gold.tsx`: needed for the F2/F4 price helpers and proceeds previews.
- `dashboard/features/party/display-character.ts`: `displayRunSpeed` (pure).
- `dashboard/features/party/query-actions.ts:16-95`: `actionDomains`/`affectedDomains`. The PWA could use this to refetch only the affected sections after an action instead of the full 6-request `refreshDynamicStateNow`.
- `dashboard/lib/party-routing.ts`: already ported as `src/lib/partyRouting.ts`. Keep it in sync.
- `dashboard/lib/dashboard-recovery.ts` `startRecovery()`: a ports-based state machine you can reuse as the core of a PWA error boundary with retry/backoff. Swap the probe for `GET /setup/state` or `/party-api/state?section=fast`.

Existing PWA helpers to extend rather than duplicate:
- `data/PartyDataProvider.tsx` `refreshDynamicStateNow`: add `state?section=config` (BROKEN-1) and take `roster` from it, replacing the one-shot roster fetch at :218-256.
- `api/partyApi.ts`:
  - split `setFormation` (BROKEN-2);
  - add `spawnSlot`, `logoutSlot`, `steamAction`, `steamRecover`, `createCharacter`, `clearCombatLog`, `dashboardStateMetadata/Export/Preview/Import`, and `consoleUpdate*` (via `getRoot/postRoot`);
  - add `markAll` and `quantity` to `markForStand`.
- `models/state.ts` `RealmControl` (:474-478): add `currentRealm, split, characters, operation, merchantRealm`. `PartyStateDynamic`: add `activeSlots, characterConnections, steamSwitch, bankboiTransaction, gameVersion, classChoices, appearanceChoices, characterAppearances, giveawayRealms, giveawayPlayers`.
- `screens/account/AccountScreenScaffold.tsx`: reuse it for new Roster / Console screens.
- `components/ModifiedItemWarning.tsx`: reuse it for the F4 acknowledgement inside a quantity/proceeds sheet.
- `AccountMenu.tsx`: also mount it from `CharacterListScreen` (fixes A7 reachability). Point the home gear at `/settings` and move the server-address override into Settings (where it already has a button, SettingsScreen.tsx:98-104).

---

## Out-of-slice observations

- **O1 (all slices): BROKEN-1 affects every screen that reads a config field.** Confirmed PWA reads of config-only fields (grep of `dynamicState.<field>` in `.tsx`): `leader, followers, farmingPolicy/farmingProfiles (via resolveFarmingContext, models/state.ts:715-735), monsterFocus, monsterFocusByCharacter, monsterSearchRadiusByCharacter, phoenixRouteOrder, huntSettings, huntBlacklist, standListings, standBids, standSearch, merchantRoutinePriorities, merchantAutomations, merchantForceStand, threshold, itemCollectionThreshold, marked, merchantMarked, autoItemMarks, autoUpgradeMarks, merchantDeliveries, npcSaleMarks, deconstructionMarks, deconstructionCatalog, autoDeconstruction, autoNpcSales, autoStandMarks, autoExchanges, upgrades, statScrolls, compounds, autoCompounds, goldTargets, restockPolicies, bankboiPrefix, anniversaryAutoChat`. Every auditor should treat these reads as BROKEN until config is fetched. Toggles like Force stand (`MerchantControlsSection.tsx:63`) will always send `!false = true`, so they can't be turned off.
- **O2 (merchant/inventory):** `InventorySection` badges (marks, upgrades, compounds, deliveries, NPC/deconstruction marks; CharacterDetailScreen.tsx:165-197) are all empty for the same reason.
- **O3 (anniversary):** the Settings "Anniversary auto-chat" checkbox (SettingsScreen.tsx:80-84) is bound to `anniversaryAutoChat` (config, so always false). Every tap sends `enabled: true`; it can never be turned off from the PWA.
- **O4 (farming):** the `/focus` body lacks `monsterPriorities` (dashboard use-party-console.tsx:487). `eventSelections` via `/formation` is not implemented (grepped: none). `/rare-hunting` is never called.
- **O5 (merchant):** `/config {buyUpgradeBatchSize}` (buy-upgrade-batch-setting.tsx) is missing. `/merchant/order` lacks `budget`/`maxAttempts`. "Clear stale orders" doesn't show the server's `deliveriesRemoved`/`bankMarksRemoved` counts (merchant-card-controls.tsx:171-172).
- **O6 (mail):** `/merchant/send-mail` lacks `quantity` and `source` (attachments). `/mail/delete`, `/mail/refresh` and `/mail/postage` are not called.
- **O7 (bank):** `section=bank` is fetched without `dashboard=1`, so full bankboi records (public-state.ts:247) are absent. `/bankbois/create` and `/bankbois/:name/delete` are not called.
- **O8 (navigation):** `/hunt-settings` is reachable only from FarmingSection.tsx:247. `/wtb` only from MarketScreen.tsx:27. `/routines` and `/merchant/:mode` only from MerchantControlsSection (shown only when the merchant is online and viewed). All account screens depend on reaching a character detail screen first (A7).
- **O9 (e2e):** `e2e/fixtures/mockPartyServer.ts:660-664` should return section-specific payloads (at least: strip config fields from `section=core&dashboard=1` and serve them from `section=config`), or it will keep hiding BROKEN-1-class regressions.
- **O10 (stand):** the dashboard's `PlayerStandMarketDialog` (player-stand-market-dialog.tsx) is dead code in v1.2.0. The PWA's stand-search/stand-order features have no dashboard counterpart, so they don't need parity, but they should be verified against `http/` handlers independently.
