# 02 — Adversarial challenge of 02-character-combat-farming.md

Reviewer 02. Same path conventions as the report: `D/` = `console-v1.2.0/dashboard/features/party/`, `R/` = `console-v1.2.0/runtime/coordinator/`, PWA paths are relative to `adventureland-party-mobile/web/src/`.

## 0. The headline finding the auditor missed (cross-cutting, it changes many rows)

**On v1.2.0 the PWA never receives any of the "config" state fields. That includes `leader`, `followers`, `farmingPolicy`, `farmingProfiles`, `huntSettings`, `huntBlacklist`, `monsterFocus`, `monsterFocusByCharacter`, `monsterSearchRadiusByCharacter`, `phoenixRouteOrder`, `anniversaryAutoChat` and `goldTargets`.**

- **Server.** v1.2.0 splits public state into `core` and `config`. With `dashboard=1`, the `core` section runs `omitConfigFields(...)`, which deletes every key in `configFields` (`R/telemetry/public-state.ts:65-82` field list, `:101-105` omit, `:255-276` core with `dashboard=1`). The field list includes the following:
  - `"leader", "followers", "eventsByCharacter", "eventSelectionsByCharacter", "monsterFocus", "monsterFocusByCharacter", "monsterPrioritiesByCharacter", "monsterSearchRadiusByCharacter", "farmingPolicy", "huntBlacklist", "huntSettings", "farmingProfiles", "passiveHunting", "passiveRareHunts", "phoenixRouteOrder", "anniversaryAutoChat", "goldTargets", "restockPolicies", "merchantCharacter"`
  - plus all the merchant, mark and upgrade config fields.
- **Dashboard.** It polls `section=config` as its own domain (`D/query-cache.tsx:174`, which builds the URL from `domain`; `D/query-actions.ts:10-18` invalidates `['core','config']` together).
- **PWA.** It only fetches `state?section=core&dashboard=1`, `bank`, `market`, `logs` and `catalog` (`data/PartyDataProvider.tsx:109,140-143`). The one unsectioned `api.get('state')` (`:222`) is parsed for `roster` only (`:225-229`). Grepping `section=config` across `web/src` finds nothing. The live SSE path only writes `QK.characters` (`PartyDataProvider.tsx:292-308`).
- **Why it went unnoticed.** The e2e mock serves `leader`, `huntSettings` and `farmingProfiles` inside its core payload (`e2e/fixtures/mockPartyServer.ts:200-204`), so tests pass. The shipped "TEMPORARY diagnostic" banner (`CharacterDetailScreen.tsx:67-79`) exists because "farmingPolicy/leader never updates". It is effectively printing the symptom of this bug.
- **Result.** `dynamicState.leader` is always `undefined` and `followers`, `farmingProfiles` and `huntBlacklist` are always `{}` (the defaults at `models/state.ts:740-784`; `leader` has no default). Every downstream claim has to be re-read with that in mind. Several of the auditor's PRESENT rows are in fact BROKEN on the live server, and the four focus claims below get worse.

The rest of this file is verified against code only. I could not hit the live server because the repos are read-only for this review. Confirm by reading the debug banner: it should show `leader=undefined`.

## Verdicts on the four claims I was asked to test

### (a) `/escape` and `/town-party` silently exit an active daily dungeon on v1.2.0: CONFIRMED on the server, DOWNGRADED as a parity gap

- **Server.** `town()` and `escape()` both start with `if (exitDungeon(res)) return;` (`R/http/party-actions.ts:101` and `:132`). `exitDungeon` calls `ports.dungeon.exit('manual-exit:…')` whenever `dungeonOwns(state)` is true (`:140-143`). `dungeonOwns` is true for **every** phase except `idle`: gathering, entering, active, exiting and held (`runtime/dungeons/contracts.ts:105,140-143`). So it also fires before entry (gathering) and after the run (held).
- **PWA.** `PartyControls` posts both with no dungeon awareness (`screens/CharacterListScreen.tsx:80-82` town, `:88-95` escape). The `{ok, dailyDungeon}` response is treated as a plain success.
- **Why DOWNGRADED.** The dashboard is no safer:
  - Its in-dungeon Escape calls `dungeon.action({action:'exit'})` with **no confirmation** (`D/escape-control.tsx:23`; `D/dungeon-query.ts:21-34` has no confirm step).
  - Its "Send party to town" is unlabelled and unconfirmed, and posts `/town-party` (`D/party-workspace.tsx:69-75`, `D/use-party-console.tsx:439-445`). It exits the dungeon exactly as the PWA does.
  - In the `held` phase the dashboard excludes `held` from `inDungeon` (`D/escape-control.tsx:12`), so it also posts plain `/escape`, which exits.
- **What the gap actually is.** Town behaves the same on both. Escape differs only in the label "Escape — exit dungeon" (`D/escape-control.tsx:59`) and in showing `dungeon.actionError` (`:61`). "One tap ends the daily run" is equally true on the dashboard.
- **Reclassification.** #48 goes from BROKEN to PARTIAL (missing in-dungeon label and error text). The real problem is that the PWA cannot see that a run exists at all (#32-47 MISSING). Severity: medium, not "live hazard".
- **Fix.** If you want to be safer than parity, add a PWA confirmation when `/daily-dungeons` reports a non-idle phase. That depends on porting `GET /daily-dungeons` first.

### (b) Hunt settings and blacklist always target the leader: CONFIRMED, and worse than reported

- **PWA.** `updateHuntBlacklist(action, monsterId?)` builds `{action, monsterId?}` and `saveHuntSettings(patch)` posts the patch unchanged. Neither adds `character` (`api/partyApi.ts:617-627`). The route `/hunt-settings` has no character param (`App.tsx:55`, `FarmingSection.tsx:247`).
- **Server.** `createScopedFarmingRoute`: when `character === undefined`, it calls `main(req, …mainOwner())` (`R/http/farming-scope.ts:17-18`), with `mainOwner: () => party.leader` (`R/application.ts:1878-1880`). Hunt settings and blacklist are wired through that route at `R/application.ts:2139-2140`. So every PWA write lands on the main/leader profile. If the server leader is `null`, it still lands on the main party state.
- **Worse than reported:**
  1. **The screen never shows real data.** `HuntSettingsScreen` reads `dynamicState.huntSettings` and `huntBlacklist` (`:22,45`), which are config fields that never arrive (§0). `settings` is always undefined, so the seeding `useEffect` (`:34-43`) never runs. The form shows hardcoded defaults (relocate on, deaths on at 3, expirations off at 1; `:23-27`) and the blacklist always reads "No monsters blacklisted."
  2. **Save is destructive.** Pressing Save sends all five fields (`:88-94`) and **overwrites the leader's real hunt settings with those defaults**.
  3. **"Clear all" and per-row Clear cannot be reached.** The list is always empty, and the Clear-all button is disabled when `blacklist.length === 0` (`:125`). The auditor's "confirmation exists but targets leader" (#61) is unreachable in practice.
  4. **The auditor's claim that the character's own blacklist is "shown correctly in FarmingSection" is false on v1.2.0.** `resolveFarmingContext` (`models/state.ts:723-737`) depends on `leader` and `farmingProfiles`, so `blacklist` is always `{}`.
- **Classification.** #57, #58, #60 and #61 stay BROKEN. Severity goes up because there is a silent overwrite of real settings.

### (c) The focus editor sends `['all']` when empty: CONFIRMED, and I found two more failure modes

- **PWA** (`FarmingSection.tsx:384`): `api.setFocus(characterName, selected.length ? selected : ['all'], Number(radius) || 400)`. `selected` is seeded from the `monsterFocus` prop (`:339`). The list is `bestiaryCatalog` (`:347`) with no `tinyp` filter.
- **Server** (`R/http/focus.ts`): it rejects `tinyp` (`:21`) and radius values outside 1-10000 (`:34-39`). It also **normalises any array containing `"all"` to `["all"]`** (`:71`).
- **New failure 1: the form cannot leave "All monsters".** If the current focus is `['all']`, `selected` starts as `['all']`. The bestiary list has no "all" row to untick, so ticking any monster sends `['all','bat',…]`, which the server collapses back to `['all']`. The dashboard has a toggleable "All monsters" option (`D/monster-focus-picker.tsx:98-105`).
- **New failure 2: on v1.2.0 the prop is always empty, so every save is destructive.**
  - `monsterFocus` and `monsterFocusByCharacter` never arrive (§0), so `CharacterDetailScreen.tsx:132` always passes `[]`. The summary always reads "No monsters selected".
  - The form opens empty, so saving after ticking one monster **replaces** the character's real focus. Saving untouched sets it to **All**.
  - `monsterSearchRadiusByCharacter` never arrives, so the radius field always shows 400 (`CharacterDetailScreen.tsx:133`) and saving resets any custom radius to 400. A follower's leader radius is lost the same way.
- **Row 71.** The `?.length ?` fallback bug at `CharacterDetailScreen.tsx:132` is real (the dashboard uses `||` and keeps `[]`, see `D/connected-character-card.tsx:105`). It cannot show on v1.2.0 until §0 is fixed.
- **Classification.** #67, #68, #70 and #72 are CONFIRMED BROKEN or MISSING. #72 is now BROKEN, not PARTIAL.

### (d) The Follow toggle can clear the leader: CONFIRMED and UPGRADED, it is deterministic on v1.2.0

- **PWA** (`LeaderFollowerSection.tsx:32`): `api.setFormation(dynamicState.leader ?? null, characterName, !isFollowing)`, which becomes `{character, follow, leader}` (`api/partyApi.ts:221-223`).
- **Server** (`R/http/formation.ts:57-61`; the auditor cited `:144-148`, which does not exist because the file is 74 lines): `if (body.leader !== undefined) … state.leader = body.leader === null ? null : …`.
- **Why it is deterministic.** `dynamicState.leader` is always `undefined` (§0), so `leader: null` is sent **on every Follow tap**. Every Follow tap clears the party leader. It is not a stale or early-load edge case.
- **Follow can never be turned off.** `followers` is always `{}`, so `isFollowing` is always false and every tap sends `follow: true`.
- **The section renders as soon as live vitals exist** (`CharacterDetailScreen.tsx:96-108`). Live vitals come from SSE, not from core, so there is no gate on state having loaded.
- **The Leader chip (#18) is also broken.** `isLeader` is never true, so the chip never shows selected. Each tap sends `{leader: name, follow: false}` (`:23`), which also unsets `followers[name]`; the dashboard's radio sends `{leader}` only (`D/party-workspace.tsx:44-47`). The auditor's "tap current leader to clear" path cannot be reached.
- **Fix.** Make `leader` optional, and omit it on follow toggles (dashboard body: `D/connected-character-card.tsx:127-130`). This is safe even without §0.

## Refuted claims

| Auditor claim | Verdict | Evidence |
|---|---|---|
| B1 cites `R/http/formation.ts:144-148` | REFUTED (citation only) | The file has 74 lines. The leader write is at `:57-61`. |
| #18 "PWA also lets you tap the current leader to send `leader:null`" | REFUTED in practice | `isLeader = dynamicState.leader === characterName` (`LeaderFollowerSection.tsx:14`) is never true on v1.2.0 (§0). |
| B2 "The character's own blacklist (shown correctly in FarmingSection via resolveFarmingContext)" | REFUTED | `resolveFarmingContext` (`models/state.ts:723-737`) returns `{}` because `farmingProfiles` and `huntBlacklist` never arrive. |
| B5 "One tap ends the daily run" framed as a PWA-only live hazard | REFUTED as a parity gap | The dashboard's Escape (`D/escape-control.tsx:23`) and Town (`D/party-workspace.tsx:69-75`) also exit with one unconfirmed tap. |
| MISSING rows 1-4, 6, 15, 21-28, 31-47, 54, 59, 62-65, 68, 69, 76 | **Not refuted.** I re-grepped all of them: `tracktrix`, `characterDollHtml`, `characterSprite`, `seenAt`, `.ping`, `eventSelections`, `eventSchedules`, `dungeon`, `rare-hunting`, `passiveHunting`, `preferredSpawns`, `monsterPriorities`, `chatAdvertisement`, `zone_`, `go-home`, `huntBlacklistLabel`, `updateHuntBlacklist('add'`. Each returned 0 hits in `web/src`. `map-stream` hits only `config/serverConfig.ts` and `data/useTargetMonsterType.ts`; `combatStats` hits only the `GearComparisonSheet.tsx` comment. | — |

## Downgraded / upgraded claims

| # | Auditor | Now | Reason (file:line) |
|---|---|---|---|
| 18 Leader radio | PRESENT | **BROKEN** | The chip is never selected. A tap sends `follow:false` alongside `leader` (`LeaderFollowerSection.tsx:14,23`). The dashboard sends `{leader}` only (`D/party-workspace.tsx:44-47`). |
| 19 Follow | BROKEN (edge case) | **BROKEN, deterministic, critical** | See (d). |
| 29 Anniversary auto-chat toggle | PRESENT | **BROKEN** | A controlled checkbox on `dynamicState.anniversaryAutoChat` (`SettingsScreen.tsx:82`), which is a config field that never arrives. It always shows unchecked and every click sends `true`, so it can never be turned off from the PWA. |
| 48 Escape in dungeon | BROKEN | **PARTIAL** (medium) | See (a). |
| 49 Farming mode selector | PRESENT | **BROKEN (display)** | The selected chip is `savedMode` (`FarmingSection.tsx:157`, `models/state.ts:733`), and `farmingPolicy`/`farmingProfiles` never arrive, so "Auto" is always highlighted. Writes are correct (`partyApi.ts:563-569`). |
| 50 Badge / effective mode | PARTIAL | PARTIAL (more gaps) | The dashboard badge's effective part is the **live** `char.farmingMode` (`D/connected-character-card.tsx:394-396`, `D/farming-mode-control.tsx:127-128`). The PWA's "Currently:" uses the resolved *policy*. The live mode only appears in the list's activity line (`lib/activityLine.ts:24`). |
| 52 Active farming zone | PRESENT | **BROKEN** | `farmArea` comes from `farmingProfiles[owner]` or `legacy ? state.farmAreaState` (`models/state.ts:730`). `legacy = owner === state.leader` is always false, so it is always null, even though `farmAreaState` does arrive in core (`R/telemetry/public-state-types.ts:60`). |
| 53 / 55 Hunt status, quest owner | PARTIAL | **BROKEN** | `hunt` is `effective?.monsterHunt ?? (legacy ? state.monsterHunt : null)` (`models/state.ts:735`), so it is always null. "Party Hunt …" (`FarmingSection.tsx:299-308`) never renders. |
| 56 My quest | PRESENT | PARTIAL | `characterHunt` arrives (`PartyDataProvider.tsx:173-175`), but the "Blacklisted — skipped" flag (`FarmingSection.tsx:283,314`) never fires because the blacklist is `{}`. |
| 58, 60, 61 Hunt settings and blacklist | BROKEN | BROKEN, **higher severity** | Silent overwrite with defaults; the list is always empty. See (b). |
| 67, 72 Focus and radius | BROKEN / PARTIAL | BROKEN, **higher severity** | Destructive save and stuck on All. See (c). |
| 73 "Find selected monster" | PRESENT | PARTIAL | `followingLeader` is always undefined, so the button is never disabled for followers (`FarmingSection.tsx:235-241`). |
| 74 Farming-area route | PARTIAL | **BROKEN** | `isLeader={dynamicState.leader === name}` (`CharacterDetailScreen.tsx:121`) is always false, so the leader sends `character-travel` instead of `party-monster-travel` (`partyApi.ts:607`). The server's `character-travel` moves only that character (`R/navigation/manual-commands.ts:71-84`) and does not convoy the party (`partyTravel` at `:85-95`). `savedPhoenixOrder` is always `[]` because `phoenixRouteOrder` is config. |
| 78 Return to leader | PARTIAL | BROKEN (minor) | It is hidden only when `isLeader` (`TravelSection.tsx:36`), which is never true, so it shows on the leader too. The server 409s "an online different party leader is required" (`manual-commands.ts:131-134`), and the result is discarded (`TravelSection.tsx:37`). |
| 80 Send party to town | PRESENT | PARTIAL | The result is discarded (`CharacterListScreen.tsx:80`, `void api.sendPartyToTown()`). The dashboard surfaces failures (`D/use-party-console.tsx:439-445`). |
| 82 Gold target | PARTIAL | PARTIAL (display broken) | `goldTargets` is config, so `serverTarget` is always 0 (`CharacterDetailScreen.tsx:199`). The input never shows the real target. The dashboard offers it to the merchant only (`D/connected-character-card.tsx:401-409`). |
| 16 Merchant statuses | UNREACHABLE | Confirmed | `CharacterDetailScreen.tsx:115`. |

## Confirmed critical claims (one line each)

- Daily dungeons are entirely absent: no `/daily-dungeons` GET or POST anywhere in `web/src` (grep `dungeon` returns 0).
- Hunt settings and blacklist writes have no `character`, so they go to `mainOwner()=party.leader` (`partyApi.ts:617-627`, `R/http/farming-scope.ts:18`, `R/application.ts:1880`).
- Empty focus is sent as `['all']` (`FarmingSection.tsx:384`). `tinyp` is offered and the server rejects it (`R/http/focus.ts:21`).
- The Follow toggle sends `leader` (`LeaderFollowerSection.tsx:32`) and clears it (`R/http/formation.ts:57-61`).
- `characterDetails` is reduced to `monsterHunt` only (`PartyDataProvider.tsx:173-175`), so stats, portrait, presence and ping are lost.
- "Go home" sends `character-travel` instead of `go-home` (`TravelSection.tsx:32` vs `R/navigation/manual-commands.ts:112-130`).
- `setFocus` has no `monsterPriorities` (`partyApi.ts:574-578`).

## Missed gaps

| # | Feature | Dashboard evidence (file:line) | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| M1 | **Config-domain state (leader, followers, farming profiles, hunt settings and blacklist, focus, radius, priorities, events, passive hunting, Phoenix order, gold and restock targets, auto-chat, all marks)** | `D/query-cache.tsx:174`, `D/query-actions.ts:10-18` | `GET /state?catalog=0&dashboard=1&section=config` | **MISSING (critical, root cause)** | none: grepped `section=config`. Only core, bank, market, logs and catalog are fetched (`PartyDataProvider.tsx:109,140-143`). The server strips these from core (`R/telemetry/public-state.ts:101-105,255-257`) | Fixing this alone repairs #18, #29, #49, #52, #53, #55, #56, #73, #74, #78 and #82 display, and the restock and marks screens out of slice. Add it to the parallel poll and invalidate it after every mutation, as the dashboard does. |
| M2 | Monster focus can be changed away from "All" | `D/monster-focus-picker.tsx:98-105` ("all" is toggleable) | `POST /focus` (`R/http/focus.ts:71` collapses anything containing `all`) | BROKEN | `FarmingSection.tsx:339,347-355` (seeded `['all']` and no "all" row to untick) | Independent of M1. |
| M3 | Focus and radius form seeded with the real current values | `D/connected-character-card.tsx:105,148-151` | `monsterFocusByCharacter`, `monsterSearchRadiusByCharacter` | BROKEN | `CharacterDetailScreen.tsx:132-133`. Both are always empty or 400 on v1.2.0 | Every save replaces the real focus and radius. Depends on M1. |
| M4 | Hunt settings form seeded with real values | `D/farming-mode-control.tsx:154` (`value={huntSettings}` from `farming.settings`) | `farmingProfiles[owner].huntSettings` / `huntSettings` | BROKEN | `HuntSettingsScreen.tsx:22-43,88-94` | Saving with defaults overwrites the real settings. Depends on M1 and B2. |
| M5 | Leader convoy route for farming areas | `D/use-party-console.tsx:747-777` (`state.leader === character ? 'party-monster-travel'`) | cmd `party-monster-travel` | BROKEN | `CharacterDetailScreen.tsx:121`, `partyApi.ts:607` | Depends on M1. |
| M6 | Per-character combat log on the card (collapsible, colour-coded by type, last 50, count) plus "Clear history" | `D/connected-character-card.tsx:352`, `D/connected-combat-log.tsx:20-37`, `D/combat-log.tsx:22-60` | logs `combatLogs[name]`; `POST /combat-log/{name}/clear` | PARTIAL | `screens/account/LogsScreen.tsx` shows logs account-wide. Grepped `combat-log`: none, so there is no Clear | The auditor filed this as out-of-slice, but it is combat on the character card. |
| M7 | Town request error display | `D/use-party-console.tsx:439-445` | `POST /town-party` | PARTIAL | `CharacterListScreen.tsx:80` (`void`) | |
| M8 | Monster-focus header shows the effective radius (`leader || char`) | `D/connected-character-card.tsx:428-434` | `monsterSearchRadiusByCharacter[leader \|\| name]` | MISSING | `FarmingSection.tsx:225-233` (summary has no radius) | Minor. Row 72 mentions it but does not list it as its own row. |
| M9 | Leader set without touching follow | `D/party-workspace.tsx:44-47` | `POST /formation {leader}` | BROKEN | `LeaderFollowerSection.tsx:23` also sends `follow:isFollowing` (always false) | Folded into #18 above. |
| M10 | Anniversary auto-chat shows real state and can be turned off | `D/anniversary-dialog.tsx:75-79` | `anniversaryAutoChat` (config) | BROKEN | `SettingsScreen.tsx:80-84` | Depends on M1. |
| M11 | Gold target control limited to the merchant card, with the other cards showing abbreviated gold | `D/connected-character-card.tsx:392-409` | — | Divergent (extra) | `CharacterDetailScreen.tsx:199` shows it for everyone | Not a gap, but the PWA lets you set targets the dashboard never exposes. |
| M12 | Production debug banner exposes `leader` and `farmingPolicy` | — | `QK.coreFetchDebug` | — | `CharacterDetailScreen.tsx:67-79`, `PartyDataProvider.tsx:166-172` | The banner shows the symptom of M1. Remove it once M1 is fixed. |
| M13 | Mock server hides M1 | — | — | Test gap | `e2e/fixtures/mockPartyServer.ts:200-204` puts config fields in core | Add a `section=config` handler and strip config fields from core so the e2e tests match v1.2.0. |

## Dependencies / ordering notes

1. **Fix M1 first** (fetch `section=config` in `refreshDynamicStateNow`, merge it like `core`). Until then:
   - Every "PRESENT" farming, formation and focus display in this slice is showing defaults.
   - Several writes are destructive, because forms are seeded from missing data: focus/radius (M3), hunt settings (M4) and the Follow toggle (d).
   - Before the read-side features are trusted, an interim hotfix should either disable those Save buttons, or at least make the following write changes:
     - omit `leader` on Follow;
     - stop sending `['all']` for an empty focus;
     - stop full-patch hunt-settings saves when `settings` is undefined.
2. **The B1 fix (omit `leader` on follow) is independent and trivial.** Ship it immediately: it is the most damaging live bug, because every tap clears the leader.
3. **B2 (add `character` to hunt settings and blacklist, route `/hunt-settings/:name`) needs M1** so the screen can read `farmingProfiles[owner].huntSettings`. It also needs `resolveFarmingContext` to expose `settings` (`models/state.ts:723-737`, mirroring `D/farming-context.ts`).
4. **Keep the full `characterDetails` record in `PartyDataProvider.tsx:173-175` before any stats, portrait, presence, ping or anniversary-ticket work** (rows 1-4, 6, 27). This is independent of M1.
5. **Daily dungeons (#32-47) need a new `GET/POST /daily-dungeons` client with an `operationId` per POST** (`D/dungeon-query.ts:26`). Escape/Town dungeon awareness (#48) depends on that query. It does not need M1.
6. **Event selection (#21-23) needs M1** for `eventSelectionsByCharacter`, `eventsByCharacter`, `leader` and `followers`. `eventSchedules` is not in `configFields`, so it should already arrive in core and still needs typing. The 409 "using leader events" inheritance check also needs `followers`.
7. **Focus priorities (#69) need M1** (`monsterPrioritiesByCharacter`) plus a `monsterPriorities` parameter on `setFocus`. Port the dashboard's semantics: always send the current focus with priorities (`D/connected-character-card.tsx:114-117`).
8. **Effort.** M1 is small (one more parallel GET plus a merge, about 10 lines) but has the highest leverage in this slice. B1 is a one-line change. M2 and M3 are a small rewrite of `MonsterFocusForm`: an "All" row, a Clear button, `monsterChoices` instead of `bestiaryCatalog`, and a `tinyp` filter. Daily dungeons remain the largest item: a new screen plus a map.
