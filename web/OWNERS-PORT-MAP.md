# Owners release port map

This branch ports the PWA to the owners console release that the user's live console
runs. The release is `fix/merged` at ae6563132 (c573fc423 plus a dashboard fix), with the
wire changes of `tests/unit` (U3, U6) and `tests/live-b` (f4de3f2d7) on top; its
`dashboard/` is the spec.

`main` and `dev` follow Ryan's console releases and stay untouched. This branch starts
from `origin/fork` 5f7311f, the user's branch for their own console. `fork` is
`origin/dev` up to 6f4ce40 plus 64 commits. The 4 `dev` commits past 6f4ce40 are the
three card commits, which `fork` carries as a142cf6, cee679d and f61c80b, and the 1.1.1
version bump. Half A was first written on `origin/dev` 55c516d (c248f59) and is carried
onto `fork` here.

`fork` ported several console 1.5 features against the console fork. Each one is
checked below against the release's wire. The fork console's own controls (party roles
in Farming settings, Franky routine, boss chase, realm hop blacklist, prim stack, gapped
bank sort, Ponty and Ron orders) gate on state fields the release never sends
(`models/consoleFeatures.ts`), so they stay hidden on the release. The release moves the
tank roles into the tank hold add-on (B10).

## Split

- **Half A - wire, core polling, mock server, breakages** (this branch).
  Files: `src/api/*`, `src/data/*`, `src/models/state.ts`, `src/lib/freshness.ts`,
  `src/components/FreshnessBadge.tsx`, `src/lib/ruleConflicts.ts`, the breakage lines in
  `InventorySection.tsx`, `HuntSettingsScreen.tsx`, `MerchantSettings.tsx`,
  `useDailyDungeon.ts`, `CaveEventRow.tsx`, and `e2e/fixtures/mockPartyServer.ts`.
- **Half B - feature screens**: every row marked B below that is not done on `fork`,
  in the two sets of "Split of what is left".

Status key: **BREAK** = wrong or missing on `fork` against the release; **parity** = works
on `fork`, but the dashboard now does it differently; **ok** = no PWA change. The "PWA
today" column describes `fork` 5f7311f. `fork` changed none of the A1-A17 code paths, so
those rows read as they did on `dev`.

## A. Wire changes

| # | Change (release source) | PWA today | Status | Half |
|---|---|---|---|---|
| A1 | `GET /state?section=core&dashboard=1` no longer sends `serverNow` (query-cache.tsx drops `synchronizeDashboardClock`; status/coordinator/state.ts) | `PartyDataProvider` sets `QK.serverOffset` only from `serverNow`, so the offset stays 0 and `FreshnessBadge` ages use the phone's clock | BREAK | A |
| A2 | `characterDetails[name].online`: the coordinator's one presence rule (state.ts `online`, `fresh(..., 'presence')`); the dashboard reads it instead of `Date.now() - seenAt < 10000` | `useCharacterOnline` compares the server's `seenAt` with the phone's clock | parity | A |
| A3 | Live stream: records lose `sampledAt`; the snapshot and each heartbeat carry `heartbeatMs` (5 s); the dashboard fails after 3 missed heartbeats and reconnects once a core poll answers (dashboard-live.tsx) | `LiveRecordWire.sampledAt` typed; fixed 15 s watchdog, reconnect after 1 s | parity | A |
| A4 | `bank`, `logs`, `market` sections answer `304` for `&revision=<ETag>` while unchanged (rules.ts TABLE_S, query-cache.tsx `readRevision`). Bank is 4.4 MB live | Full download each poll | parity (data use) | A |
| A5 | Config `farmingProfiles.<scope>` loses the live fields; core's new `farmingLive.<scope>` carries `monsterHunt` and `farmAreaState` (state.ts `scopeFields`). `farmingPolicy`, `monsterHunt`, `farmAreaState` stay in config only as "interface v1" (rules.ts `INTERFACE_VERSIONS`), dropped after the apps ship the two mode controls | `resolveFarmingContext` reads them from `farmingProfiles` | parity (v1 removal pending) | A |
| A6 | Scope owner: the merchant farms in its own scope even with a saved follower mark (tasks/rules.ts `scopeOwner`, farming-context.ts) | `resolveFarmingContext` follows the leader for any follower | BREAK (merchant shows leader's Hunt) | A |
| A7 | `relocateIfCompeting` is a root setting in config; Hunt settings no longer hold it (hunting/rules.ts `HuntSettings`); the dashboard writes it through `POST /settings` | `HuntSettingsScreen` reads `huntSettings.relocateIfCompeting`, which is gone, so the switch always shows on | BREAK | A |
| A8 | New `GET /party-api/settings` (`settingsAt`, declared settings) and `POST /party-api/settings {changes:[{field, value, character?}], basis: settingsAt}`; 409 `reason: 'out of date'` (settings-write.ts) | none | new wire, A builds the client | A |
| A9 | `buyUpgradeBatchSize` is written through `POST /settings` (buy-upgrade-batch-setting.tsx); `/config` still takes it | `POST /config {buyUpgradeBatchSize}` | parity | A |
| A10 | U3: an NPC sale mark loses `retryAt`/`retryCount`; a failed sale is `state: 'retrying'` until the merchant's bag changes, and the line reads "Retries when the merchant bag changes" (inventory-panel.tsx, npc-sale-mark.tsx) | `InventorySection` shows "Retry after <time>" from `retryAt`, which never arrives | BREAK | A |
| A11 | U3: the order log reads "Retrying order when ..." for a progress wait; a job's `pauseReason` names the wait; `retryAt` stays for timed waits | `MerchantQueueSection` shows `retryAt` else `pauseReason`, as the dashboard does | ok | - |
| A12 | U6: `steamSwitch.timedOut` removed (public-handoff.ts deleted) | typed in `SteamSwitch`, never read; set in the roster e2e fixture | ok (type and mock cleanup) | A |
| A13 | U6: `statuses["null"]` lookup and Steam bridge v1 removed | not read or sent by the PWA | ok | - |
| A14 | live-b f4de3f2d7: an offline merchant's realm move no longer holds roster spawns | no wire change | ok | - |
| A15 | Core's `incompatibleRules` rows (items/rules.ts `incompatibleRuleRows`) replace the dashboard's client computation (shared-rule-conflicts.tsx) | `ruleConflicts.ts conflictingItems` recomputes them | parity | A |
| A16 | Cave visit: a visit stays current until its reset passes (hunting/rules.ts `caveVisitCurrent`), not 45 s after `checkedAt` (dungeon-query.ts) | `dungeonEntryLabel` and `CaveEventRow` expire it at 45 s, so the label falls to "Availability unknown" between checks | BREAK | A |
| A17 | Stream and inventory item `meta` is joined from the merchant catalog and adds `title`; `meta` is null until the catalog arrives (state.ts `compactEntry`) | reads `meta` as optional | ok | - |
| A18 | Stream vitals add `cc` (code call cost) | merged key by key; `VitalsHeader` shows the CC meter (fork a4fa7af) | ok | - |
| A19 | Fast section is a whitelist (rules.ts `sectionFields.fast`); every stream field is in it | fast is the stream fallback only | ok | - |
| A20 | Routes removed: `POST /farming-return`, `POST /hunt-event-permission` | not used | ok | - |
| A21 | `/party-api/achievement-hunt` and `state.achievementHunt` do not exist; Achievement Hunt is an add-on (runtime/addons/achievement-hunt) | gated on `state.achievementHunt`, so it hides | ok (B ports the add-on) | B |
| A22 | Core adds `accountGold`, `standSlots`, `merchantReady`, `recordSaved`, `consoleControl`, `characterConnections` (presence rule); config adds `combatMode`, `targetMode`, `homeRealm`, `merchantRealmBlacklist`, `handControlByCharacter`, `appLocks`, `characterSnapshots`, `merchantAddonKinds`, `addonItemFates`; logs add `settingsChanges`; bank adds `ownedStock` | `fork` reads `accountGold`, `consoleControl` and `characterSnapshots`; the rest unread | ok (B features) | B |
| A23 | `PartyActionError` keeps a non-JSON refusal's text (query-actions.ts `send`) | `postOnce` keeps `HTTP <status>` for a non-JSON body | parity | A |
| A24 | `characterDetails[name].activity` carries the card's activity line (`text`, `notice`, `task`, `addons`), which the coordinator computes (status/rules.ts `activity`, coordinator/line.ts; connected-character-card.tsx) | `lib/characterActivity.ts` (fork b5269c6) builds the line from the fork console's `activityPhases`, which the release never sends, so the label falls back to the top-level task fields | BREAK | B (B16) |

## B. New or changed dashboard features

Status key: **done** = `fork` has it and it matches the release's wire; **partly** = what
differs is named; **missing** = not on `fork`.

| # | Feature (release source) | `fork` 5f7311f | Status |
|---|---|---|---|
| B1 | Two farming mode controls: combat mode (Auto/Default/Scatter) and target mode (Farming/Hunt/add-on), `POST /farming-mode {character, combatMode}` / `{character, targetMode}` (farming-mode-control.tsx, hunting/coordinator/routes.ts). Shipping it lets the console drop interface v1 (A5) | one `mode` chip row | missing |
| B2 | Settings menu: movable tabbed menu, Account/Events/Add-ons/each character (settings-menu.tsx, account-sections.tsx, farming-settings-section.tsx, combat-settings-section.tsx); writes through A8 | separate account screens; 696d893 put the fork console's party roles into Farming settings | missing |
| B3 | Home realm setting, merchant realm blacklist, merchant trip setting, app locks (home-realm-setting.tsx, merchant-realm-blacklist-setting.tsx, merchant-trip-setting.tsx, settings-lock.tsx) | `RealmSection` shows `realmControl.homeRealm` read-only | missing |
| B4 | Console Pause/Play/shutdown/cancel, `POST /console-control/:action`, `GET /console-control`, core `consoleControl` (console-controls.tsx) | `ConsoleControls` (50ae35d) sends the release's five actions and reads core `consoleControl` | done |
| B5 | Diagnostics button with unread-error badge, alerts and records (diagnostics-dialog.tsx, `/diagnostics/*`) | none | missing |
| B6 | Metrics view: gold, kills, loot, ping, drop estimator, reset (metrics-*.tsx, `/metrics*`) | `/metrics` (b863f3b) reads the release's five routes (status/coordinator/metrics/http.ts) | done |
| B7 | Mailbox automation, new-mail count, outbox (mailbox-controls.tsx, `/mail/settings`, `/mail/seen`, `/mail/outbox-delete`) | 62a63db sends the release's three bodies | done |
| B8 | Offline character inspection (offline-character-view.tsx, `GET /characters/:name/inspection`, config `characterSnapshots`) | 7193d0d ports load-character-inspection.ts's check and route | done |
| B9 | October events, realm time, seven-day schedules, Trick or Treat counts, Witch's Cipher controls, `POST /event-rejoin` (event-selection-control.tsx, cipher-controls.tsx, event-limits-form.tsx) | b535be3, 371b0b9, 3b24b60: the four events, limits, Cipher, realm time and schedules | partly: no `POST /event-rejoin` |
| B10 | Add-ons: manager (`GET/POST /addons`), cards and sections (`/addon-read`, `/addon-command`, `/addon-farming`), shipped add-ons Achievement Hunt, cosmetics, market filters, NPC orders, tank hold (runtime/hooks/dashboard/slots.tsx, settings-page.tsx) | Achievement Hunt on the old route only; the fork console's market filters, Ponty/Ron orders and party roles as core controls | missing |
| B11 | Auto NPC sale keep quantity: `{item, keep, action: 'set'}`; the merchant removes a character's rule with `{character: owner}` (connected-inventory.tsx, party-management-panels.tsx) | 0c6365c sends the same body, but `ItemConfirmations` shows Keep only when `forkCommerce` is true, and it is false on the release | partly: Keep hidden |
| B12 | Elixir restock policy and gathering tool crafting toggle (restock-controls.tsx, gathering-tool-settings.tsx) | d14ffbb, 49d286b, 9a2eb99 send the release's `elixir` field and `craft <mode> tools` flags | done |
| B13 | Batch select in inventory, bank and exchange rewards; manual compound from bank or BankBoi stock (item-selection.tsx, exchange-item-selection.tsx, bank-production-actions.tsx) | 9ec573d: exchange and compound one bank item from its options | partly: no batch select |
| B14 | Donation XP and level preview (donation-preview.tsx, `donationLevelXp`) | b41dff4 reads `donationLevelXp` | done |
| B15 | Reopen a done Cave merchant room's shop (dungeon-panel.tsx) | 0c589eb offers it for any done merchant room | partly: the release offers it only for rooms in the view's `reopenable` list |
| B16 | Character card: status icon row, CC meter, hand control/Manual (`handControlByCharacter`), activity line, account gold, stand slot count (status-icon-row.tsx, hand-control.tsx, call-meter.ts, party-gold.tsx) | icon row (51b81e6), CC meter and account gold (a4fa7af); the activity line reads the wrong wire (A24) | partly: hand control, stand slots and A24 left |
| B17 | Market watch stream (`GET /market-watch`), listing age (market-age.ts); merchant ready list (`merchantReady`) | the fork console's Ponty watch list (c9863e6) only | missing |
| B18 | App keys screen (`/apps`, `/apps/:name/revoke`, `/apps/:name/own-commands`; app-keys-settings.tsx) | none | missing |
| B19 | Settings change history (`settingsChanges` in logs) | none | missing |
| B20 | Game-style item, monster, skill, character and comparison cards (item-card.tsx, monster-card.tsx, skill-card.tsx, card-name-strip.tsx) | `ItemCard`, `MonsterCards`, `SkillCards` and the catalog comparison | partly: no card name strip; not compared side by side with the release |
| B21 | Native map sprites, projectiles and map dock (draw-map-sprites.ts, draw-map-projectile.ts, map-dock-state.ts) | 38a85b1 draws sprites and projectiles | partly: no map dock |

### Split of what is left

Two sets with no file in common:

- **Set 1 - settings and wire**: B1, B2, B3, B5, B10, B18, B19. Files: `src/api/partyApi.ts`,
  `src/models/state.ts`, `src/data/queryActions.ts`, `e2e/fixtures/mockPartyServer.ts`,
  `src/screens/account/**`, `src/screens/PartyRolesSettings.tsx`, the party header
  (`src/components/ConsoleControls.tsx` and a new diagnostics button), and new add-on and
  settings menu files.
- **Set 2 - cards, items, map, market, events**: B9, B11, B13, B15, B16 (with A24), B17,
  B20, B21. Files: `src/screens/character-detail/**`, `src/screens/dungeon/**`,
  `src/screens/itempanel/**`, `src/components/map/**`, `src/components/ItemConfirmations.tsx`,
  the card components, `src/lib/characterActivity.ts` and the event components. Set 2 puts
  its routes (`/event-rejoin`, `/market-watch`) and fields (`activity`,
  `handControlByCharacter`, `standSlots`, `merchantReady`) in its own new files, a client
  module under `src/api/` and a mock route file under `e2e/fixtures/`, so it never edits
  Set 1's wire files.

## State

- Half A sits on `fork` as branch `pwa-owners`. The 5 BREAK rows (A1, A6, A7, A10, A16) and the
  parity rows A2, A3, A4, A5, A8, A9, A15 and A23 are ported; A12 drops `timedOut`
  from the type and the roster fixture. Two places overlapped with `fork` and keep both
  sides: the mock's config fields and routes, and the Hunt settings imports.
- Tests: `src/api/ownersWire.test.ts` (A1, A3, A4, A8, A23) and `src/lib/ownersRelease.test.ts`
  (A2, A5, A6, A10, A15, A16); e2e `hunt-settings.spec.ts` (A7, two rows),
  `collection-thresholds.spec.ts` (A9), `data-layer.spec.ts` (A4), `error-paths.spec.ts` (A10).
  Each is red on `fork` 5f7311f with only the tests and the mock carried over, and green here.
  `ownersRelease.test.ts` is red there because the modules it imports do not exist yet.
  `ports.test.ts` lost its rows for the client rule computation that A15 removes.
- The mock (`e2e/fixtures/mockPartyServer.ts`) answers the release's shapes: no `serverNow`,
  `characterDetails.online`, core `farmingLive`, root `relocateIfCompeting`, the settings route,
  ETag revisions for bank, logs and market, heartbeats with `at` and `heartbeatMs`, no `sampledAt`.
  It keeps `fork`'s routes for the fork console's controls.
- Half B: not started. B1 is first: it lets the console drop interface v1 (A5).

## Set 2 state

Set 2 sits on branch `pwa-owners-b`. Its reads and routes live in `src/api/ownersCards.ts`, and
its mock in `e2e/fixtures/ownersSet2Mock.ts`, a subclass of the shared mock that adds the
release's fields to `stateSection` and registers its routes after the base ones. Unit rows sit in
`src/api/ownersCards.test.ts`, e2e rows in `e2e/owners-cards.spec.ts`; each e2e row fails with
the item's `src` changes reverted.

- **B16 with A24 - done.** The activity line reads `characterDetails[name].activity` (text, stuck
  notice, add-on lines) on the list and the vitals header; a `null` line shows nothing, and only a
  console without the field (the fork console) keeps the phone's `characterActivity` label. The
  Hunt status shows the line while its task is `hunt`. Formation gets the Pause/Manual chip with
  the three Manual switches, sending `POST /formation {character, handControl}` with the changed
  keys. The stand count and the full check read core `standSlots`. Not ported: the top bar's
  "N characters on Manual" count, which sits in the party header (set 1).
- **B9 - done.** The event rows follow the release's `eventListRows`: a member's own skip shows,
  and its source's unless the source left by a manual move. An occurrence the member left by a
  manual move offers Rejoin, which posts `POST /event-rejoin {character, event}`
  (`e2e/owners-events.spec.ts`). Trick or Treat shows the knocks left from the schedule's
  `trickOrTreat.characters[name]`, the next daily reset and the daily note, which the fork had
  not ported either.
