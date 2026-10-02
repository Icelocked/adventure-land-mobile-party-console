# 02 — Character cards, vitals/status, combat, farming, hunting, map, events, dungeons, travel, skills/stats

Auditor 02. Dashboard = `console-v1.2.0` (paths below are relative to it: `dashboard/features/party/*` = `D/`, `runtime/coordinator/*` = `R/`). PWA = `F:\CodingProjects\adventureland-party-mobile\web\src` (paths relative to `src/`).

## Summary

Counts across the 81 classified rows in the table below (rows 17 and 66 are not counted):

| Classification | Count |
|---|---|
| PRESENT | 15 |
| PARTIAL | 16 |
| BROKEN | 9 |
| MISSING | 40 (16 of them are daily dungeons) |
| UNREACHABLE | 1 |

### Top 5 most impactful gaps

1. **Daily dungeons (Cave of Many Dreams, new in v1.2.0) are missing entirely.** The PWA has no `/daily-dungeons` GET or POST. That leaves out the in-run panel (exit with confirmation, auto-exploration toggle, room moves, encounter votes with paid-vote confirmation, cave shop purchase, Nera/priest revival, retry, recover missing participants, waypoint map), plus the event-row settings (enter or resume, protect-from-events, release "Resume ordinary activity"). There is also a live hazard. In v1.2.0 the server's `/escape` and `/town-party` silently exit the dungeon when one is active (`R/http/party-actions.ts:101,132,140-143`), and the PWA's "Escape" and "Send party to town" buttons show no dungeon state, label or confirmation (`screens/CharacterListScreen.tsx:80-99`). One tap ends the daily run.
2. **Hunt settings and blacklist edit the wrong character's profile.** `HuntSettingsScreen` reads the top-level leader fields `dynamicState.huntSettings` / `huntBlacklist` and posts to `/hunt-settings` and `/hunt-blacklist` without `character` (`api/partyApi.ts:617-627`). The scoped route then falls back to `mainOwner() = party.leader` (`R/http/farming-scope.ts:18`, `R/application.ts:1880,2139-2140`). For an independent character, the "Hunt settings..." button on its own screen shows and edits the leader's settings instead. Passive hunting, preferred hunt spawns and manual "Add to blacklist" are missing.
3. **The monster focus editor is wired differently from the dashboard (BROKEN).**
   - Saving with nothing ticked sends `['all']` (`FarmingSection.tsx:384`), so focus cannot be cleared. The dashboard sends `[]` and has a dedicated Clear-all X.
   - Saving only the radius rewrites focus the same way.
   - The list comes from `bestiaryCatalog` (`:354`), not `monsterChoices`, so it offers `tinyp`. The server rejects that with "invalid monster focus" (`R/http/focus.ts:21`).
   - There are no per-monster target priorities. `setFocus` cannot send `monsterPriorities` (`api/partyApi.ts:574-578`).
   - The character-detail fallback treats an explicitly empty per-character focus as "inherit flat focus" (`CharacterDetailScreen.tsx:132`).
4. **Per-character diagnostics are thrown away, so stats, portrait, tracktrix and online/ping are missing.** `PartyDataProvider.tsx:165-175` keeps only `characterDetails[name].monsterHunt`. Everything the dashboard reads from the `diagnostics`/`presence` domains (`D/query-cache.tsx:205-221`) is discarded: `combatStats`, `str/int/dex/vit/fortitude/luck`, `attack/frequency/range/speed/armor/resistance`, `tracktrix`, `characterDollHtml`/`characterSprite`, `seenAt` presence, `anniversaryVisit`/`anniversaryState`, `ping`. The Character Stats dialog (`D/character-stats-dialog.tsx`) cannot be built until this is kept.
5. **Event selection, the anniversary status dialog and the live map are missing.**
   - Per-character "Events (n)" selection (`/formation {character, eventSelections}`) is missing, including schedules (LIVE / next time / stale), "Using X's events" inheritance and the Cave row.
   - The anniversary dialog's live round, per-character ticket stages, cake-slice counts, complete sets, tradable surplus, chat-message preview, queued state, failsafe and activity log are missing. The PWA only has the auto-chat toggle and an un-gated "send" button in Settings.
   - The live map (collapsible canvas plus native-size dialog fed by `/map-stream`) is missing, even though the PWA already opens that stream (`data/useTargetMonsterType.ts:45`).

Other notable items:
- Active statuses are rendered only inside `FarmingSection`, which is not rendered for merchants (`CharacterDetailScreen.tsx:115`). Merchant buffs and debuffs (for example mluck) cannot be seen at all.
- The Follow toggle re-sends `leader` (`LeaderFollowerSection.tsx:32`). With a stale or undefined leader, toggling Follow clears or overwrites the party leader.
- "Go home" sends `character-travel main(0,0)` instead of `go-home`, so the home-realm switch and restart never happen.

## Feature table

Endpoint abbreviations: all paths are under `/party-api`. "cmd:X" = `POST /party-api/command {character, type:"X", ...}`.

### A. Character card header and vitals

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | Character portrait (paper-doll HTML / sprite / skin fallback) | `D/character-portrait.tsx:7-39`, `D/connected-character-card.tsx:250` | diagnostics `characterDollHtml`, `characterSprite`, `skin` (core `characterDetails`) | MISSING | none: grepped `characterDollHtml`, `characterSprite`. PWA shows a class icon only (`VitalsHeader.tsx` via `classLook`) | Data is discarded at `data/PartyDataProvider.tsx:165-175`. |
| 2 | Tracktrix badge on portrait (when active with non-zero bonuses) | `D/character-stats-trigger.tsx:29-33` | diagnostics `tracktrix` | MISSING | none: grepped `tracktrix` | |
| 3 | Click portrait to open Character Stats dialog (level, HP, MP, attack, attack speed, range, run speed, armor/resistance with % reduction math, STR/INT/DEX/VIT/FOR effects, luck, 18 combat stats) | `D/character-stats-trigger.tsx:11-61`, `D/character-stats-dialog.tsx:16-182` | diagnostics `attack, frequency, range, speed, unrestrictedSpeed, armor, resistance, str, int, dex, vit, fortitude, luck, combatStats.*` plus inventory slots (weapon attack) | MISSING | none: grepped `combatStats`, `fortitude`, `frequency` (only item formulas). `GearComparisonSheet.tsx:11-12` notes the data is absent | Pure-math port candidate (see Reuse). |
| 4 | Online presence dot (seen within 10s) | `D/connected-character-card.tsx:240,253-255`; presence written at `D/query-cache.tsx:216-220` | `characterDetails[name].seenAt` | MISSING | none: grepped `seenAt`, `presence`. The list shows "offline" only when vitals are null (`CharacterListScreen.tsx:139-141`) | PWA has no stale-vs-live distinction. |
| 5 | Level, class, primary stat, realm line | `D/connected-character-card.tsx:275-277` | vitals `level, ctype, primaryStat, server` | PRESENT | `screens/character-detail/VitalsHeader.tsx:34-36` | |
| 6 | Per-character ping (ms, or "—ms" when offline) | `D/connected-character-card.tsx:278-287` | vitals/diagnostics `ping` | MISSING | `models/character.ts` types `ping` but nothing renders it. `LatencyBadge` is the PWA's own round trip | |
| 7 | XP meter (abbreviated, %, tooltip with exact values) | `D/xp-meter.tsx:5-23` | vitals `xp, max_xp` | PRESENT | `VitalsHeader.tsx:40-50` | The PWA shows full numbers, which is fine. |
| 8 | BANKING / BANK QUEUED / STOCKING UP badges | `D/connected-character-card.tsx:290-302` | vitals `banking, bankQueued, stocking` | PRESENT | `lib/activityLine.ts:20-22` (text in the activity line) | Shown as text rather than a badge. Acceptable. |
| 9 | HP / MP meters | `D/meter.tsx`, `D/connected-character-card.tsx:334-345` | vitals `hp, max_hp, mp, max_mp` | PRESENT | `VitalsHeader.tsx:56-57`, list `CharacterListScreen.tsx:130-135` | |
| 10 | Gold display (abbreviated, exact on hover) for non-merchants | `D/connected-character-card.tsx:401-409` | vitals `gold` | PRESENT | `VitalsHeader.tsx:60` | |
| 11 | Map name and coordinates line (cave maps shown as "Cave of Many Dreams") | `D/character-map-section.tsx:24-25,71-73` | position `map, x, y` | PARTIAL | `VitalsHeader.tsx` shows `{vitals.map} (x, y)` | No `zone_*` to "Cave of Many Dreams" relabel. |
| 12 | "Awaiting status" placeholder | `D/connected-character-card.tsx:233-238` | — | PRESENT | `CharacterDetailScreen.tsx` ("isn't reporting in right now") | |

### B. Active statuses (conditions)

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 13 | Collapsible "Active status" section with count | `D/active-statuses.tsx:28-40` | vitals `conditions[]` | PARTIAL | `FarmingSection.tsx:319-327` (chips inside Farming) | No count, no collapse. |
| 14 | Per-status sprite, live ticking countdown, depleting progress bar, stacks | `D/active-statuses.tsx:43-67`, `D/status-duration.ts:1-31`, `D/duration-label.tsx` | `conditions[].sprite, remainingMs, stacks, source, definition.duration` | PARTIAL | `FarmingSection.tsx:321-326` shows name + static `formatDuration(remainingMs)` | No sprite, no stacks, no bar, no ticking between samples, no "Active"/"Expiring" labels. PWA `Condition` type lacks `definition/live/sprite` (`models/item.ts:39-46`). |
| 15 | Click a status to open the Condition Details dialog (sprite, name, character, duration, explanation, every definition and live field with duration formatting) | `D/condition-details.tsx:15-60`, `D/party-condition-details.tsx`, `D/format-duration.ts:13-16` | `conditions[].definition, live` | MISSING | none: grepped `ConditionDetails`, `definition` on Condition. Only a `title=explanation` tooltip (`FarmingSection.tsx:322`) | |
| 16 | Statuses visible for **merchant** characters | `D/connected-character-card.tsx:347-351` (outside the merchant branch) | vitals `conditions` | UNREACHABLE | `CharacterDetailScreen.tsx:115` gates `FarmingSection`, the only place conditions render, with `ctype !== 'merchant'` | A merchant's mluck and other buffs are never shown. |
| 17 | Mluck clover on duplicated items | `D/mluck-clover.tsx` | item `m` | not audited | — | Belongs to the inventory slice (see Out-of-slice). |

### C. Formation (leader, follow, focus owner)

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 18 | Leader radio (one leader, set by value) | `D/party-workspace.tsx:44-47`, `D/connected-character-card.tsx:308-314` | `POST /formation {leader}` | PRESENT (plus extra) | `LeaderFollowerSection.tsx:20-26`, `api/partyApi.ts:221-223` | The PWA also lets you tap the current leader to send `leader:null` (clear). The dashboard cannot do that. Not a parity gap, but it risks accidental clears. |
| 19 | Follow checkbox | `D/connected-character-card.tsx:127-130,315-325` | `POST /formation {character, follow}` | BROKEN | `LeaderFollowerSection.tsx:30-33` sends `{character, follow, leader: dynamicState.leader ?? null}` | The extra `leader` field is not in the dashboard body. Before core state loads, or if it is stale, toggling Follow **clears or overwrites the leader** (`R/http/formation.ts:144-148`). See BROKEN #B1. |
| 20 | "Following X" hint | n/a (the dashboard shows "Copy leader" in the farming badge, `D/farming-mode-control.tsx:127`) | — | PRESENT | `LeaderFollowerSection.tsx:41` | |

### D. Events and anniversary

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 21 | "Events (n)" popover per character: checkbox per supported event, sorted | `D/event-selection-control.tsx:20-41`, `dashboard/lib/event-policy.ts:9-35` | `POST /formation {character, eventSelections:[...]}`; state `eventSelectionsByCharacter`, `eventsByCharacter`, `eventSchedules` | MISSING | none: grepped `eventSelections`, `eventSchedules`, `eventsByCharacter` | Server validates against the supported list and returns 409 "using leader events" for followers (`R/http/formation.ts:112-118`). |
| 22 | Event schedule labels (LIVE / next time with countdown / "Next chance" slot / "Time not announced" / "timing stale" / "Unsupported") | `D/event-selection-control.tsx:14-19,35` | `eventSchedules[]` | MISSING | none | |
| 23 | "Using {leader}'s events" inheritance (checkboxes disabled for followers) | `D/event-selection-control.tsx:28,33`, `dashboard/lib/event-policy.ts:20-34` | derived | MISSING | none | |
| 24 | Anniversary settings cog, opens Anniversary dialog | `D/event-selection-control.tsx:36`, `D/party-reference-panels.tsx:102-117` | — | MISSING | none | |
| 25 | Anniversary dialog: live target, map, coords, expiry countdown; next round and depart times | `D/anniversary-dialog.tsx:38-46,82-91` | `state.anniversary.live / schedule` | MISSING | none: grepped `anniversary` (only autoChat / chat-advertise in Settings) | `state.anniversary` already arrives in core and is merged untyped into dynamicState. |
| 26 | Anniversary farming-return failsafe and return-dispatched status | `D/anniversary-dialog.tsx:47-53,92-98` | `anniversary.eventCycle` | MISSING | none | |
| 27 | Per-character ticket stage ("ticket ready", "kiss confirmed", ...) | `D/anniversary-dialog.tsx:99-118` | diagnostics `anniversaryVisit`, `anniversaryState` | MISSING | none | Needs the characterDetails fix (Top gap 4). |
| 28 | Cake slices grid, complete sets, tradable native surplus | `D/anniversary-dialog.tsx:120-137` | `anniversary.slices, labels, counts, completeSets, tradableNative` | MISSING | none | |
| 29 | Auto-chat toggle | `D/anniversary-dialog.tsx:75-79`, `D/party-reference-panels.tsx:107` | `POST /dashboard-preferences {anniversaryAutoChat}` | PRESENT | `screens/account/SettingsScreen.tsx:75-86`, `api/partyApi.ts:686-688` | |
| 30 | Chat advertisement: message preview, button disabled when no message or already queued, "Queued for {merchant}" | `D/anniversary-dialog.tsx:139-168` | `POST /anniversary/chat-advertise`; `anniversary.chatMessage, chatAdvertisement` | PARTIAL | `SettingsScreen.tsx:88-94`, `api/partyApi.ts:692-694` | No preview, no gating, no queued state. The user can fire it blindly. |
| 31 | Anniversary activity log (colour coded) | `D/anniversary-dialog.tsx:169-182` | `anniversary.activity` | MISSING | none | |

### E. Daily dungeons (Cave of Many Dreams), new in v1.2.0

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 32 | Dungeon state polling (1s) | `D/dungeon-query.ts:8-36` | `GET /daily-dungeons` (`R/dungeons/service.ts:519`) | MISSING | none: grepped `daily-dungeons`, `dungeon` across `src` and `e2e/fixtures/mockPartyServer.ts` | |
| 33 | Cave row in the Events popover: entry label (Available now / Next entry countdown / unknown / checking) | `D/dungeon-settings.tsx:69-91`, `D/dungeon-query.ts:42-51` | view `members[].observation.visit` | MISSING | none | |
| 34 | Cave settings dialog: resume server note, participants (offline marks), per-member eligibility errors, eligibility rule text | `D/dungeon-settings.tsx:99-124,167-172` | view | MISSING | none | |
| 35 | "Don't leave the Cave for other events" toggle | `D/dungeon-settings.tsx:125-144` | `POST /daily-dungeons {action:'settings', protectFromEvents, operationId}` | MISSING | none | Every POST needs a unique `operationId` (`R/dungeons/service.ts:278-280`). |
| 36 | Enter now / Resume visit | `D/dungeon-settings.tsx:145-157` | `{action:'enter'|'resume'}` | MISSING | none | |
| 37 | Resume ordinary activity (held phase) | `D/dungeon-settings.tsx:158-166` | `{action:'release'}` | MISSING | none | |
| 38 | Dungeon panel: Exit dungeon with confirmation dialog | `D/dungeon-panel.tsx:67-82,321-322` | `{action:'exit', run}` | MISSING | none | |
| 39 | Retry failed preparation | `D/dungeon-panel.tsx:83-91` | `{action:'retry'}` | MISSING | none | |
| 40 | Return missing participants | `D/dungeon-panel.tsx:92-102` | `{action:'recover'}` | MISSING | none | |
| 41 | Floor, time remaining (paused reason), shared gold, Amber, member list | `D/dungeon-panel.tsx:103-113` | view `observation.cave` | MISSING | none | |
| 42 | Start automatic exploration / Stop travel, progress message | `D/dungeon-panel.tsx:115-126` | `{action:'progress', enabled}` | MISSING | none | |
| 43 | Priest recovery status label; "Call Nera — revival choices" | `D/dungeon-panel.tsx:32-57,127-153` | `{action:'revival'}` | MISSING | none | |
| 44 | Room/point buttons (required, done, locked, different floor) to move | `D/dungeon-panel.tsx:154-177` | `{action:'move', target}` | MISSING | none | |
| 45 | Encounter dialog: text, vote deadline, options with cost/Amber/unavailable, voter names, paid-vote confirmation, result view | `D/dungeon-panel.tsx:178-265` | `{action:'vote', choice, option[, cost, amber, confirmed:true]}` | MISSING | none | The server refuses paid votes without `confirmed` (`R/dungeons/service.ts:444`). |
| 46 | Cave shop: inspect item, Buy with confirmation | `D/dungeon-panel.tsx:266-319` | `{action:'buy', choice, cost, confirmed:true}` | MISSING | none | |
| 47 | Cave full map with party pins, waypoint placement, native-size toggle | `D/cave-map.tsx:19-175` | `/map-stream/{name}` x participants; `{action:'waypoint', map, x, y}` | MISSING | none | |
| 48 | Escape button becomes "Escape — exit dungeon" while in a dungeon | `D/escape-control.tsx:11-12,23,59` | `POST /daily-dungeons {action:'exit'}` | BROKEN | `CharacterListScreen.tsx:83-99` always posts `/escape` with the label "Escape" | Server `/escape` during a dungeon calls `dungeon.exit` (`R/http/party-actions.ts:131-133,140-143`). The effect matches, but the user is not told an Escape tap will end the daily run. `/town-party` likewise exits (`:101`). See BROKEN #B5. |

### F. Farming mode and hunt

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 49 | Farming mode selector (Auto / Default / Scatter / Hunt with descriptions) | `D/farming-mode-control.tsx:82-112,234-247` | `POST /farming-mode {mode, character}` | PRESENT | `FarmingSection.tsx:24-29,126-139,156-161`, `api/partyApi.ts:563-569` | Correct `character` field. |
| 50 | Badge "Copy leader" / policy · effective mode; "Used when Follow is off" | `D/farming-mode-control.tsx:126-129,233` | `farmingProfiles`, `farmingContext` | PARTIAL | `FarmingSection.tsx:152-165` | Wrong copy: "Account-wide - applies to the whole party." (`:153`). Since v1.2.0 farming is per character, with followers saved-only (`R/http/saved-farming-mode.ts`). The PWA also shows "Currently:" for followers, which the dashboard hides. |
| 51 | Hunt backup setup (monster picker plus area) when Hunt needs a backup | `D/use-party-console.tsx:454-478`, `D/party-workspace.tsx:80-115` | `POST /farming-mode {mode:'hunt', character, backup:{monsterFocus, location}}` | PRESENT | `FarmingSection.tsx:126-139,174-199` | The PWA tries first and opens the picker on error; the dashboard pre-checks. Both work. The PWA picker list uses `bestiaryCatalog` (`components/FarmingAreaPicker.tsx:101-103`), not `monsterChoices`, and includes `tinyp`. |
| 52 | Active farming zone and message (hidden when inherited) | `D/farming-mode-control.tsx:248-251` | `farmAreaState` | PRESENT | `FarmingSection.tsx:166-171` | Also shown when inherited. Minor. |
| 53 | Hunt status block: "Hunt status" / "Last Hunt status", stage, message, "Preparing Monster Hunt cycle", current mode note | `D/farming-mode-control.tsx:252-259` | `monsterHunt` | PARTIAL | `FarmingSection.tsx:299-308` | Only rendered when `monsterHunt.target` exists. No "last status", no preparing text. |
| 54 | Hunt backup batch: "Next batch after every blacklisted quest expires" countdown plus per-member target/ready/fresh | `D/farming-mode-control.tsx:260-262` | `monsterHunt.backup.members` | MISSING | type exists (`models/state.ts` `MonsterHuntCycle.backup`) but nothing renders it | |
| 55 | Quest owner and "Events wait until Daisy reward claims finish" (turnIn) | `D/farming-mode-control.tsx:263-264` | `monsterHunt.owner, turnIn` | PARTIAL | `FarmingSection.tsx:305` (owner only) | turnIn notice missing. |
| 56 | My quest: id, count left, time, "Blacklisted — skipped for Hunt" | `D/farming-mode-control.tsx:266-272` | diagnostics `monsterHunt` (characterDetails) | PRESENT | `FarmingSection.tsx:309-318`, `data/PartyDataProvider.tsx:173-175` | |
| 57 | Farming settings dialog titled with settings owner; whole dialog disabled when inherited | `D/farming-mode-control.tsx:143-156` | `farmingContext.owner` | BROKEN | `screens/account/HuntSettingsScreen.tsx` (no owner, never disabled) | See BROKEN #B2. |
| 58 | Hunt settings: relocate if competing (plus help), blacklist after N deaths, blacklist after N expirations, rules text | `D/hunt-settings-control.tsx:9-134` | `POST /hunt-settings {…patch, character}` | BROKEN | `HuntSettingsScreen.tsx:58-101`, `api/partyApi.ts:625-627` (no `character`) | Edits the leader's profile regardless of which character's screen opened it. Reads top-level `huntSettings` instead of the character's `farmingProfiles[owner].huntSettings`. PWA `resolveFarmingContext` lacks `settings` (`models/state.ts:725-737`). |
| 59 | Preferred hunt spawns per monster (Automatic or a specific spawn, with map preview) | `D/hunt-spawn-settings.tsx:13-94` | `POST /hunt-settings {preferredSpawns:{[id]:key}, character}` | MISSING | none: grepped `preferredSpawns`. The PWA `HuntSettings` type lacks it (`models/state.ts`) | `huntSpawnKey` is in `R/hunt/spawn-preferences.ts` and is portable. |
| 60 | Hunt blacklist list sorted, with sprite, name, label ("3 hunt deaths · 1 hunt expired" / "manually added"), date, Clear | `D/farming-mode-control.tsx:171-209`, `D/hunt-blacklist-label.ts:1-6` | `POST /hunt-blacklist {action:'remove', monsterId, character}` | BROKEN | `HuntSettingsScreen.tsx:45-53,130-148`, `api/partyApi.ts:617-621` (no `character`) | Wrong owner, same as #58. Shows raw `entry.reason`, not `huntBlacklistLabel`. |
| 61 | Clear all with confirmation dialog ("Remove all N … for {owner}?") | `D/farming-mode-control.tsx:160-168,218-230` | `{action:'clear', character}` | BROKEN | `HuntSettingsScreen.tsx:104-128` | The confirmation exists, but it targets the leader (no `character`). |
| 62 | Add to Hunt blacklist (searchable monster picker, inspect monster) | `D/hunt-blacklist-picker.tsx:8-44`, `D/connected-character-card.tsx:205-207` | `{action:'add', monsterId, character}` | MISSING | `api/partyApi.ts:617` supports `'add'`, but no UI calls it (grepped `updateHuntBlacklist`) | |
| 63 | Click a blacklisted monster to open Monster details | `D/farming-mode-control.tsx:184-197` | — | MISSING | none | |
| 64 | Passive hunting: "Use field generators when passively hunting fairy" toggle | `D/passive-hunting-menu.tsx:50-51` | `POST /rare-hunting {useFieldGenerators}` | MISSING | none: grepped `rare-hunting`, `passiveHunting`, `useFieldGenerators` | |
| 65 | Passive hunting table: per-monster enabled, "Keep moving to destination", max level (-1 = any), priority 0-1000, search, info popover, inspect | `D/passive-hunting-menu.tsx:15-71` | `POST /rare-hunting {rules:{[id]:{enabled|keepMoving|maxLevel|priority}}}`; state `passiveHunting`, `passiveRareHunts` | MISSING | none | The server rejects `fieldgen0` and unknown ids (`R/http/monster-selection.ts:55`). |
| 66 | Combat recovery status passed to the farming control | `D/connected-character-card.tsx:364-368` | `combatRecovery` | n/a | — | The prop is not rendered in `D/farming-mode-control.tsx`. Nothing to port. |

### G. Monster focus, radius and routing

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 67 | Monster focus picker: "All monsters" option, search on name and id, sprites, auto-save (180ms debounce), selected-first ordering, count badge | `D/monster-focus-picker.tsx:12-232`, `D/connected-character-card.tsx:113` | `POST /focus {character, monsterFocus}`; source list `monsterChoices` (`D/use-party-console.tsx:801`) | BROKEN | `FarmingSection.tsx:333-398` | Uses `bestiaryCatalog`. No "All" option. Empty selection becomes `['all']`. Explicit Save. See BROKEN #B3. |
| 68 | Clear all focus (X button) | `D/monster-focus-picker.tsx:219-229` | `{monsterFocus: []}` | MISSING | impossible: `FarmingSection.tsx:384` converts `[]` to `['all']` | |
| 69 | Per-monster target priority (0-1000, default 50, "higher wins") | `D/monster-focus-picker.tsx:106-124,191-206`, `D/connected-character-card.tsx:114-117` | `POST /focus {character, monsterFocus, monsterPriorities}`; state `monsterPrioritiesByCharacter` | MISSING | `api/partyApi.ts:574-578` has no `monsterPriorities` param; grepped `monsterPrioritiesByCharacter`: none | |
| 70 | Fairy (`tinyp`) shown disabled with an explanation | `D/monster-focus-picker.tsx:99,172-176,216` | — | BROKEN | `FarmingSection.tsx:354-367` lists `tinyp` as selectable | The server returns 400 "invalid monster focus" (`R/http/focus.ts:21`). The user gets an opaque error. |
| 71 | Focus displayed: per-character, else flat `monsterFocus` | `D/connected-character-card.tsx:105` (`byCharacter?.[name] || selectedFocus`, where `[]` is kept as "No monsters selected") | `monsterFocusByCharacter`, `monsterFocus` | PARTIAL | `CharacterDetailScreen.tsx:132` uses `?.length ?` | An explicitly empty per-character focus shows the flat (leader) focus instead of "No monsters selected". |
| 72 | Monster search radius (1-10000 validation, context "Following X: effective radius N…", "Clearing monster focus resets this to 400", zone-first explanation) | `D/monster-radius-control.tsx:5-17`, `D/connected-character-card.tsx:148-151,356-363`; header "Monster focus - {radius}" `:429-434` | `POST /focus {character, monsterFocus, monsterPriorities, monsterSearchRadius}` | PARTIAL | `FarmingSection.tsx:369-372,384` | No validation (`Number(radius)||400`), no context or help text, no header radius. Saving the radius also rewrites focus (B3). |
| 73 | Route button "Find selected monster" (disabled for followers with the "only leader can route to monster" tooltip) | `D/monster-route-button.tsx:12-41`, `dashboard/lib/party-routing.ts` | — | PRESENT | `FarmingSection.tsx:237-246` | |
| 74 | Farming area picker: grouped areas, nearest/waypoint preference, Phoenix 5-region order, Start | `D/farming-area-picker.tsx:21-231`, `D/use-party-console.tsx:747-777` | cmd:`party-monster-travel` (leader) / cmd:`character-travel` with `{location, farmingMonsterIds, label}`; Phoenix: `POST /navigate-to-monster {monsterId:'phoenix', location, phoenixRouteOrder}` | PARTIAL | `components/FarmingAreaPicker.tsx:27-210`, `api/partyApi.ts:586-612` | Missing: saved-waypoint preference (`waypoint` = `characterLocations[char] \|\| partyLocation`, `D/party-workspace.tsx:126-130`), map preview and "Enlarge map", legend, per-monster `MonsterSpawns` fallback when there are no routes (`D/farming-area-picker.tsx:116-125`), and the `label` field (the server falls back to "destination" / "selected monster", `R/navigation/manual-commands.ts:80,93`). |
| 75 | Monster details dialog (achievement progress, recorded spawns with restriction reasons, full definition grid, drops with inspect, Navigate) | `D/monster-details-dialog.tsx:19-79`, `D/monster-spawns.tsx:1-34` | Navigate opens the picker with override, then `POST /navigate-to-monster {monsterId, location}` (`D/use-party-console.tsx:755-762`) | PARTIAL | `screens/account/BestiaryScreen.tsx:22-73` (HP/ATK/XP and drops only) | No spawns, no definition grid, no achievements. **Navigate-to-monster for non-Phoenix monsters is missing** (`navigateToMonster` is only called for Phoenix, `FarmingSection.tsx:214`). |

### H. Map

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 76 | Collapsible live character map (20fps canvas from map-stream, entity HP bars, target queue markers, stream state "reconnecting") plus native-size dialog (names, hit/heal floaters) | `D/character-map-section.tsx:20-127`, `D/map-canvas.tsx` (504 lines), `D/map-render-buffer.ts`, `D/dreams-gate.ts`, `D/cached-map-image.tsx` | `GET /map-stream/{name}` (SSE), `GET /maps/{map}` (`D/query-cache.tsx:318`) | MISSING | The PWA opens `/map-stream` only to resolve the target type (`data/useTargetMonsterType.ts:38-69`) | |

### I. Travel, escape, town and gold

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 77 | Send character to… (known area select **or exact map/X/Y**, validation, error) | `D/character-travel-dialog.tsx:24-175`, `D/use-party-console.tsx:723-736` | cmd:`character-travel {location:{map,x,y}, label}` | PARTIAL | `screens/character-detail/sections/TravelSection.tsx:24-60`, `api/partyApi.ts:391-393` | Preset list only. No custom map/coordinates, no error display. |
| 78 | Return to leader (disabled while the leader is offline) | `D/inventory-panel.tsx:1288-1297` | cmd:`return-leader` | PARTIAL | `TravelSection.tsx:36-40` | Hidden for the leader, which is fine. Not disabled while the leader is offline (the server 409s), and the result is ignored (no error shown). |
| 79 | Go home (merchant) | `D/inventory-panel.tsx:1278-1286` | cmd:`go-home` | BROKEN | `TravelSection.tsx:32` sends `character-travel main(0,0) label 'home'` | See BROKEN #B4. |
| 80 | Send party to town | `D/party-workspace.tsx:69-75`, `D/use-party-console.tsx:439-445` | `POST /town-party` | PRESENT | `CharacterListScreen.tsx:80-82`, `api/partyApi.ts:405-407` | Exits a dungeon if one is active (see #48). |
| 81 | Escape with 1s status polling, spinner, "failed"/"success" labels | `D/escape-control.tsx:10-64` | `POST /escape`, `GET /escape` | PARTIAL | `CharacterListScreen.tsx:67-102`, `data/PartyDataProvider.tsx:145,208-211` | The PWA polls every 6s (`DYNAMIC_STATE_POLL_MS`, `PartyDataProvider.tsx:28`), so the stage lags. Not dungeon-aware (#48). |
| 82 | Merchant gold target ("Merchant's pocket money", saves on blur) plus "Exchange gold and items with bank" button | `D/gold-target-control.tsx:8-75`, `D/connected-character-card.tsx:131-135,393-400` | cmd:`gold-target {amount}`; cmd:`bank` | PARTIAL | `sections/GoldTargetSection.tsx:12-56` | The target is present (offered for every character, which the server allows, `R/inventory/upgrade-commands.ts:164`). The **bank exchange button (cmd:`bank`) is missing**: grepped `'bank'` sendCommand, none. No bound check (the server's max is 1e12). |

### J. Skills reference

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 83 | Skills dialog: search across class and skill, sprite grid, skill id, Range label (Global / multiplier × attack range ± bonus / "+ character level" for throw / Not specified), detail pane with "G.skills.id", explanation, range explainer, full definition grid | `D/skills-dialog.tsx:20-156`, `D/skill-range-label.tsx:4-18` | `skillCatalog` | PARTIAL | `screens/account/SkillsScreen.tsx:10-65` | No search, no sprites, no id. Range uses raw `def.range` (wrong for `use_range`, `range_multiplier` and global skills). No definition grid. |

Row count note: the table has 83 numbered rows. Row 17 is out of slice and row 66 has nothing to port, so neither is counted. The summary counts cover the other 81 rows.

## BROKEN details

**B1. Follow toggle re-sends `leader`.**
- Dashboard (`D/connected-character-card.tsx:127-130`): `formation({ character: name, follow: !!checked })`.
- PWA (`screens/character-detail/sections/LeaderFollowerSection.tsx:32`): `api.setFormation(dynamicState.leader ?? null, characterName, !isFollowing)`, and `api/partyApi.ts:222` sends `{ character, follow, leader }`.
- Server (`R/http/formation.ts:144-148`): if `body.leader !== undefined`, `state.leader = body.leader === null ? null : …`.
- If core state has not loaded, or the core fetch failed (`leader` undefined, sent as `null`), toggling Follow clears the party leader. A stale value can revert a leader change made elsewhere.
- Fix: make `leader` optional in `setFormation` and omit it for follow toggles.

**B2. Hunt settings and blacklist target the leader, not the character in view.**
- Dashboard (`D/connected-character-card.tsx:156-161,194-207`) posts `/hunt-settings {...patch, character: name}` and `/hunt-blacklist {action, monsterId?, character: name}`. It reads `farmingContext(state,name).settings/blacklist` (`D/farming-context.ts:16-17`), which come from `farmingProfiles[owner]`.
- PWA `api/partyApi.ts:617-627` never sends `character`. `HuntSettingsScreen.tsx:22,45` reads top-level `dynamicState.huntSettings` / `huntBlacklist` (the leader's legacy fields).
- Server `R/http/farming-scope.ts:17-18`: if `character === undefined`, `main(req, … ports.mainOwner())`, and `mainOwner: () => party.leader` (`R/application.ts:1880`).
- Result: on an independent (non-leader, non-following) character's screen, "Hunt settings..." (`FarmingSection.tsx:247`) shows and edits the leader's settings. The character's own blacklist (shown correctly in `FarmingSection` via `resolveFarmingContext`) cannot be cleared.
- For followers, the dashboard locks everything ("following leader settings", 409 at `farming-scope.ts:33`). The PWA lets a follower's screen edit the leader's profile.
- Fix: pass `characterName` through the route (for example `/hunt-settings/:name`), add `character` to both API methods, add `settings` to `resolveFarmingContext`, and disable editing when `followingLeader`.

**B3. Monster focus save semantics.**
- Dashboard: `toggle('all')` produces `['all']` or `[]`. The X button calls `queueSelection([])`, and each change auto-posts `{character, monsterFocus: next}` (`D/monster-focus-picker.tsx:98-105,225`). The list is `monsterChoices`, `tinyp` is blocked, and priorities are sent via `onPriorityChange` (`D/connected-character-card.tsx:114-117`).
- PWA (`FarmingSection.tsx:384`): `api.setFocus(characterName, selected.length ? selected : ['all'], Number(radius) || 400)`. The list is `bestiaryCatalog` (`:354`), which includes `tinyp`.
- Consequences:
  - (a) The user cannot clear focus. Clearing becomes "All monsters", the opposite of intent.
  - (b) Saving only the radius with an empty focus also flips to All.
  - (c) Selecting Fairy yields a 400 from `R/http/focus.ts:18-22`.
  - (d) Monsters in the bestiary but absent from `monsterChoices` can be selected, giving silent no-op focus.
  - (e) Priorities cannot be set.

**B4. Merchant "Go home" uses the wrong command.**
- Dashboard: `onCommand(character.name, "go-home")` (`D/inventory-panel.tsx:1281`).
- PWA: `api.sendCharacterTo(characterName, 'main', 0, 0, 'home')`, which is `character-travel` (`TravelSection.tsx:32`, `api/partyApi.ts:391-393`).
- Server `go-home` (`R/navigation/manual-commands.ts:112-130`) checks the merchant, resets `block.realm = state.activeRealm`, logs, and restarts the block if the realm differs or it is disconnected. `character-travel` (`:71-84`) only walks.
- A merchant parked on another realm is never brought home.

**B5. Escape and Town are not dungeon-aware.**
- Dashboard `D/escape-control.tsx:11-12,23,59`: in a dungeon, Escape calls `daily-dungeons {action:'exit'}` and the label reads "Escape — exit dungeon". The dungeon panel's own exit requires confirmation (`D/dungeon-panel.tsx:72-82`).
- PWA `CharacterListScreen.tsx:80-99`: plain "Escape" and "Send party to town" with no confirmation.
- Server `R/http/party-actions.ts:101,132`: both call `exitDungeon()` when `dungeonOwns(state)`.
- The functional effect matches the dashboard Escape. The user cannot know that tapping it (or Town, which the dashboard also does not label) ends the once-per-day run. Combined with the missing dungeon UI (#32-47), the PWA cannot even show that a run is in progress.

**B6 (minor, listed as PARTIAL in the table). Route-to-area omits `label`.** The dashboard sends `label: "the selected farming area in {mapName}"` (`D/use-party-console.tsx:774`). The PWA `routeToFarmingArea` (`api/partyApi.ts:601-612`) omits it, so the server's status/log text reads "destination" / "selected monster".

## Reuse opportunities

Pure logic that can be ported nearly verbatim:
- `D/character-stats-dialog.tsx:26-151`: every stat formula (attribute effects, the `damageMultiplier` defense curve, the vitality HP formula) is framework-free. Lift it into `lib/characterStats.ts` once `characterDetails` is retained.
- `D/status-duration.ts` (31 lines, pure) plus `D/duration-label.tsx` give ticking status countdowns. `formatDuration` and `durationStat` already exist in the PWA (`lib/itemFormulas.ts:305` area). Reuse those and do not duplicate them.
- `dashboard/lib/event-policy.ts` (37 lines, pure), plus `eventTimeLabel` from `D/event-selection-control.tsx:14-19`.
- `D/hunt-blacklist-label.ts` (6 lines).
- `D/skill-range-label.tsx` (18 lines).
- `D/dungeon-query.ts:38-51` (`dungeonCountdown`, `dungeonEntryLabel`), plus the eligibility predicate in `D/dungeon-settings.tsx:77-88` and the recovery-label map in `D/dungeon-panel.tsx:45-57`.
- `R/hunt/spawn-preferences.ts` (`huntSpawnKey`) for preferred spawns. `zones()` is already ported in `lib/farmingZones.ts`.
- `R/coordinator/navigation/passive-settings.ts` (`migratePassiveSettings`, `defaultPassiveRule`) for the passive hunting table.
- `D/monster-spawns.tsx` reason map (10 lines).

Existing PWA helpers to extend rather than duplicate:
- `data/PartyDataProvider.tsx:165-175`: stop discarding `characterDetails`. Store the whole record (for example `characterDiagnostics: Record<string, …>`) and derive presence (`seenAt` within 10s, per `D/query-cache.tsx:216-220`). This unblocks rows 1-4, 6 and 27.
- `models/state.ts` `resolveFarmingContext`: add `settings` (huntSettings) to match `D/farming-context.ts:17`. Add `preferredSpawns` to `HuntSettings`. Add `monsterPrioritiesByCharacter`, `eventSelectionsByCharacter`, `eventsByCharacter`, `eventSchedules`, `anniversary`, `passiveHunting`, `passiveRareHunts` and `characterLocations`/`partyLocation` to `PartyStateDynamic`. They already arrive in the core payload and are merged untyped (`PartyDataProvider.tsx:188-196`).
- `api/partyApi.ts`:
  - make `setFormation`'s `leader` optional and add `eventSelections`;
  - add `monsterPriorities` to `setFocus`;
  - add `character` to `updateHuntBlacklist` and `saveHuntSettings`;
  - add `label` to `routeToFarmingArea`;
  - add `goHome`, `bankExchange` (cmd `bank`), `setRareHunting` and `dailyDungeon(action, body)` (auto-generating `operationId` via `crypto.randomUUID()`).
- `data/useTargetMonsterType.ts` already opens `/map-stream`. Generalise it into a `useMapFrames(name)` hook shared by a future map view, the target resolver and the cave map.
- `components/FarmingAreaPicker.tsx`: add the `waypoint` param and a `MonsterSpawns` fallback. Switch its preparation monster list from `bestiaryCatalog` to `monsterChoices`.

## Out-of-slice observations

- **Character session controls** (logout / move to headless / join or promote Steam) sit in the card header (`D/connected-character-card.tsx:262-273`, `D/use-party-console.tsx:310-340`). Grepping the PWA for `steam/action` and `slots/` found nothing. Probably slice 01 or the roster slice.
- **Per-character combat log** on the card (`D/connected-combat-log.tsx`) with a Clear button: `POST /combat-log/{name}/clear` (`D/combat-log.tsx:33-34`). The PWA shows combat logs only on `LogsScreen` with no clear: grepped `combat-log/`, none.
- **Restock controls** on every card (`D/connected-character-card.tsx:447-451`). The PWA has `RestockSection` and it was not audited here.
- **Account menu reachability:** `AccountMenu` (Bestiary, Skills, …) opens only from the character-detail header (`CharacterDetailScreen.tsx` Menu button). The party list screen has no route to it (`CharacterListScreen.tsx:28-41` has only Refresh and Server settings).
- **Temporary debug banner** still ships in production (`CharacterDetailScreen.tsx:66-79`, "TEMPORARY diagnostic … coreFetchDebug").
- **Stale PWA comments assert farming mode is account-wide** (`models/state.ts` near `farmingPolicy`; `FarmingSection.tsx:40-46`). That contradicts `R/http/farming-scope.ts` and the PWA's own `setFarmingMode` doc (`api/partyApi.ts:548-562`). Likely the source of the wrong UI copy in row 50.
- **Bestiary dialog** (`D/party-reference-panels.tsx:58-75`) has achievements, drops inspect and Navigate. The PWA `BestiaryScreen` is a reduced version. Owned by the reference/bestiary auditor, but the Navigate-to-monster action (row 75) is a farming capability gap.
- **Runtime routes with no dashboard UI** (character-script driven, so no PWA parity required): `/convoy-*`, `/grouped-approach`, `/event-disabled`, `/event-ended`, `/return-progress`, `/town-complete`, `/farming-return`, `/hunt-event-permission`, `/monster-hunt/retry-return`, `/escape/resume`, `/anniversary/{attempt,claim,failure,handoff,return-ready,staging,trade,advertise,cake-supplies}`, `/movement-plan`, `/shared-travel`, `/convoy-route`, `/movement-barrier`, `/travel`, `/upgrade-party`. I verified by grepping `dashboard/` for each path: the only dashboard callers are those in `D/query-actions.ts:19-73`.
