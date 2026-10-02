# 01 — Adversarial challenge of `01-shell-live-settings.md`

Reviewer 01-challenge. D = `console-v1.2.0/` (repo root), P = `F:\CodingProjects\adventureland-party-mobile\web\src\`.
Scope per instructions: I focused on the **endpoint coverage matrix**. I enumerated every route registration independently (grep of every `.get/.post/.use("...")` under `runtime/` and `tools/`, plus a full read of `runtime/coordinator/http/registration.ts`, `http/dashboard.ts`, and `runtime/roster/routes.ts:61-226`, and the host gateways `tools/hosting/{authorize,gateway,setup-routes}.ts`, `tools/update/hosting.ts`, `tools/debug/{service,gateway}.ts`). I diffed that list against every PWA call site: `api/partyApi.ts` in full, plus every raw `api.get/post/getRoot/postRoot`, `fetch(` and `new EventSource(` in `web/src`. I also checked the three specific claims (Follow → `leader:null`, account-screen reachability, `activeRealm` vs `currentRealm`). I did not redo the section=config verification in depth; I only spot-checked it where matrix rows depend on it.

## Headline results

- **No 404s.** Every path the PWA calls exists on v1.2.0. Every `/command` `type` the PWA sends (25 distinct types) has a server-side literal match under `runtime/coordinator`.
- **Matrix omissions are internal-only.** No UI-relevant route is missing from the auditor's matrix. They left out a few internal routes (listed below).
- **3 matrix rows are wrong as "called-OK"/"verify":** `/hunt-settings`, `/hunt-blacklist` (both should be BROKEN) and `/state` reads (BROKEN on redirect).
- **1 row is wrong as "called-WRONG?":** `/merchant/aldata-order` is actually OK (REFUTED).
- **All three specific claims are CONFIRMED.**

Counts: refuted 1, downgraded 3, upgraded 3, confirmed critical 9, missed gaps 7.

---

## Refuted claims

| Claim | Verdict | Evidence |
|---|---|---|
| M1 `/merchant/aldata-order` "called-WRONG? PWA sends `{listing:{key}}`" | **REFUTED: called-OK** | The server reads only `requestObject(body.listing).key` and `body.buyQuantity` (D `runtime/coordinator/http/manual-market-orders.ts:61-71`), then re-resolves the listing from `state.aldata.marketListings` by key (:75-77). The PWA's `{listing:{key}, buyQuantity}` (P `api/partyApi.ts:748`) is sufficient. |

## Downgraded / Upgraded claims

### Downgraded

| Row | From → To | Reason |
|---|---|---|
| D15 ALData "Check status result discarded, display waits for next state poll" | PARTIAL → PARTIAL (minor; the stated failure is wrong) | The handler writes `state.aldata.auth` (D `http/aldata.ts:58-59`). The PWA calls `refreshNow()` right after the check (P `screens/account/SettingsScreen.tsx:190-192`), and `aldata` is in core (D `telemetry/public-state.ts:148`), so the status line updates within one round trip. The only real gaps are the "Waiting for mail delivery…" banner and the 15 s auth polling (B11). |
| C14 Escape "No dungeon-exit variant" | PARTIAL → cosmetic | POST `/escape` already exits the daily dungeon on the server when the dungeon owns the party (D `http/party-actions.ts:131-133, 140-144`). So the PWA's Escape tap does the right thing inside a dungeon. Only the label ("Escape — exit dungeon"), the `dungeon.busy` disabled state and the inline `actionError` are missing (D `features/party/escape-control.tsx:23, 49, 59-61`). |
| M4 `/setup/pairing` "called-WRONG (minor), ignores returned requirePairing" | → called-OK (UI gaps remain in D20) | The server returns `options.access.required` right after `setRequired(input.requirePairing)` (D `tools/hosting/setup-routes.ts:101-105`). That is the same value the PWA sets locally (P `SettingsScreen.tsx:60-61`). What remains is UI only: no disabled state, no text, and errors shown only as a toast. |

### Upgraded

| Row | From → To | Exact failure |
|---|---|---|
| **A10 Session expiry** | PARTIAL → **BROKEN (high)** | When pairing is required and the browser cookie becomes invalid, the gateway answers every **GET** that is not `/setup/` with a `302 Location: /setup` (D `tools/hosting/authorize.ts:74-76, 101-103`; `tools/hosting/http.ts:7-9`). `/setup` is served as 200 HTML before authorization (D `tools/hosting/gateway.ts:51-56`). The dashboard catches this with `response.redirected` (D `features/party/query-cache.tsx:94-101`). The PWA's `getText` follows the redirect and returns `ok(html)` (P `api/partyApi.ts:64-71`). Then `JSON.parse(coreResult.value)` throws unguarded (P `data/PartyDataProvider.tsx:161`; also :111 catalog, :176-181, :201, :205, :209). `refreshDynamicStateNow` rejects. The `while (!cancelled) { await refreshDynamicStateNow() … }` loop (P `PartyDataProvider.tsx:262-266`) has no try/catch, so **polling stops permanently** until a full reload. The catalog loop (:278-282) dies the same way. The result is silently frozen data with no re-pair prompt. Any proxy or captive portal that returns a 200 HTML page triggers the same failure. |
| M1 `/hunt-settings` | "called (verify)" → **BROKEN** | Both routes are wrapped in `createScopedFarmingRoute` (D `runtime/coordinator/application.ts:2139-2140`). If `body.character === undefined`, the wrapper runs the **main owner's (leader's)** handler (D `http/farming-scope.ts:17-18`). The dashboard always sends `{...patch, character: name}` (D `features/party/connected-character-card.tsx:158`). The PWA sends the bare patch (P `api/partyApi.ts:625-627`), so an independent (non-follower) character's own Hunt settings can never be edited. Separately, `huntSettings` is a config field (D `telemetry/public-state.ts:80`) that is never fetched, and `emptyPartyStateDynamic` has no `huntSettings` (P `models/state.ts:740-790`). The form therefore always seeds from the hard-coded defaults `true/true/3/false/1` (P `screens/account/HuntSettingsScreen.tsx:23-27`), and **Save overwrites the real settings with those defaults**. The dashboard also sends `preferredSpawns` (accepted at D `http/hunt-settings.ts:20-25`); the PWA has no equivalent. |
| M1 `/hunt-blacklist` | "called (verify)" → **BROKEN** | Same scoping bug: the dashboard sends `{action, monsterId?, character: name}` (D `connected-character-card.tsx:197-208`), while the PWA sends `{action, monsterId?}` (P `partyApi.ts:617-621`). The list is read from the never-fetched config `huntBlacklist` (P `HuntSettingsScreen.tsx:45`), so it is always empty and the remove/clear controls are never useful. The PWA client supports `'add'`, but no UI calls it (only remove/clear at `HuntSettingsScreen.tsx:49`). The dashboard has an Add path (`connected-character-card.tsx:206`). |

---

## Confirmed critical claims (one line each)

1. **BROKEN-2 Follow → `leader:null`: CONFIRMED.** The PWA Follow chip calls `setFormation(dynamicState.leader ?? null, …)` (P `LeaderFollowerSection.tsx:32`), which posts `{character, follow, leader}` (P `partyApi.ts:222`). `leader` is a config field (D `public-state.ts:76`) deleted from core by `omitConfigFields` (:101-104, :258), and the default state has no `leader` (P `models/state.ts:740-790`), so `null` is sent. The server's `if (body.leader !== undefined)` then sets `state.leader = null` (D `http/formation.ts:57-61`). Every Follow tap clears the party leader. Secondary effect: the Leader chip sends `follow: isFollowing` (always `false` because `followers` is also config), which silently un-follows the tapped character (P `LeaderFollowerSection.tsx:23`).
2. **A7/O8 Account screens unreachable without a streamed character: CONFIRMED.**
   - The only `/settings`, `/logs`, `/mail`, `/bank`, `/stand`, `/market`, `/catalog`, `/bestiary`, `/skills`, `/offerings` links are in `AccountMenu` (P `screens/character-detail/AccountMenu.tsx:12-21`). That menu is mounted only in `CharacterDetailScreen.tsx:216` (grep `AccountMenu`: 1 mount).
   - The home gear opens the server-address override (P `screens/CharacterListScreen.tsx:37`; `App.tsx:41, 65-80`).
   - The list comes from SSE records only (P `CharacterListScreen.tsx:23`). The server publishes SSE records only for `ports.active(name)` characters and nulls them otherwise (D `telemetry/dashboard-stream.ts:180, 196-203`).
   - So with no active character there is no in-app path to any account screen. The only workaround is typing a URL, which is impossible in an installed standalone PWA.
3. **D5 realm display uses `activeRealm` not `currentRealm`: CONFIRMED.**
   - The server sends both: `activeRealm` is the coordinator's configured target realm; `currentRealm` is the single observed combat realm, or `null` when split (D `runtime/coordinator/characters/roster-projection.ts:137-145`).
   - The dashboard displays `currentRealm`/"Mixed realms" (D `features/party/party-inventory-panels.tsx:330-348`) and only seeds the destination from `activeRealm || currentRealm` (D `party-header.tsx:106-108`).
   - The PWA shows the raw key `activeRealm` (P `SettingsScreen.tsx:110`), and its `RealmControl` type lacks `currentRealm/split/characters/merchantRealm/operation` (P `models/state.ts:474-478`).
   - After a failed or partial switch, the PWA reports the realm the party is *supposed* to be in, not where it actually is.
4. BROKEN-1 (config section never fetched): the poll list is confirmed (P `PartyDataProvider.tsx:134-146`). The one-time full `GET /state` is **not** merged into `dynamicState`; only `roster` is extracted (P :222-229). So "never reach the PWA" is accurate, not just "stale after startup".
5. B6 no SSE polling fallback: confirmed. There are no `section=fast`/`section=inventory` callers in `web/src`.
6. D14 bankboi prefix: confirmed. The input seeds from the default `''` (P `SettingsScreen.tsx:43`; `models/state.ts:767`). Worse than reported: the server accepts `""` (D `http/dashboard-import.ts:89`), so **tapping Save without typing erases the real prefix**.
7. O3 anniversary auto-chat: confirmed. `checked={dynamicState.anniversaryAutoChat}` defaults to `false` (P `SettingsScreen.tsx:81`; `models/state.ts:768`).
8. F6 thresholds: confirmed. The seed is `threshold: 0` (P `models/state.ts:780`). The dashboard's own fallback is `100000` (D `use-party-console.tsx:155`).
9. B2 sequence validation: confirmed as written. The server always sends integer `sequence` (D `dashboard-stream.ts:146-147`), so this is low severity.

---

## Matrix audit: routes omitted by the auditor

All of these are internal (no dashboard UI caller). None is a parity gap. They are listed so the matrix is complete.

| Method | Path | Registered | Caller |
|---|---|---|---|
| POST | `/party-api/merchant/order-handoff-complete` | D `http/registration.ts:244-247` | character scripts (auditor listed only `order-handoff`) |
| POST | `/party-api/steam/action` with `action:'headless-all'` | D `runtime/roster/routes.ts:119-122` | no UI caller in v1.2.0 (grep `headless-all` in `dashboard/`: none). A "move all Steam characters to headless" capability exists server-side, unused by both UIs. |
| GET | `/health` | D `tools/hosting/gateway.ts:47` | host health |
| GET/POST | `/bridge/<64-hex>/…` (Steam/game bridge proxy) | D `tools/hosting/gateway.ts:58` + `authorize.ts:6-36` | game client |
| GET | `/console-control/maintenance` | D `tools/hosting/gateway.ts:19-23`; `tools/update/hosting.ts:19` | updater (Bearer token) |
| POST | `/debug-login` (debug instance only) | D `tools/debug/gateway.ts:17-25` | debug login page |
| USE | `/CODE`, `/TYPECODE` | D `http/web-services.ts:46-67` | game client code serving |
| POST | `/party-api/merchant/config` | D `registration.ts:170` | listed by the auditor under M3 (verified, internal) |

**Matrix rows verified correct.** I verified these against the handler or dashboard, beyond the auditor's own checks:
- `/escape` GET returns `{escape}` (D `party-actions.ts:128-130`).
- `/mail/collect {id}` (D `http/mail-inbox.ts:17`).
- `/merchant/job/cancel {id}` (D `http/merchant-control.ts:74-76`). The PWA's `id ?? ''` just 404s cleanly.
- `/merchant/bank-sort {mode}|{enabled}` (D `merchant/bank-sort.ts:32-33, 85-86`).
- `/merchant/bid` with `useStandSlot, acceptHigherLevels, replaceStandEntry` (D `http/merchant-bid.ts:43-44, 131`).
- `/merchant/auto-npc-sale` clear-all with optional `character` (D `http/automatic-sales.ts:70-79`).
- `/restock {character, hp:{min,max}, mp:{min,max}}` (D `http/restock.ts:15-34`; dashboard `use-party-console.tsx:496`).
- `/focus`: omitting `monsterPriorities` *preserves* existing priorities (D `http/focus.ts:78-82`), so it is PARTIAL, not destructive.
- `/aldata/key` GET/POST return `{key}` (D `http/aldata.ts:33-45`).
- `/setup/pair`, `/setup/state` (D `authorize.ts:70-72`, `setup-routes.ts:66-69`).
- `/merchant/stand-search {itemId}` and `/merchant/stand-order {listings:[{seller,slot,rid,itemName,price,buyQuantity}]}` (D `http/merchant-requests.ts:70-80`, `manual-market-orders.ts:14-34`). Request shapes are correct. **But** results land in `state.standSearch` (D `merchant-requests.ts:79`), which is a config field (D `public-state.ts:74`), so the PWA never sees search results. That is a BROKEN-1 dependency, already in the auditor's O1.

---

## Missed gaps

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| X1 | Session-loss detection on redirected GETs; poll loops must survive bad responses | D `features/party/query-cache.tsx:94-101` (`response.redirected` → `authenticationLost`) | any `/party-api/*` GET → 302 `/setup` (D `tools/hosting/authorize.ts:101-103`) | **BROKEN** | P `api/partyApi.ts:64-71` (no `redirected` check); `data/PartyDataProvider.tsx:161, 262-266` (unguarded parse, loop with no catch) | See upgraded A10. Fix: in `getText`, treat `response.redirected` or a non-JSON content type as failure with status 401. Wrap the poll body in try/catch. |
| X2 | Per-character Hunt settings and blacklist (character-scoped) | D `connected-character-card.tsx:156-208` | POST `/hunt-settings {…, character}`, `/hunt-blacklist {action, monsterId?, character}`; scoped by D `http/farming-scope.ts:14-26` | **BROKEN** | P `partyApi.ts:617-627`; `screens/account/HuntSettingsScreen.tsx` (account-level screen, no character param) | Always edits the leader's settings. Also seeds from hard-coded defaults, so Save is destructive. Move the screen under `/characters/:name/hunt-settings` and pass `character`. |
| X3 | Hunt blacklist "Add" | D `connected-character-card.tsx:205-207` | `/hunt-blacklist {action:'add'}` | MISSING (client method exists, no UI) | P `partyApi.ts:617` supports `'add'`; no caller (grepped `updateHuntBlacklist(`: only `HuntSettingsScreen.tsx:49`) | |
| X4 | Hunt preferred spawns | D `http/hunt-settings.ts:20-25` (dashboard hunt-settings patch) | `/hunt-settings {preferredSpawns}` | MISSING | none: grepped `preferredSpawns` | Farming auditor to confirm the dashboard control location. |
| X5 | Hard-coded one-off "Clear stuck production attempt" button shown during every upgrade/compound job | — (PWA-only debug leftover) | POST `/merchant/production {character:'Patinder', action:'complete', id:'Patinder:1790863565429:zq4qk8ap6o', success:false}` | **Stale debug UI** | P `screens/character-detail/sections/MerchantQueueSection.tsx:8-9, 11-46, 86-96` | Renders whenever `current.reason` includes "upgrade"/"compound". Once the attempt is gone, tapping it returns 409 "Unknown production attempt" (D `inventory/production.ts:104-106`, `:132`). On any other account it always 400s (`character !== merchantCharacter`, :118). Remove it, together with the `coreFetchDebug` banner (P `CharacterDetailScreen.tsx:67-79`). |
| X6 | Escape in-dungeon label, disabled state and error | D `escape-control.tsx:11-12, 23, 49-61` | `/daily-dungeons` (state); POST `/escape` (server exits the dungeon) | PARTIAL (cosmetic) | P `CharacterListScreen.tsx:67-102` | Function is correct server-side; only the presentation differs (see Downgraded). |
| X7 | `serverNow` clock-skew reference in core | D `public-state.ts:260`; dashboard consumes it in `query-cache.tsx:164-180` (`serverNow` typed on the result) | core `serverNow` | MISSING | none: grepped `serverNow` | Affects any "seenAt < N s ⇒ online" logic the PWA adds (B10, E6). Low. |

### Additional BROKEN-1 fallout not in the auditor's O1 list

These are minor or unused fields, listed for completeness. These config fields are also stripped from core: `merchantCharacter, eventsByCharacter, eventSelectionsByCharacter, monsterPrioritiesByCharacter, passiveRareHunts, passiveHunting, merchantStandLocation, merchantWeapon, merchantBlacklist, autoStandBuys, autoBlacklistMerchants, buyUpgradeBatchSize, scatterMonsterTypes, merchantRules` (D `public-state.ts:65-82`). The PWA reads none of them today (grep: 0 hits outside `models/state.ts`), so there is no current breakage. Any future port of event selections, rare hunting, stand location or batch size must read them from `section=config`.

`/focus` radius is also hit: FarmingSection sends `Number(radius) || 400` (P `FarmingSection.tsx:384`), seeded from the never-fetched `monsterSearchRadiusByCharacter`. Every focus save therefore resets a custom search radius to 400. This belongs to the farming auditor; it depends on BROKEN-1.

---

## Severity / effort sanity check

- **BROKEN-1 (config fetch)** is correctly ranked #1. Effort is small (one extra GET plus a merge). But it must land **together with** X1's error-hardening: adding another unguarded `JSON.parse` call site widens the poll-death surface.
- **BROKEN-2 (Follow)** is correctly critical, and it is live-destructive today. It is independent of BROKEN-1: fix the body split even before config lands, because sending `leader` on a follow toggle is wrong regardless.
- **X1 (redirect/parse)** should be ranked in the top 3. It is silent, permanent and affects every screen, and the fix is about 10 lines.
- **X2 (hunt scoping)** is high. It is destructive on Save today. Effort is small to medium (route param plus `character` field).
- **A7 reachability** is high on mobile because there is no URL bar in standalone mode. Effort is trivial: mount `AccountMenu` from `CharacterListScreen` and point the gear at `/settings`.
- The roster/session block (C2-C10) is correctly the largest MISSING cluster. Effort is large. It needs `activeSlots`, `steamSwitch`, `characterConnections` typed in `models/state.ts`, plus `roster` freshness from config.

## Dependencies / ordering notes

1. **X1 first** (harden `getText` for `redirected`/non-JSON, and wrap the poll loops). This prevents BROKEN-1's new request from adding another crash path, and it gives the session-expired UX (A10).
2. **BROKEN-1** (`section=config` at about 15 s, merged into `dynamicState`, `roster` taken from it). This unblocks correct seeds for D14, F5, F6, O3, X2, the stand count A5 and the stand-search results.
3. **BROKEN-2** (split `setFormation` into `setLeader`/`setFollow`). This can ship in parallel with step 1. Its read side (chip selected state) needs step 2.
4. **X2** (per-character hunt settings) needs step 2 for its seeds and `farmingProfiles`-based ownership to show the correct owner (`farmingOwner` in the response, D `farming-scope.ts:41-42`).
5. **A7** (navigation) has no dependency. Do it early, because every Settings/Logs fix is otherwise unreachable with zero characters online.
6. **Roster/session controls (C2-C10)** need step 2 (`roster`, `classChoices`, `characterAppearances`) plus new core typings (`activeSlots`, `steamSwitch`, `characterConnections`, `bankboiTransaction`).
7. **Remove debug leftovers** (X5, `coreFetchDebug`) after step 2 is verified on the live server.
