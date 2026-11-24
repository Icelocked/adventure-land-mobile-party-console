# Console v1.5.0 port map

This branch (`pwa-dev-1.5`, from `origin/dev` 55c516d, PWA 1.1.1) ports the release PWA
from Ryan's console v1.4.0 to v1.5.0. Ryan's v1.5.0 `dashboard/` is the spec: request
bodies and semantics match it, the PWA keeps its own layout and framework.

Sources: `git diff v1.4.0 v1.5.0 -- dashboard/ runtime/coordinator/ tools/hosting/` in
F:/CodingProjects/adventureland-party-console, and `CHANGELOG.md` § 1.5 changes since v1.4.0.

`pwa-oct-core`, `pwa-oct-features` and `pwa-oct-metrics` ported many of these features
against the user's console fork. Those commits are the starting point for rows marked
"oct <sha>"; each one is checked against v1.5.0 before it lands here, and fork-only
controls (`consoleFeatures` gates, Ponty/Ron orders 39be58d) stay out.

Status key: **BREAK** = the PWA does something wrong against v1.5.0; **parity** = works,
but the dashboard now does it differently; **feature** = new in v1.5.0, missing here;
**ok** = no PWA change; **done** = ported on this branch (commit named).

## W. Wire changes

| # | Change (v1.5.0 source) | PWA 1.1.1 | Status |
|---|---|---|---|
| W1 | The bank section compacts each pack entry's `meta` to `metadataFields` (telemetry/item-meta-projection.ts `compactBank`); per-type meta (`world`, `usage`, `bonuses`) now lives only in `merchantCatalog.allItems`. The dashboard joins it back (item-catalog-meta.ts `bankWithCatalogMeta`, `withCatalogMeta`) | bank tiles read `entry.meta.world.suggestedPrices` for the value line, and the bank item panel reads `meta` from the entry | BREAK |
| W2 | Inventory section and stream entries join catalog meta, add `title`, and send `meta: null` until the catalog arrives (public-state-characters.ts `compactEntry`) | `meta` optional; slots fall back to the catalog only when `meta` is absent (EquipmentSection `metaFor`) | BREAK (same fix as W1) |
| W3 | `POST /restock` stores the posted policy whole; `elixir` survives only when sent (http/restock.ts). The dashboard posts `{...policy, character}` (use-party-console.tsx `saveRestock`) | posts `{character, hp, mp}`, so a PWA save deletes the elixir policy | BREAK |
| W4 | `POST /formation {limits}` stores `structuredClone(patch.limits)`, which carries `monsters` and `cipher` (http/formation.ts, lib/event-policy.ts `validEventLimits`) | posts `{deathLimit, timeLimitMinutes}`, so a PWA limits save deletes the Graveyard monsters and the Cipher settings | BREAK |
| W5 | `POST /merchant/auto-npc-sale {action:'set'}` without `keep` stores `keep: 0` on a merchant-wide rule (http/automatic-sales.ts `npcRuleScope`); the dashboard prefills the saved keep (use-party-console.tsx `autoNpcSaleKeep`) | sends no `keep`, so re-saving a rule from the PWA drops its reserve | BREAK |
| W6 | `supportedEvents` adds horseman, graveyard, trickortreat, witchcipher; `POST /formation {priorities}` appends missing October ids at the end (formation.ts `completeOrder`) | `eventPolicy.ts` lists the 10 v1.4 events, so a PWA reorder moves the October events to the end | BREAK |
| W7 | Merchant inherits the leader's Witch's Cipher selection and limits (event-policy.ts `selectedEvents`, `eventPolicy`, `eventLimits`) | not mirrored | parity (with F2) |
| W8 | `bank`, `logs`, `market` sections answer 304 for `&revision=<ETag>` (telemetry/section-revision.ts, query-cache.tsx `readRevision`) | full body each poll; no revision sent, so the server answers 200 | parity |
| W9 | An unknown `section=` answers 400 (public-state.ts) | asks only core, config, fast, inventory, bank, logs, market, catalog | ok |
| W10 | `GET /party-api/ready` for the host health check | unused | ok |
| W11 | Core adds `accountGold {carried, total}` (telemetry/account-gold.ts) | unread | feature (F9) |
| W12 | Config adds `characterSnapshots`; `GET /characters/:name/inspection` (characters/inspection.ts, load-character-inspection.ts) | unread | feature (F5) |
| W13 | Stream vitals add `cc`; fast/diagnostics add `donationLevelXp` | unread | feature (F9, F14) |
| W14 | `POST /mail/settings`, `/mail/seen`, `/mail/outbox-delete`; mail snapshot adds `settings`, `newCount`, `sent` (commerce/mailbox.ts) | none | feature (F4) |
| W15 | `POST /merchant/native-stand {action:'resolve-purchase', id, bought}`; config `nativeStand.purchases` | none | feature (F18) |
| W16 | `POST /setup/pair {code}` beside `{token}`; `/setup/invite` adds `code`, `expiresAt`, `expiresIn` (tools/hosting/setup-routes.ts, access.ts) | PairingGate sends `{token}` only | feature (F13) |
| W17 | `merchantAutomations['craft fishing tools' / 'craft mining tools']` through `POST /merchant/routine-priorities {priorities:{}, enabled}` (gathering-tool-settings.tsx) | none | feature (F11) |
| W18 | Metrics routes `/metrics?from=`, `/metrics?since`, `/metrics/bars?`, `/metrics/kills?`, `/metrics/account-gold?reset`, `/metrics/reset` (metrics/service.ts) | none | feature (F3) |
| W19 | Event schedules gain `occurrences`, `realmOffsetHours`, `cipher`, `trickOrTreat` (events/schedule-reports.ts) | reads `next`, `expires`, `live` | feature (F2) |
| W20 | Stand-merge, convoy, return-progress, hunt-control, bankboi-storage, merchant-exchange changes are character-client or coordinator internal | not used | ok |

## F. Dashboard features (CHANGELOG § New features)

| # | Feature (v1.5.0 source) | PWA 1.1.1 | Source to port | Status |
|---|---|---|---|---|
| F1 | October events in the event list and limits (event-selection-control.tsx, event-limits-dialog.tsx) | 10 events | oct b535be3, 590042e | feature |
| F2 | Seven-day schedules, realm time, Trick or Treat counts, Witch's Cipher controls (event-selection-control.tsx, cipher-controls.tsx) | next/live only | oct 3b24b60, 371b0b9, ff78d7e, 7735951 | feature |
| F3 | Metrics view: gold, kills, loot, ping, drop estimator, reset (metrics-*.tsx, party-view-switch.tsx) | none | oct-metrics b863f3b | feature |
| F4 | Mailbox automation, new-mail count, sent history (mailbox-controls.tsx, mail-count.tsx) | none | oct 62a63db | feature |
| F5 | Offline character inspection (offline-character-view.tsx) | none | oct 7193d0d | feature |
| F6 | Batch select for inventory, bank and exchange rewards (item-selection.tsx, exchange-item-selection.tsx) | one item at a time | pwa-owners ac4b23d, 385d8d0, 3ec505a (guide) | feature |
| F7 | Manual compound from bank or BankBoi stock, exchange from the bank (bank-production-actions.tsx) | none | oct 9ec573d | feature |
| F8 | Game-style item, character, monster, skill and comparison cards, stat colors, item titles | PWA 1.1.0/1.1.1 card commits (the user's PRs that v1.5.0 merged) | - | done (1.1.x) |
| F9 | Character card: CC meter, account gold (connected-character-card.tsx, party-gold.tsx) | none | oct a4fa7af | feature |
| F10 | Elixir restock and auto consume (restock-controls.tsx), elixir time left | none | oct 49d286b, d14ffbb, 461ca29 | feature |
| F11 | Replacement fishing pole and pickaxe crafting (gathering-tool-settings.tsx) | none | oct 9a2eb99 | feature |
| F12 | Keep quantity on automatic NPC sales (use-party-console.tsx, party-management-panels.tsx) | none | oct 0c6365c, 7372b0f | feature (fixes W5) |
| F13 | Pair with a short access code (setup-client.ts) | link or QR only | new | feature |
| F14 | Donation XP and level preview (donation-preview.tsx) | none | oct b41dff4 | feature |
| F15 | Reopen a done Cave merchant room's shop (dungeon-panel.tsx) | none | oct 0c589eb | feature |
| F16 | Gold-find bonus in portrait stats, I for item JSON, CX Jar contents (character-stats-dialog.tsx, item-details.tsx) | none | new | feature |
| F17 | Home-server rewards apart, ratio odds, event-only monster sources (drop-rate.ts, bestiary-drops.tsx) | percent odds | oct 149fdf6, fe06bcf | feature |
| F18 | Resolve an unconfirmed WTB purchase (wtb-unconfirmed-purchase.tsx) | none | new | feature |
| F19 | Native map sprites, cosmetics, weapons, projectiles (draw-map-sprites.ts, draw-map-projectile.ts) | class colour dots | oct 38a85b1 | feature |
| F20 | Headless Cave floor stays drawn (cave-map.tsx) | floor drops after the stream's first frame | oct eb6bc9e | BREAK |
| F21 | Skills screen titles the conditions group (skills-dialog.tsx) | - | oct 38a647f | feature |

## State

Totals: 7 breaks (W1-W6, F20), 19 features (F1-F7, F9-F19, F21), 2 parity rows (W7, W8).

Breaks, all done:

- W1, W2: 9b6e600. `lib/itemCatalogMeta.ts` ports item-catalog-meta.ts; `useCharacters` and
  `useDynamicState` join the catalog onto inventory, slot, bank and BankBoi entries. The mock
  serves the compacted meta (`compactEntry`). Tests: `itemCatalogMeta.test.ts`,
  `item-meta-join.spec.ts`; the character card e2e also failed on the compacted mock.
- W3: 8542888 (oct 49d286b). W6 with W7: cb84fe6 (oct b535be3 plus the merchant's Cipher).
  W4: aac3524 (oct 590042e). F20: 1b3cda2 (oct eb6bc9e).
- W5 with F12: 1df39c5. The confirmation shows "Number to keep reserved" for a merchant-wide
  rule and posts it as typed; the Auto NPC sales list edits "Keep N"; bank items and shared
  rules save the merchant-wide rule; the commerce screen's batch save sends the saved keep.

Features done (oct commits, checked against v1.5.0's dashboard source):

- F9: adcce16 (a4fa7af). F10 countdown: 3c3c241 (461ca29). F21: 12f9114 (38a647f).
- F2 schedules and realm time: de57c34 (3b24b60, 7735951). F17 event-only: 6249a66 (fe06bcf).
- F14: fc6ca46 (b41dff4). F15: 969037a (0c589eb). F11: 48904f2 (9a2eb99). F4: 0f0b4c2
  (62a63db). F10 restock UI: b2ad590 (d14ffbb). F7: 2b7fd34 (9ec573d). F17 odds and home
  rewards: bb46da9 (149fdf6). F5: a4af5ab (7193d0d, cdc7479).
- F1, F2 Cipher and Graveyard settings: b67b693 (371b0b9, ff78d7e), without the fork's gear
  sets, tank, Franky, boss chase and hop blacklist calls. The oct port read console
  2db4d763; v1.5.0 differs there only by the Franky button (removed) and the Trick or Treat
  knocks, which 6483d05 adds (knocks left, next daily reset, daily note).
- F19: d32a3e8 (38a85b1). F3: 688f997 (b863f3b); its spec sets `server.accountGold`, since
  the mock now serves core `accountGold`.
- F18: 5f78b87, new: `WtbUnconfirmedPurchase` on each WTB row.
- F13: 6d1d2a0, new: an Access code field on the pairing screen posts `{code}`.

Done this session:

- F6: 5226896 (pwa-owners ac4b23d, 385d8d0, 3ec505a, checked against v1.5.0). A Select button
  turns on select mode for the inventory, the bank and the exchange rewards; the rows and bodies
  follow item-selection.tsx, connected-inventory.tsx and party-inventory-panels.tsx
  `onBatchCommand`. Reward tiles register under `id@level:detail` as exchange-item-selection.tsx
  does, and compound rows stop at +7.
- F16: 3ef48c2. The Gold line after Luck, the CX Jar's "Filled with" line, and "Item JSON" in the
  inventory, equipment, bank and exchange reward option lists.
- W8: 8d58d3f. Bank, logs and market polls send `&revision=` and keep the cached data on 304.
- bank.spec "Bank parity": f0c984a. The suite served dist/, which `npm run build` rewrites, and
  reused any server on 4173, where the pwa-owners worktrees serve their builds. It now builds
  into dist-e2e, never reuses a server, and takes its port from E2E_PORT.

Every row of this map is done.

Last full run (after f0c984a): `tsc -b`, the build and unit tests (148) pass; oxlint exits 0 with
72 warnings, none in files this session added; e2e passes 339 of 339 in two full runs.
