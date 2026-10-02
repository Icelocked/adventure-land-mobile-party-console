# 05 — Adversarial challenge: merchant / commerce / stand / market / WTB / restock / gold

Reviewer 05. D = `scratchpad/console-v1.2.0/`, P = `F:\CodingProjects\adventureland-party-mobile\web\src\`. Both repos were read only.

## 0. Critical claim #1 (BR-1): CONFIRMED, and it is a regression from yesterday

### Mechanism (verified line by line)
- In the server, `section=core` with `dashboard=1` runs `omitConfigFields(...)` (D `runtime/coordinator/telemetry/public-state.ts:255-276`). That deletes every key in `configFields` (`:65-82`) and in `configExtraKeys` (`:84-86`), via `:101-105`.
- Those keys are served only by `section=config` → `configPayload` (`:87-99`, `:254`).
- **Without** `dashboard=1`, `section=core` returns `corePayload(fullPayload(...))` (`:256-257`). `corePayload` deletes only `characters, combatLogs, merchantActivity, bank, bankVaults` (`:201-205`), so the config fields **were** delivered by the old request.
- The PWA polls exactly six requests every 6s (P `data/PartyDataProvider.tsx:134-146`): `state?section=core&dashboard=1`, `state?section=bank`, `state?section=market`, `state?catalog=0&dashboard=1&section=logs`, `mail`, `escape`. It never sends `section=config`; grepping `section=` across P finds only these and `section=catalog` (`:109`).
- **Root cause:** PWA commit `1638165` (2026-10-01 09:09, "Show this character's own Hunt quest…") changed `api.get('state?section=core')` to `api.get('state?section=core&dashboard=1')` to get `characterDetails`. That one edit silently dropped all config state.
- **No other channel delivers these keys:**
  - The SSE live stream carries only per-character `vitals/items/slots` records (P `api/liveConnection.ts:74-98`, `api/liveProtocol.ts:26,54-58`; D `dashboard/features/party/live-protocol.ts:5-7`).
  - `section=catalog` returns only `catalogs()` (D `public-state.ts:21-36,253`).
  - `section=bank` and `section=market` return none of them (`:241-252`).
  - **One partial exception:** the one-time startup roster fetch `api.get('state')` (P `PartyDataProvider.tsx:222`) hits the no-section branch (`fullPayload`, D `public-state.ts:281`), which **does** contain every config key. The PWA parses only `.roster` from it and discards the rest (P `:225-229`). The data reaches the device once and is thrown away.
- The dashboard polls `config` as its own domain every 15s (D `dashboard/features/party/query-cache.tsx:126,172`, URL `/state?catalog=0&dashboard=1&section=${domain}`).
- The e2e mock hides the bug: it ignores `section` except for `logs` and returns the full state for everything else (P `../e2e/fixtures/mockPartyServer.ts:660-664`).

### Exact config-only key list (absent from what the PWA polls) and every PWA reader
All of these fall back to `emptyPartyStateDynamic()` defaults (P `models/state.ts:741-790`), or to whatever the cache held before.

| Key | PWA readers (P) | Visible effect today |
|---|---|---|
| `standListings` | `screens/account/StandScreen.tsx:19-24`; `screens/account/BankScreen.tsx:85,263,275,297` | Stand shows 0/16, "Nothing listed"; bank tiles lack stand badges |
| `standBids` | `screens/account/WtbScreen.tsx:25,68`; `screens/account/MarketScreen.tsx:22` | "No standing buy orders"; WtbForm `existing` is always undefined, so it never prefills |
| `standSearch` | `MarketScreen.tsx:21,36-50` | Stand-search results never render |
| `merchantRoutinePriorities` | `screens/account/RoutinesScreen.tsx:21,31-32` | All rows show 50; Save overwrites with 50 (see B below) |
| `merchantAutomations` | `RoutinesScreen.tsx:22,33` | All checkboxes checked; Save re-enables everything |
| `merchantForceStand` | `screens/character-detail/CharacterDetailScreen.tsx:149` → `MerchantControlsSection.tsx:63-65` | Always "Off"; **cannot be turned off** (see upgrades) |
| `threshold`, `itemCollectionThreshold` | `CharacterDetailScreen.tsx:151-152` → `MerchantControlsSection.tsx:168-169` | Inputs show 0 |
| `restockPolicies` | `CharacterDetailScreen.tsx:198` → `RestockSection.tsx` | Shows 0/0/0/0; **data loss on save** (see upgrades) |
| `goldTargets` | `CharacterDetailScreen.tsx:199` | Shows 0 |
| `merchantDeliveries` | `CharacterDetailScreen.tsx:192`; `screens/itempanel/ItemActionPanel.tsx:200` | No delivery badges or targets |
| `autoStandMarks`, `autoNpcSales`, `autoItemMarks`, `autoCompounds`, `autoDeconstruction` | `sections/AutoMarksSection.tsx:63,37,52/91,82,42` | Auto-rule lists are empty |
| `autoUpgradeMarks` (extra key, `public-state.ts:85`) | `AutoMarksSection.tsx:70` | Empty |
| `autoExchanges` | `ItemActionPanel.tsx:192` | "Auto exchange · already marked" never shows; re-marking is allowed |
| `marked`, `merchantMarked`, `statScrolls`, `upgrades`, `compounds` | `CharacterDetailScreen.tsx:161-171,180`; `BankScreen.tsx:240,293`; `ItemActionPanel.tsx:283`; `OfferingsScreen.tsx:15,46`; `LuckySlotSection.tsx:9`; `AutoMarksSection.tsx:48,107-108`; `lib/itemFormulas.ts:75,88-89` | No mark badges on inventory or equipment |
| `npcSaleMarks`, `deconstructionMarks`, `deconstructionCatalog` | `lib/markBadge.ts:45-54`; `InventorySection.tsx:17-41`; `BankScreen.tsx:86-88,264-302`; `CharacterDetailScreen.tsx:182,185` | No NPC-sale or deconstruct badges |
| `leader`, `followers` | `CharacterDetailScreen.tsx:112,121`; `LeaderFollowerSection.tsx:15-16`; `lib/partyRouting.ts:4-10`; `models/state.ts:724` (`resolveFarmingContext`) | Nobody is leader or following; routing gate is wrong |
| `farmingPolicy`, `farmingProfiles` | `models/state.ts:727-735`; debug banner `CharacterDetailScreen.tsx:67-79` | Mode reads 'auto'; the banner prints `leader=undefined` (this bug) |
| `monsterFocus`, `monsterFocusByCharacter`, `monsterSearchRadiusByCharacter` | `CharacterDetailScreen.tsx:123-133`; `FarmingSection.tsx:18-21,54` | Focus empty; radius 400 |
| `huntBlacklist`, `huntSettings` | `models/state.ts:735`; `FarmingSection.tsx:40-289`; `HuntSettingsScreen.tsx:22,45` | Blacklist empty; settings at defaults |
| `phoenixRouteOrder` | `CharacterDetailScreen.tsx:136`; `FarmingSection.tsx:58-214`; `components/FarmingAreaPicker.tsx:49-54` | Default order |
| `bankboiPrefix`, `anniversaryAutoChat` | `SettingsScreen.tsx:43,82` | Prefix shows ''; the checkbox shows the default |
| `roster`, `classChoices`, `eventStrategy`, `giveawayRealms` (extra keys) | `roster` comes from the startup `state` fetch (OK); the others are unread | — |
| Config-only keys **not read by the PWA at all** | `characterAppearances, merchantRules, passiveRareHunts, passiveHunting, buyUpgradeBatchSize, merchantBlacklist, autoStandBuys, autoBlacklistMerchants, eventsByCharacter, eventSelectionsByCharacter, monsterPrioritiesByCharacter, scatterMonsterTypes, merchantCharacter, merchantStandLocation, merchantWeapon` (grep: zero screen hits; `merchantCharacter` appears only as a parameter name in `api/partyApi.ts`) | These are the MISSING features' data |

**Verdict:** this is the single highest-leverage fix in the review. Add `api.get('state?catalog=0&dashboard=1&section=config')` and merge it into `QK.dynamicState`. That restores every key above for every domain, and it unblocks bugs B (Routines), C5, G1, I1, L1-L3 and K16.

**Caveat (dependency):** `config` includes `farmingProfiles`, which the PWA's own comment blames for 1-2 MB responses timing out (P `api/partyApi.ts:26-41`). Poll `config` as a **separate request on its own slower cadence** (the dashboard uses 15s, D `query-cache.tsx:126`), outside the `Promise.all` that gates the 6s core merge. It also needs its own generation guard, so a slow config response cannot block or clobber core. Make the e2e mock honour `section` in the same change.

## 1. Refuted claims
| Claim | Finding |
|---|---|
| BR-3 / K12 citation "`MarketScreen.tsx:307`" | Wrong line. The file is 140 lines long; the branch is at P `screens/account/MarketScreen.tsx:94-95`. The substance is confirmed (see section 3). |
| A6 "Retry is offered before retries are exhausted" as **BROKEN** | Downgraded to PARTIAL/cosmetic (section 2). |

No MISSING row was refuted. I re-grepped P for `native-stand`, `merchant/blacklist`, `aldata-sale`, `rule-conflict`, `stand-location`, `buyUpgradeBatchSize`, `mluck`, `gatheringCooldowns`, `gatheringNoTool`, `nativeStand`, `buyOrders`, `trades`, `standPriceHistory`, `suggestedPrices` and `type: 'bank'`: each has zero functional hits. The server registers all of these routes (D `runtime/coordinator/http/registration.ts:167-261`, `runtime/coordinator/application.ts:2189,2191`, `runtime/coordinator/inventory/shared-rules.ts:96`).

## 2. Downgraded / upgraded claims
| Row | Change | Reason (file:line) |
|---|---|---|
| **C5 Force stand** | PARTIAL → **BROKEN (critical while BR-1 stands)** | The display always reads Off, so every tap sends `enabled: !false = true` (P `MerchantControlsSection.tsx:63`, `api/partyApi.ts:458`). **The PWA cannot turn Force stand off**, and Force stand pauses all merchant work. |
| **G1 Restock** | PARTIAL → **BROKEN (data loss)** | All four fields show 0 (P `CharacterDetailScreen.tsx:198`). Editing one field and pressing Save sends `Number(x)\|\|0` for all four (P `RestockSection.tsx:68`), so the HP/MP thresholds the user did not touch are zeroed on the server. |
| **I6 Stand price edit** | PARTIAL → **BROKEN for bank-sourced listings** | The PWA sends `{id, item, slot, price, quantity}` with no `bankPack` (P `StandScreen.tsx:77`, `partyApi.ts:254-255`). The server finds the entry by id and then rebuilds it with `make({slot, item, bankPack: pack\|\|undefined}, price, id)` (D `runtime/coordinator/merchant/stand-marks.ts:152-156,53-64`). The bank listing is turned into a **merchant-inventory listing at `slot = bankSlot`**, losing `bankPack`/`bankSlot` and its withdrawal linkage. |
| **D2/BR-2 enabled map** | Wider than reported | With BR-1, `enabledDraft = {}`, so Save sends `true` for every `AUTOMATIC_ROUTINE_KEYS` entry (P `RoutinesScreen.tsx:113`). That **re-enables every automation the user disabled** (`auto upgrade`, `join giveaway`, `restock`, …), not only fishing and mining. The server applies any boolean whose key is in `DEFAULT_MERCHANT_AUTOMATIONS` (D `runtime/coordinator/http/routine-priorities.ts:37-43`, `runtime/coordinator/merchant/initial-settings.ts:76-91`). The fishing/mining phantom enable **remains after BR-1 is fixed**, because `merchantAutomations` never has those keys (`initial-settings.ts:76-91`). |
| **D3 wipe-to-50** | Confirmed, with detail | Server defaults are not 50: for example `merchant luck` is 100, `merchant idle` 0, `stand maintenance` 40 and fishing/mining 20 (D `initial-settings.ts:30-74`). The server accepts every PWA key except `exchange` (`routine-priorities.ts:29`). The dashboard sends the server's own map back (`draft = priorities`, D `routine-priorities-dialog.tsx:49-52,228-233`) and never invents 50s. Separately, the PWA seed effect can overwrite edits the user makes before data arrives (P `RoutinesScreen.tsx:30-36`). |
| A4 target suffix | PRESENT → PARTIAL | The auditor notes it is not suppressed for giveaway jobs (P `MerchantQueueSection.tsx:106` vs D `merchant-card-controls.tsx:134`). |
| A6 Retry condition | BROKEN → PARTIAL | Retry is shown for `realmBlockedReason` instead of `realmRetryExhausted` (P `MerchantQueueSection.tsx:110`, D `merchant-card-controls.tsx:137`). An early retry only clears the backoff; it is not harmful. |
| A7 Cancel | Confirmed, severity high | Server cancel sets `merchantAutomations[reason]=false` for automatic jobs. For `auto upgrade` and `auto compound` it also wipes the auto marks; for exchange it deletes `autoExchanges` (D `runtime/coordinator/http/merchant-control.ts:53-71`). The PWA does all of this with one tap and no confirmation (P `MerchantQueueSection.tsx:123-130`). |
| L1-L3 WTB | Worse under BR-1 | `existing` is always undefined, so the list is empty and rows cannot be tapped. "New WTB" for an item that already has a bid silently becomes a full overwrite of it (D `runtime/coordinator/http/merchant-bid.ts:129-133`). |
| K8/K12 error reporting | Clarification | Failures are not silent: `post()` raises the global action toast with the server `error` (P `api/partyApi.ts:172-183`). MarketRow still ignores the result (P `MarketScreen.tsx:92-96`). |

## 3. Confirmed critical claims (one line each)
- **(a) BR-1:** confirmed. Exact key list and readers are in section 0.
- **(b) Routines save:** confirmed.
  - Priorities: P `RoutinesScreen.tsx:112` sends `draft[key] ?? 50` for all 27 PWA keys.
  - Enabled: `:113` sends `fishing:true, mining:true` plus `true` for every automatic key.
  - The server calls `setGathering`, which pushes both modes and issues a `merchant-gather` command (D `runtime/coordinator/http/merchant-configuration.ts:66-83,101`; `routine-priorities.ts:51-54`).
  - The `exchange` key is ignored (`routine-priorities.ts:29`); the real keys are `manual exchange` and `automatic exchange` (D `routine-labels.tsx:25-26`, `automatic-routine-keys.tsx:10`).
- **(c) Ponty → ALData:** confirmed.
  - Ponty listings are `{key, rid, item, serverRegion, serverIdentifier, quantity, unitPrice, price}` from D `characters/shared.js:1134-1136`, enriched with `groupKey/seenAt/key` in D `runtime/coordinator/status/ponty.ts:38-45`. There is no `source`.
  - So P `MarketScreen.tsx:94-95` always calls `buyAlData`.
  - The server looks the key up in `state.aldata.marketListings` and returns 409 "ALData listing is no longer in the market snapshot" (D `runtime/coordinator/http/manual-market-orders.ts:74-85`).
- **(d) Stand Remove:** confirmed.
  - P `StandScreen.tsx:60` sends `{id: undefined, bankPack: undefined, item, slot, price, quantity: 1, remove: true}`.
  - Without an id, the server's `find()` matches only `state !== "live" && !tradeSlot && slot === slot && !bankPack` with an identical item JSON (D `stand-marks.ts:113-127`).
  - `remove(-1, …)` is a no-op (`:128-129`), and the route still returns ok (D `runtime/coordinator/http/stand-marks.ts:62-64`).
  - Live and bank-sourced listings therefore cannot be removed, and the toast says "sent".
- **(e) WTB priorityOverride:** confirmed. P `api/partyApi.ts:646` omits the key when it is null; the server's `priority(undefined, previous)` returns `previous` (D `merchant-bid.ts:37-40,68`). Clearing an override is impossible.
- **(f) post() drops occupants:** confirmed. `parseCommandResult` keeps only `{ok, error}` (P `api/partyApi.ts:106-113`), and `post()` returns `fail(message)` on non-2xx (`:172-177`). The server's 409 `{error, occupants}` (D `merchant-bid.ts:108-115,131-132`) loses `occupants`, and WtbForm has no retry path (P `WtbScreen.tsx:183-195`). The same loss hits `missing[]` from `/merchant/order` (H9) and `deliveriesRemoved/bankMarksRemoved` (B2).
- BR-4 (Stand remove), BR-5 (WTB null), K16 (stand search depends on config `standSearch`; the dashboard dialog is dead code, with no importer of `player-stand-market-dialog.tsx` in D): all confirmed.

## 4. Missed gaps
| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| X1 | Config section poll | D `query-cache.tsx:126,172` | `state?section=config` | BROKEN | P `PartyDataProvider.tsx:134-146` (absent) | A regression from P commit `1638165`. |
| X2 | Startup full-state fetch discards config | — | `GET state` | BROKEN (waste) | P `PartyDataProvider.tsx:222-229` | The data is already on the device. A stopgap merge of the full payload is possible, but a proper config poll is preferred. |
| X3 | Restock overwrite of untouched fields | D `restock-controls.tsx:7-10` defaults 5/20/0/0 | `POST /restock` | BROKEN | P `RestockSection.tsx:68`, `CharacterDetailScreen.tsx:198` | Data loss (see upgrades). |
| X4 | Force stand cannot be disabled | D `merchant-card-controls.tsx:240` | `/merchant/force-stand` | BROKEN | P `MerchantControlsSection.tsx:63` | Fixed by X1, but the toggle should also derive from the server response. |
| X5 | Bank-listing price edit mutates the listing source | D `use-party-console.tsx:698-700` (sends `...listing`) | `/merchant/stand` | BROKEN | P `StandScreen.tsx:77` | Pass `bankPack: listing.bankPack`. |
| X6 | Cleanup and clear-history result/error inline text | D `merchant-card-controls.tsx:163-186` | | PARTIAL | P `MerchantControlsSection.tsx:105-110` (shared `error` only, no success text) | Minor. |
| X7 | "Merchant logistics · N queued" count, and the section staying visible with "No queued work" | D `merchant-card-controls.tsx:110,114-116` | `merchantQueue` | PARTIAL | P `MerchantQueueSection.tsx:73,77` | Overlaps with A1. |
| X8 | Routines draft seeding race | D `routine-priorities-dialog.tsx:47-56` (seed on open) | | PARTIAL | P `RoutinesScreen.tsx:30-36` | Late-arriving data overwrites the user's in-progress edits. |
| X9 | MarketRow ignores the purchase result (no inline error, no busy state, double tap possible) | D `stand-sheet.tsx:3361-3483` | | PARTIAL | P `MarketScreen.tsx:90-99` | |
| X10 | e2e mock ignores `section` | — | | Test gap | P `../e2e/fixtures/mockPartyServer.ts:660-664` | It will keep masking X1-style regressions. |

## 5. Dependencies and ordering
1. **Fix X1/BR-1 first** (one request plus a merge; poll on a slow cadence and keep it out of the core `Promise.all`; see the payload caveat in section 0). Until it lands:
   - Do not ship any other Routines, Restock or WTB edit fix, because they still read empty state.
   - Consider temporarily hiding Save on Routines and Restock, since both are destructive today.
2. **Then fix the routines payload** by porting D `routine-labels.tsx` and `automatic-routine-keys.tsx` verbatim, and seeding fishing/mining from `gatheringModes` as D `party-management-panels.tsx:617-621` does. This is independent of X1 for fishing/mining, but the wipe-to-50 needs X1.
3. **One-line fixes, independent of X1:**
   - BR-3: tag the origin when merging at P `MarketScreen.tsx:20`.
   - BR-4 and X5: pass `id` and `bankPack`.
   - BR-5: always send `priorityOverride`.
4. **Extend `post()` to return the parsed body** (keep `ok/error`, add a `data` field). This is a prerequisite for L6 (occupants replacement), H9 (`missing`) and B2 (counts).
5. **Update the e2e mock in the same change as X1**, so `section=config` is required for config keys to appear.
6. **Remove the temporary debug banner** (P `CharacterDetailScreen.tsx:67-79`, `PartyDataProvider.tsx:166-172`) once X1 lands. Its `leader=undefined` output is fully explained by BR-1.
