# 05 — Merchant routines & queue, commerce, stand, marketplace, WTB, restock, trips, gold

Auditor 05. Dashboard = `console-v1.2.0` (paths below are relative to `scratchpad/console-v1.2.0/`). PWA = `F:\CodingProjects\adventureland-party-mobile\web\src\` (paths below relative to `web/src/` unless prefixed `web/`).

## Summary

| Classification | Count |
|---|---|
| PRESENT | 21 |
| PARTIAL | 38 |
| BROKEN | 9 (plus cross-cutting BR-1, which degrades most PRESENT rows to "empty data") |
| MISSING | 43 |
| UNREACHABLE | 0 (but `/wtb` is reachable only via Market, not the account menu) |
| N/A (dashboard component orphaned) | 1 |

### Top 5 most impactful gaps

1. **BROKEN (cross-cutting, critical): the PWA never receives any "config" state field.** v1.2.0 strips every config field from `state?section=core&dashboard=1` and serves them only under `section=config` (`runtime/coordinator/telemetry/public-state.ts:65-82` list, `:101-105` `omitConfigFields`, `:256-258` core+dashboard=1 → `omitConfigFields`). The PWA polls `state?section=core&dashboard=1`, `bank`, `market`, `logs` and **never `section=config`** (`data/PartyDataProvider.tsx:140-143`). This domain loses `standListings`, `standBids`, `merchantRoutinePriorities`, `merchantAutomations`, `merchantBlacklist`, `autoStandBuys`, `autoBlacklistMerchants`, `standSearch`, `autoStandMarks`, `autoNpcSales`, `threshold`, `itemCollectionThreshold`, `buyUpgradeBatchSize`, `restockPolicies`, `goldTargets`, `merchantForceStand`, `merchantStandLocation`, `merchantRules`, `merchantDeliveries`, `giveawayRealms`. They stay at `emptyPartyStateDynamic()` defaults (`models/state.ts:741-790`). So Stand shows 0/16, WTB shows "No standing buy orders", Force stand always reads Off, thresholds read 0, restock and gold target read 0. The e2e mock hides this because it returns the full state for every section (`web/e2e/fixtures/mockPartyServer.ts:660-664`). The temporary "farmingPolicy/leader never updates" debug banner (`screens/character-detail/CharacterDetailScreen.tsx:67-79`) fits the same cause, since `leader` and `farmingPolicy` are config fields too (`public-state.ts:76-79`).
2. **BROKEN: saving Routines can wipe priorities and switch on mining and fishing.** (a) With the bug in #1, `merchantRoutinePriorities` is `{}`, so the seed guard never fires (`screens/account/RoutinesScreen.tsx:30-36`). The draft stays empty, every row shows 50, and Save posts 50 for every key (`:112`). (b) Mining and fishing have no entry in `merchantAutomations`; the dashboard injects them from `gatheringModes` (`dashboard/features/party/party-management-panels.tsx:617-621`). The PWA seeds from `merchantAutomations` only (`RoutinesScreen.tsx:22,33`), so both checkboxes show checked (`enabledDraft[key] !== false`, `:68`). Save then sends `fishing:true, mining:true` (`:113`), and the server calls `setGathering`, which turns both modes on (`runtime/coordinator/http/merchant-configuration.ts:66-82`). (c) The PWA uses a nonexistent `exchange` key instead of `manual exchange`/`automatic exchange` (`lib/routineLabels.ts:24,42`). The server ignores unknown keys (`runtime/coordinator/http/routine-priorities.ts:29,38-41`), so the PWA cannot disable Automatic exchange or reprioritize either exchange routine. It is also missing the `deliveries`, `withdrawals` and `upgrade preview` rows.
3. **BROKEN: Market "Buy" on a Ponty row calls the ALData endpoint.** PWA `screens/account/MarketScreen.tsx:307` branches on `listing.source === 'ponty'`. Ponty listings have no `source` field: they are built in `characters/shared.js:1134-1136` and `runtime/coordinator/status/ponty.ts:38-45`. Every Ponty buy goes to `POST merchant/aldata-order`, which returns 409 "ALData listing is no longer in the market snapshot" (`runtime/coordinator/http/manual-market-orders.ts:75-85`). No market purchase in the PWA has a confirmation step (the dashboard confirms all three: `stand-sheet.tsx:3361-3697`) or a freshness gate.
4. **MISSING: the whole stand/market management surface.** This covers the native stand buy-order section, the Live/Queued/Paused sale status, stand open/closed, the ALData WTB tab with the Sell flow (`/merchant/aldata-sale`), Classifieds, Marketplace settings (auto-fill stand slots via `/merchant/native-stand` `configure`, plus the merchant blacklist via `/merchant/blacklist`), the deal and freshness indicators, and "Make WTB"/"Add to WTB"/"List"/"Add to stand" cross-actions. None of these endpoints or state keys exist in the PWA (grepped `native-stand`, `merchant/blacklist`, `aldata-sale`, `nativeStand`, `merchantBlacklist`, `autoStandBuys`, `trades`, `buyOrders`: zero hits).
5. **BROKEN/MISSING: WTB editing semantics and merchant settings.** The PWA cannot clear a WTB priority override: it omits `priorityOverride` when null (`api/partyApi.ts:646`), and the server keeps the previous value when the field is undefined (`runtime/coordinator/http/merchant-bid.ts:37-40`). The PWA cannot answer the 409 "stand full → choose a replacement" prompt, because `post()` discards `occupants` (`api/partyApi.ts:106-113,178-183`). The Merchant settings dialog's buy-upgrade batch size, stand location, delivery trips and withdrawal trips are all MISSING. "Send merchant to…" (`/command type:bank`) and the merchant gold target's bank-exchange button are MISSING.

## Feature table

Legend: D = dashboard (`console-v1.2.0/`), P = PWA (`web/src/`).

### A. Merchant card: queue / logistics

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| A1 | Collapsible "Merchant logistics · N queued" | D `dashboard/features/party/merchant-card-controls.tsx:108-112` | `merchantQueue`, `merchantCurrent` (core) | PARTIAL | P `screens/character-detail/sections/MerchantQueueSection.tsx:77` | The PWA hides the whole section when the queue is empty (`:73`). The dashboard shows "No queued work" (`merchant-card-controls.tsx:114-116`). |
| A2 | Human job label (`merchantJobLabel`: catalog item names, Buy / "Buy and upgrade", giveaway "Join X's giveaway for Y", Bank retrieval/storage stage, purchase details with qty, realms, "Ponty") | D `merchant-job-label.ts:43-56`, `merchant-card-controls.tsx:90,133` | job fields `operationStage`, `order`, `listings`, `seller`, `expectedItem`, `bidItemId` | PARTIAL | P `MerchantQueueSection.tsx:49` (`job.routine ?? job.reason`, raw keys) | The PWA `MerchantJob` model lacks these fields (`models/state.ts:11-30`). |
| A3 | Priority prefix `P{job.priority ?? routinePriorities[routineFor(job)] ?? 50}` | D `merchant-card-controls.tsx:130-132` | `job.priority`, `merchantRoutinePriorities` | MISSING | none — grepped `priority` in MerchantQueueSection.tsx | `routineFor` has not been ported. |
| A4 | Target suffix "· target" (suppressed for join giveaway) | D `:134` | `job.target` | PRESENT | P `MerchantQueueSection.tsx:99,106` | Not suppressed for giveaway jobs. |
| A5 | Status column: deferred "Waiting: reason", "finishing collection", phase, "queued"; `realmBlockedReason` or "Retry at <time>" (`retryAt`) or `pauseReason` | D `:94-105,136` | `commandReport`, `phase`, `retryAt`, `pauseReason`, `realmBlockedReason` | PARTIAL | P `:107` shows only `realmBlockedReason` | No phase, deferred reason, retryAt or pauseReason. A PWA-only "Stuck" banner exists (`:60-65,78-85`). |
| A6 | Retry button only when `realmRetryExhausted` → `POST /merchant/job/retry {id}` | D `:137-139` | `realmRetryExhausted` | BROKEN (wrong condition) | P `MerchantQueueSection.tsx:110-121` shows Retry whenever `realmBlockedReason` is set | Endpoint and body match (`api/partyApi.ts:469-471`). Retry is offered before retries are exhausted. |
| A7 | Cancel button only for **queued** jobs that are not fishing/mining; automatic routines show a confirmation dialog: "Canceling this job will also disable this routine until you re-enable it in Routines" | D `merchant-card-controls.tsx:122-124`, `merchant-cancel-job-control.tsx:20,38-63`, `automatic-routine-keys.tsx` | `POST /merchant/job/cancel {id}` | BROKEN/PARTIAL | P `MerchantQueueSection.tsx:123-133` | No confirmation, so cancelling silently disables automatic routines. Cancel is shown for fishing/mining. A missing id sends `{id:''}` where the dashboard disables the button (`merchant-cancel-job-control.tsx:39`). No tooltip, no error display. |
| A8 | Merchant's Luck upkeep row ("dispatch in X" / status) | D `:142-155` | `mluckSchedule` | MISSING | none — grepped `mluck` in src | The state key is not modeled. |
| A9 | Current job highlighted first | D `:91-105,127` | `merchantCurrent` | PRESENT | P `MerchantQueueSection.tsx:97-101` | |

### B. Merchant card: activity

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| B1 | Activity log in a collapsible card section (fetches `logs` only while open) | D `merchant-card-controls.tsx:158-194`, `components/merchant-activity.tsx:52-100` | `merchantActivity` (section=logs) | PARTIAL | P `screens/account/LogsScreen.tsx:16,39-48,65-72` | Moved to the Logs screen. Each row lacks the timestamp (`<time>` with toLocaleTimeString and a full-date title), the error/success level colour, and the `details` suffix. |
| B2 | "Clear stale orders" → `POST /merchant/stale-orders/clear`, shows "Removed N deliveries, M bank marks" | D `:166-178` | response `deliveriesRemoved`, `bankMarksRemoved` | PARTIAL | P `MerchantControlsSection.tsx:105-107`, `api/partyApi.ts:506-508` | The result counts are never shown: `post()` only parses `{ok,error}` (`api/partyApi.ts:106-113`). |
| B3 | "Clear history" → `POST /merchant/activity/clear` with "Activity history cleared" status | D `:179-191` | | PRESENT | P `MerchantControlsSection.tsx:108-110`, `partyApi.ts:512-514` | No confirmation on either side. |

### C. Merchant card: action grid

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| C1 | Buy / Craft / Exchange buttons | D `merchant-card-controls.tsx:196-219` | `commerceMode` | PRESENT | P `MerchantControlsSection.tsx:51-60` → `/merchant/:mode` | |
| C2 | Donate gold dialog: amount plus **XP preview** (`donationXpPerGold`, default 3.2) and description; `POST /merchant/donate {amount}` | D `party-reference-panels.tsx:149-185`, `use-party-console.tsx:521-533` | `characters[merchant].donationXpPerGold` | PARTIAL | P `MerchantControlsSection.tsx:82-85,140-153`, `partyApi.ts:483-485` | No XP preview, no description, no inline validation error. |
| C3 | Join giveaway: realm **Select** from `giveawayRealms`, merchant **search picker** from `giveawayPlayers[realm]` ("N online players loaded"); `POST /merchant/join-giveaway {realm, seller}` | D `party-management-panels.tsx:92-210`, `use-party-console.tsx:534-547` | `giveawayRealms` (config), `giveawayPlayers` (core) | PARTIAL | P `MerchantControlsSection.tsx:87-90,206-224` | Free-text inputs only. No realm list and no online-player directory. The dialog description is missing. |
| C4 | Send to party: picks a party **group** when there is more than one (`merchantPartyGroups`); `POST /bank-party {group}` | D `send-to-party-control.tsx:9-34`, `use-party-console.tsx:433-439` | `/bank-party` | PARTIAL | P `MerchantControlsSection.tsx:78-80`, `partyApi.ts:499-501` | Always sends `{}`, so multi-group accounts get a 409 (acknowledged in the PWA comment at `partyApi.ts:494-498`). `runtime/party-groups` is a port candidate. |
| C5 | Force stand toggle (On/Off, aria-pressed) → `POST /merchant/force-stand {enabled}` | D `:237-249` | `merchantForceStand` (config) | BROKEN (state) / PRESENT (action) | P `MerchantControlsSection.tsx:63-65` | The action is correct, but the displayed state always reads Off because of Top gap #1 (`merchantForceStand` is in configFields, `public-state.ts:81`). Pressing it while it shows "Off" sends `enabled:true` even when the server is already on. |
| C6 | Routines button | D `:250-257` | | PRESENT | P `MerchantControlsSection.tsx:75-77` | See section D. |
| C7 | Mining / Fishing toggles → `POST /merchant/gather {mode, enabled}` | D `:259-296` | `gatheringModes` (core) | PRESENT | P `MerchantControlsSection.tsx:66-71`, `partyApi.ts:463-465` | |
| C8 | Mining / Fishing readiness: "Ready" ✓ or m:ss cooldown countdown; "No tool" | D `:67-89,271-275,290-294` | `gatheringCooldowns` (merchant and state), `gatheringNoTool` | MISSING | none — grepped `gatheringCooldowns`, `gatheringNoTool` | |
| C9 | Clear job queue → `POST /merchant/clear` | D `:297-304`, `use-party-console.tsx:508-514` | | PRESENT | P `MerchantControlsSection.tsx:112-133` | The PWA adds a confirmation; the dashboard has none. |
| C10 | "Send merchant to…" dialog: lists other online non-merchant characters (seen < 10s); `POST /command {character, type:'bank'}`; "Merchant visit queued for X" | D `merchant-visit-control.tsx:10-41` (mounted `inventory-panel.tsx:1278`) | `/command type:bank` | MISSING | none — grepped `type: 'bank'`, `'bank'` in src | This is the only manual "visit this character" trip. |

### D. Routine priorities dialog

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| D1 | Routine label set (30 keys including `deliveries`, `withdrawals`, `upgrade preview`, `manual exchange`, `automatic exchange`) | D `routine-labels.tsx:3-35` | `merchantRoutinePriorities` keys | BROKEN | P `lib/routineLabels.ts:5-33` | Missing `deliveries`, `withdrawals`, `upgrade preview`, `manual exchange`, `automatic exchange`. Adds a nonexistent `exchange` key (`:24`) that the server ignores (`routine-priorities.ts:29`). |
| D2 | Enable checkboxes for automatic keys + fishing + mining | D `routine-priorities-dialog.tsx:137-150`, `automatic-routine-keys.tsx:3-15` | `merchantAutomations`, `gatheringModes` | BROKEN | P `lib/routineLabels.ts:37-49`, `RoutinesScreen.tsx:22,33,64-72,113` | `exchange` is used instead of `automatic exchange`. Fishing/mining are seeded from `merchantAutomations` (where they never exist), so they always show checked and Save enables both gathering modes (`merchant-configuration.ts:66-82`). The dashboard seeds them from `gatheringModes` (`party-management-panels.tsx:617-621`). |
| D3 | Seed the draft only on open; never overwrite while open | D `routine-priorities-dialog.tsx:46-56` | | BROKEN (given Top gap #1) | P `RoutinesScreen.tsx:30-36` | It seeds only when priorities are non-empty. With config never delivered, the draft is `{}`, every row shows 50, and Save posts 50 for all keys (`:112`). |
| D4 | Header "Merchant routines · N/M enabled" | D `:107` | | PARTIAL | P `RoutinesScreen.tsx:56-59` | The count does not exclude disabled deliveries/withdrawals (they are not listed at all). |
| D5 | Deliveries/withdrawals rows disabled with "Enable in Merchant settings" when their trip setting is off; their priority is dropped on save when disabled | D `:61-62,133-134,152,156-159,228-233` | `merchantAutomations.deliveries/withdrawals` | MISSING | none | |
| D6 | Priority numeric input 0-100 | D `:154-171` | | PRESENT | P `RoutinesScreen.tsx:74-82` | |
| D7 | Reorder by drag (pointer capture, autoscroll, ghost row, FLIP animation), keyboard ArrowUp/Down, Escape restores | D `:113-127,172-203,86-102,207` | | PARTIAL (acceptable) | P `RoutinesScreen.tsx:42-54,83-100` (up/down buttons, same `move()` algorithm) | The mobile adaptation is fine, but `move()` does not skip disabled routines (`D :63-64`). |
| D8 | Save → `POST /merchant/routine-priorities {priorities, enabled}`; deletes `enabled.deliveries/withdrawals`; error shown; dialog closes | D `:222-247`, `use-party-console.tsx:683-689` | | PARTIAL | P `RoutinesScreen.tsx:106-121`, `partyApi.ts:522-524` | The endpoint matches; the body content is wrong per D1–D3. Cancel button: the PWA relies on back navigation. |

### E. Merchant settings dialog

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| E1 | Settings dialog entry (gear "Settings") | D `merchant-collection-settings.tsx:31-34`, `merchant-card-controls.tsx:305` | | PARTIAL | P `MerchantControlsSection.tsx:92-103` ("Collection settings" expander) | Only thresholds and bank-sort mode are present. |
| E2 | Bank sort control | D `merchant-collection-settings.tsx:35` (`bank-sort-control.tsx`) | `/merchant/bank-sort` | PARTIAL (out-of-slice detail) | P `MerchantControlsSection.tsx:174-183`, `partyApi.ts:530-535` | See the bank auditor. |
| E3 | "Maximum number to buy at once for upgrading" 1-42 → `POST /config {buyUpgradeBatchSize}` | D `buy-upgrade-batch-setting.tsx:7-24`, `merchant-collection-settings.tsx:36` | `buyUpgradeBatchSize` (config) | MISSING | none — grepped `buyUpgradeBatchSize` | |
| E4 | Merchant stand location X/Y → `POST /merchant/stand-location {map:'main',x,y}` (validated against obstacles) | D `merchant-stand-location-setting.tsx:8-30` | `merchantStandLocation` (config); `runtime/coordinator/merchant/stand-location.ts:37-40` | MISSING | none — grepped `stand-location` | |
| E5 | "Marked deliveries create merchant jobs" → `POST /merchant/routine-priorities {priorities:{}, enabled:{deliveries}}` + help text | D `delivery-trip-setting.tsx:4-23` | `merchantAutomations.deliveries` | MISSING | none | |
| E6 | "Marked withdrawals create merchant jobs" (optimistic pending state) → same endpoint `{enabled:{withdrawals}}` | D `withdrawal-trip-setting.tsx:5-26` | `merchantAutomations.withdrawals` | MISSING | none | |
| E7 | Automatic gold collection "Collect above" + Apply → `POST /config {threshold}`; rejects non-integer/negative with inline error; dirty guard | D `merchant-collection-settings.tsx:41-71`, `use-party-console.tsx:367-379` | `threshold` (config) | PARTIAL | P `MerchantControlsSection.tsx:184-192`, `partyApi.ts:541-546` | `Number()\|\|0` with no validation error and no explanatory text. The initial value is from props via `useState` (never re-syncs) and is 0 per Top gap #1. |
| E8 | Automatic item collection "Marked slots required" 1-42 + long help text; out-of-range shows "Use an item-slot threshold from 1 to 42" | D `:72-107`, `use-party-console.tsx:380-392` | `itemCollectionThreshold` (config) | PARTIAL | P `MerchantControlsSection.tsx:193-201` | Silently clamps; no help text. |

### F. Gold

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| F1 | Header party gold: bank gold (abbreviated) + "(X total)"; total = bank + carried for active slots excluding bankbois; "—" if any balance unknown; tooltip with exact Bank/carried/combined | D `party-gold.tsx:9-70`, `party-header.tsx:117` | `bankGold` (core), `activeSlots`, `bankbois`, vitals gold | PARTIAL | P `screens/CharacterListScreen.tsx:24,31`, `CharacterDetailScreen.tsx:46,56` | Only one combined number, with missing balances treated as 0. No separate bank figure and no exact tooltip. Bankbois are not excluded and inactive characters are not filtered. |
| F2 | `abbreviatedGold` formatting (1.234m / 123.4K) | D `abbreviated-gold.tsx:3-8` | | MISSING | P uses `toLocaleString()` everywhere | Pure, port verbatim. |
| F3 | Merchant "pocket money" gold target: current gold + input (save on blur) + **bank-exchange button** (save then `POST /command {character: merchant, type:'bank'}`) | D `gold-target-control.tsx:6-75`, `connected-character-card.tsx:131-135,393-400` | `goldTargets` (config), `/command gold-target`, `/command bank` | PARTIAL | P `screens/character-detail/sections/GoldTargetSection.tsx:11-55` | The gold-target command matches. The "Exchange gold and items with bank" button is missing. The PWA shows the target for **every** character, while the dashboard shows it for the merchant only; the server accepts it (`upgrade-commands.ts:164`), so this is a superset. The value reads 0 per Top gap #1. |

### G. Restock

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| G1 | "Merchant restock" HP min/max, MP min/max + Save → `POST /restock {character, hp, mp}`; dirty guard | D `restock-controls.tsx:12-72`, `use-party-console.tsx:494-500` | `restockPolicies` (config) | PARTIAL | P `RestockSection.tsx:14-79`, `partyApi.ts:227-233` | The wiring matches (server ignores `item`, `runtime/coordinator/http/restock.ts:32`). The default when no policy exists is 0/0/0/0 in the PWA (`CharacterDetailScreen.tsx:198`) against the dashboard's 5/20/0/0 (`restock-controls.tsx:7-10`), which is also the server default. The state is never delivered (Top gap #1). Save errors are ignored. |

### H. Commerce dialog (buy / craft / exchange)

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| H1 | Buy catalog search + Add | D `merchant-commerce-dialog.tsx:361-426` | `merchantCatalog.buyable` | PRESENT | P `screens/account/MerchantCommerceScreen.tsx:212-256` | |
| H2 | Buy cart: qty (≤9999), Target +level (0-13) for upgradeable, remove | D `:432-477,263-295` | | PARTIAL | P `:257-288` | No 9999 cap. |
| H3 | 90% budget line ("N base items · k scrollG") and "Gold (est)" total using `upgradeEstimate` | D `:208-233,478-489,526-528` | | MISSING | P `:235,289` (plain cost×qty) | The server recomputes (`runtime/coordinator/http/merchant-order.ts:43-52,152`), so this is display-only, but the gold total is wrong for upgrade buys. |
| H4 | Buy submit → `POST /merchant/order {buys:[{id,quantity,level?,budget?,maxAttempts?}], crafts, removeAutoBankMark}` | D `:296-332`, `use-party-console.tsx:549-563` | | PRESENT | P `:58-72`, `partyApi.ts:373-379` | budget/maxAttempts are omitted, which is OK because the server overwrites them. |
| H5 | Craft list, canAddCraft greying, ingredient totals "needed · owned · buy N" | D `:166-207,492-524` | | PRESENT | P `:299-425` | |
| H6 | Craft gold total including ingredient purchase cost | D `:187-193,225-233,525-529` | | MISSING | none | Shows `cost + materials` text per row only (`:373`). |
| H7 | Recipe hover preview ("Complete recipe": per-material owned/missing/buy N; "Next craft: Xg total") | D `:555-601` | | MISSING | none | Mobile could use tap/long-press. |
| H8 | Owned counts include **bankboi** inventories (and exclude stale online copies of them) | D `dashboard/lib/account-inventory.ts:5-25`, `merchant-commerce-dialog.tsx:126-139` | `bankbois` | PARTIAL | P `lib/inventoryCounts.ts:10-25` | No bankbois, so it undercounts owned materials. |
| H9 | 409 `missing` detail appended to the error (`id +lvl: required, available`) | D `:323-327` | response `missing[]` | MISSING | P `post()` drops extra fields (`partyApi.ts:106-113`) | |
| H10 | Exchange catalog grouped by currency ("Choose"), owned/required, Add | D `:152-162,369-425` | `merchantCatalog.exchangeable` | PRESENT | P `:438-552` | |
| H11 | Exchange submit → `POST /merchant/exchange-order {exchanges:[{id,quantity,level,reward}]}` | D `:302-319`, `use-party-console.tsx:561` | | PRESENT | P `:121-139`, `partyApi.ts:383-387` | |
| H12 | Exchange details overlay (gear on every tile): potential results with chance %, nested box drill-down, inspect reward | D `:412-413,602-711` | | PARTIAL | P `:580-641` shows results only inside the "Choose" overlay for currency groups | Box/table items (no `reward`) have no way to view their result table. No inspect. |
| H13 | "Mark multiple" exchange-reward rules (bank / upgrade to +N / npc / stand) → `/command auto-item-mark`, `/command auto-upgrade-mark`, `/merchant/auto-npc-sale`, `/merchant/auto-stand` | D `:85-99,616-633`, `party-merchant-commerce-dialog.tsx:26-40`, `exchange-mark-controls.tsx` | | MISSING | none | |
| H14 | Tap a catalog tile → item details (with "Add" from details for exchange) | D `:392-396`, `party-merchant-commerce-dialog.tsx:54-64` | | MISSING | none | |
| H15 | Upgrade-offering provider wrapping commerce | D `party-merchant-commerce-dialog.tsx:23` | | (out-of-slice) | P `screens/account/OfferingsScreen.tsx` | |

### I. Stand sheet ("Inspect stand")

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| I1 | Header button "Inspect stand · N/16" (`occupiedStandSlots`: live merchant trade slots + native buy offers + live listings) | D `party-header.tsx:76-83`, `stand-count.tsx`, `stand-inspection.ts:9-29` | `standListings`, `nativeStand`, merchant `slots`, `standOpen` | PARTIAL | P `screens/account/StandScreen.tsx:19` (`standListings.length`), nav `screens/character-detail/AccountMenu.tsx:16` | Wrong count: includes paused/queued and excludes buy offers. Always 0 per Top gap #1. |
| I2 | "Items for sale · N/16 slots" + "Stand open / closed / unknown" | D `stand-sheet.tsx:1802-1807` | `standOccupancy`, `merchant.standOpen` | MISSING | none — grepped `standOpen` | |
| I3 | Sale rows reconciled against live trade slots (`standSaleRows`): Live/Paused badge, live-only unmanaged rows (non-editable), separate "Queued sales for stand" group | D `:1817-1820,1981-1989`, `stand-inspection.ts:30-46` | `standListings[].state/tradeSlot`, merchant `slots` | MISSING | P `StandScreen.tsx:24-28` lists raw `standListings` only | The PWA model lacks `state`/`tradeSlot` (`models/state.ts:147-155`). |
| I4 | Sale tile: sprite, +level badge, stat_type badge, mluck clover, quantity | D `:1883-1960` | | PARTIAL | P `StandScreen.tsx:42-49` | Text only: name +level, price × qty. |
| I5 | Suggested-price tooltip (`SuggestedPriceDetails`: default price, lowest/recent/market low/highest WTB at exact level, farm sources with kills/rate/luck/map/paths, buy+upgrade estimate) | D `:2023-2043`, `suggested-price-details.tsx`, `suggested-item-value.tsx` | `standPriceHistory` (market), `meta.world.suggestedPrices` | MISSING | none — grepped `standPriceHistory`, `suggestedPrices` | |
| I6 | Price button → edit dialog (`onStandEdit`) | D `:1992-1994`, `party-inventory-panels.tsx:192-205` | `POST /merchant/stand {id,…}` | PARTIAL | P `StandScreen.tsx:52-54,68-85` (inline price only, sends `id`) | The edit preserves quantity but not `bankPack` (`StandScreen.tsx:77`), so a bank-sourced listing edited without `bankPack` is matched by id only. It works, but no presets (see J). Hidden when `slot == null`. |
| I7 | Remove with two-step "Really remove?" → `POST /merchant/stand {...listing, remove:true}` (includes `id`, `bankPack`) | D `:389-405,1997-2017`, `use-party-console.tsx:698-700` | | BROKEN | P `StandScreen.tsx:55-65` sends `markForStand(item, slot, price, {remove:true})`, with **no `id` and no `bankPack`** | Server `find()` without id only matches non-live, non-tradeSlot, non-bank entries (`runtime/coordinator/merchant/stand-marks.ts:114-127`). Removing a **live** or **bank-sourced** listing returns `ok:true` and changes nothing. No confirmation. |
| I8 | "Buy orders · N/16 slots" section (native stand offers): item +level, "N wanted", price button (edit WTB), "Native batch", Priority input (blur/Enter saves, Esc reverts, `editField:'priorityOverride'` + `bidRevision`), "Auto" badge, Use-stand toggle, Cancel/"Really cancel?" | D `:2064-2111`, `stand-inspection.ts:47-63` | `nativeStand.offers`, `standBids` | MISSING | none — grepped `nativeStand` | |
| I9 | Inspect item from any stand row | D `:1859-1877,2076` | | MISSING | none | |

### J. Stand listing price dialog (sell)

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| J1 | Merchant stand listing dialog: "Buy from NPC" price, "Current number on market" | D `party-management-panels.tsx:212-242` | | MISSING | P `screens/itempanel/ItemActionPanel.tsx:215-216,478-489` (price field only) | |
| J2 | 13 price presets (NPC sale +10%, Ponty, Default ±10%, Market low −5% (disabled below NPC price), Market price, Highest WTB, Recent ±5%, Input ±5%) | D `:258-357`, `stand-price-button.tsx` | `standPriceHistory` | MISSING | none | |
| J3 | Quantity input when stack > 1 | D `:363-379` | `quantity` | MISSING | P always sends `quantity: 1` (`partyApi.ts:254`, `ItemActionPanel.tsx:484`) | Listing a stack lists only one unit. |
| J4 | "Mark all for stand" (`markAll:true`) | D `:380-400`, `use-party-console.tsx:589-598` | | MISSING (inventory) / PRESENT-ish (bank "all") | P `screens/account/BankScreen.tsx:337-339` (quantity = q, not markAll) | |
| J5 | Inline `standError` display | D `:401` | | PARTIAL | P `ItemActionPanel` `run()` toast | |
| J6 | Automatic stand listing variant ("Set one fixed price…") → `POST /merchant/auto-stand {item, price, action}` | D `:220-227`, `use-party-console.tsx:580-587` | `autoStandMarks` | PARTIAL | P `ItemActionPanel.tsx:217-218,465-476`, `partyApi.ts:333-335` | No presets. The prefill uses `item.price` instead of the existing rule price. "Update auto mark" is not distinguished. |
| J7 | "Auto stand" banner on bank/inventory tiles (tooltip shows price) | D `auto-stand-banner.tsx:5-8`, `bank-sheet.tsx:539,1064` | `autoStandMarks` | MISSING | none — `lib/markBadge.ts` has no auto-stand | |
| J8 | Auto-stand rules list + remove + clear all | D (inventory panel, out of slice) | `/merchant/auto-stand {action:'remove'/'clear-all'}` | PRESENT | P `sections/AutoMarksSection.tsx:63-68,106`, `partyApi.ts:347-349` | Empty per Top gap #1. |

### K. ALData market dialog ("View market")

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| K1 | Entry "View market" | D `party-header.tsx:85-92` | | PRESENT | P `AccountMenu.tsx:17` → `/market` | |
| K2 | Status banner: "Market data unavailable: …", "Loading market data from ALData…", "ALData publishing is not configured" + **Go to setup** | D `stand-sheet.tsx:2207-2243`, `party-inventory-panels.tsx:229` | `aldata.error`, `ponty.error`, `aldata.merchantsUpdatedAt`, `aldata.auth` | MISSING | none | |
| K3 | Tabs with counts: Live WTS / Live WTB / Classifieds / Ponty | D `:2595-2643` | `aldata.listings`, `aldata.buyOrders`, `aldata.trades`, `ponty.listings` | PARTIAL | P `MarketScreen.tsx:20,52-61` (one merged WTS+Ponty list) | `buyOrders`/`trades` are not modeled (`models/state.ts:195-207`). |
| K4 | Search (item, seller, server, map) | D `:2645-2657,551-577` | | MISSING | none | |
| K5 | WTS filters: Show deals only, Hide bad deals, Hide unaffordable (bank gold), Hide blacklisted merchants (default on) | D `:2659-2737,621-643` | `merchantBlacklist`, `autoBlacklistMerchants`, `bank.gold`/`bankGold` | MISSING | none | |
| K6 | WTS row grouping (same seller/realm/map/price/identity, qty summed), fresh-first sort then price | D `:505-577` | | MISSING | none | |
| K7 | WTS row: sprite, name +lvl, seller · region id · map · "seen Ns/h ago" · "N available · not stackable"; price coloured by deal with "deal · X% off / X% above/below" + suggested-price tooltip; stale rows dimmed | D `:1276-1410` | `seenAt`, `serverRegion`, `map` | PARTIAL | P `MarketScreen.tsx:66-84` (name +lvl (seller), price × qty) | |
| K8 | WTS buy: qty + "All" (only when multiple), **confirmation dialog** "Really buy N X for Yg?", splits across grouped physical listings; stale rows show "Make WTB" instead of Buy | D `:1412-1548,3361-3483`, `use-party-console.tsx:565-567` | `POST /merchant/aldata-order {listing, buyQuantity}` | PARTIAL | P `MarketScreen.tsx:84-101`, `partyApi.ts:747-749` | The endpoint is correct (the server only reads `listing.key`, `manual-market-orders.ts:63-71`). No confirmation, no "All", no stale gate. The qty default is the full listing qty (dashboard default 1). |
| K9 | Live WTB tab: "N offers match exact items held by merchant or bank"; row "You have N", WTB price, qty + All + **Sell** with confirmation → `POST /merchant/aldata-sale {order, sellQuantity}`; stale + owned → "List" (opens stand dialog at WTB price); "Hide unowned" | D `:1556-1784,2738-2809,3485-3575`, `use-party-console.tsx:575-577` | `aldata.buyOrders` | MISSING | none — grepped `aldata-sale`, `buyOrders` | |
| K10 | Classifieds tab (other owners' published trade intentions): WTS/WTB prices, note, "Add to WTB", "Add to stand" (owned) | D `:2811-2993` | `aldata.trades` | MISSING | none | |
| K11 | Ponty tab: grouped by item+fresh/stale, "Mixed realms", "Observed Ns ago · stale/fresh", **"Matches WTB"** badge, qty (min lot default), "Up to Xg", Buy disabled when stale/invalid, last-refresh error | D `:760-1040,2995-3021` | `ponty.listings[].seenAt/groupKey/serverRegion`, `ponty.error` | PARTIAL | P `MarketScreen.tsx:20,66-104` | No grouping, freshness, WTB match or error. |
| K12 | Ponty purchase **confirmation** ("one purchase job per realm… WTB decremented") → `POST /merchant/ponty-order {keys, quantity, unitPrice}` with inline error | D `:3577-3697`, `use-party-console.tsx:568-574` | | BROKEN | P `MarketScreen.tsx:307` routes on `listing.source === 'ponty'`, but Ponty listings carry no `source` (`characters/shared.js:1134-1136`, `runtime/coordinator/status/ponty.ts:38-45`), so it calls `buyAlData` → 409 | `api.buyPonty` (`partyApi.ts:754-756`) is correct but unreachable. |
| K13 | Active WTB orders panel inside market (collapsible, persisted open state in localStorage) | D `:2245-2593,419-425,1140-1164` | | PARTIAL | P `MarketScreen.tsx:26-30` → `/wtb` | See section L. |
| K14 | "New WTB order" item picker | D `:2275-2289,3699-3766` | | PRESENT | P `screens/account/WtbScreen.tsx:30-34,76-101` | The PWA caps the list at 100 results (`:78`). |
| K15 | Inspect item from any market row | D `:1336-1352,1584-1592,2841-2857,884-892` | | MISSING | none | |
| K16 | Player-stand search & buy (`/merchant/stand-search`, `/merchant/stand-order`) | D `player-stand-market-dialog.tsx` — **not mounted anywhere in v1.2.0** (grep `PlayerStandMarketDialog`: no importer) | `standSearch` (config) | N/A (PWA has extra) | P `MarketScreen.tsx:31-50,106-139`, `partyApi.ts:762-780` | The PWA feature exists, but its results come from `standSearch`, a config field never fetched (Top gap #1), so results will never render. |

### L. WTB orders

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| L1 | Active WTB list with filter box, "visible / total" count, Clear filter, empty texts | D `stand-sheet.tsx:2293-2345,453-461,2573-2585` | `standBids` (config) | PARTIAL | P `WtbScreen.tsx:36-61` | No filter or count. Empty per Top gap #1. |
| L2 | Row: inspect button, name "· +N minimum" | D `:2363-2388` | | PARTIAL | P `WtbScreen.tsx:44-55` (tap opens edit form) | No inspect. |
| L3 | Inline field edits (×qty, price → opens WTB dialog, "P n/Default") with Enter/blur save, Escape cancel, validation; sends `{editField, value, bidRevision}` (stale-edit 409 protection) | D `active-wtb-fields.tsx:10-53`, `stand-sheet.tsx:2390-2400`; server `merchant-bid.ts:47-61,103-107` | | PARTIAL | P `WtbScreen.tsx:103-203` (full resubmit, no `editField`/`bidRevision`) | Full overwrite with no concurrency check. |
| L4 | Use-stand toggle per row (preferencesOnly) + info popover; Accept-higher-levels toggle per row; "Auto" badge; native stand problem text | D `:2401-2563`, `wtb-preferences.tsx:31-85` | `nativeStand.problems`, `nativeStand.offers[].auto/problem` | PARTIAL | P `WtbScreen.tsx:151-160` (inside form only, no explanations) | No Auto badge or problems. |
| L5 | Cancel with "Really cancel?" two-step → `POST /merchant/bid {itemId, …, clear:true}` | D `:1104-1136` | | PARTIAL | P `WtbScreen.tsx:204-222`, `partyApi.ts:652-654` | No confirmation. |
| L6 | "Make room for a buy order" replacement dialog on 409 `occupants` (radio list: sprite, name, qty at price, Selling/Buying) → retry with `replaceStandEntry` | D `wtb-preferences.tsx:93-201`; server `merchant-bid.ts:108-115,131-132` | 409 `{occupants}` | MISSING | P `partyApi.ts:643,647` accepts `replaceStandEntry` but `post()` drops `occupants` (`:178-183`), and WtbForm never retries (`WtbScreen.tsx:185-195`) | The user only sees the error text. |
| L7 | WTB dialog: price/qty/+level (disabled unless upgradeable/compoundable)/priority (0-100 clamp, "Default" placeholder) + Use stand + Accept higher levels (only up/compoundable) | D `wtborder-dialog.tsx:160-222`, `wtbpriority-input.tsx` | | PRESENT | P `WtbScreen.tsx:133-160` | The priority input does not clamp to 100. |
| L8 | Clearing priority override (blank → `priorityOverride:null` → server clears) | D `wtborder-dialog.tsx:259`, `use-party-console.tsx:710-718`; server `merchant-bid.ts:37-40` | | BROKEN | P `partyApi.ts:646` omits the key when null, so the server keeps the previous override | |
| L9 | 15 price presets (Farm price with info popover, NPC sale +10%, Ponty, Base value ±10%, Market low −5%, Market price, Highest WTB, Lowest seen, Recent ±5%, Input ±5%) at exact level | D `wtborder-dialog.tsx:81-140,223-238` | `standPriceHistory`, `meta.world.suggestedPrices` | PARTIAL | P `WtbScreen.tsx:161-175` (3 presets) | Acknowledged in the PWA header comment (`:14-17`). |
| L10 | Existing price prefilled only when existing `minimumQuality` equals the selected level | D `wtborder-dialog.tsx:60-65` | | PARTIAL | P `WtbScreen.tsx:106` (always prefills) | |
| L11 | Entry points: item details "Add to WTB", stand buy-order price, market "Make WTB"/"Add to WTB" | D `party-item-details.tsx:44`, `stand-sheet.tsx:1172-1228,2086` | `wtbItem` | MISSING | none — grepped `WTB` in `screens/itemdetail` and `itempanel` | Reachable only via Market → "Manage WTB orders" (`MarketScreen.tsx:27`). `/wtb` is not in AccountMenu (`AccountMenu.tsx:11-22`). |

### M. Marketplace settings

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| M1 | "Automatically fill empty stand slots with highest priority buy order" → `POST /merchant/native-stand {action:'configure', enabled}` | D `stand-sheet.tsx:3067-3093`, `party-inventory-panels.tsx:189-191`; server `native-stand.ts:47-48,63` | `autoStandBuys` (config) | MISSING | none — grepped `native-stand`, `autoStandBuys` | |
| M2 | "Enable blacklisting unavailable merchants" → `POST /merchant/blacklist {action:'configure', enabled}` | D `:3103-3119` | `autoBlacklistMerchants` (config) | MISSING | none | |
| M3 | Manual blacklist add (name + minutes / -1 forever) → `{action:'add', seller, minutes}` | D `:3121-3191` | | MISSING | none | |
| M4 | Strike records list (seller, region/server, reason, strikes, "blocked forever"/"Nm until retry"/"eligible") + Clear per record `{action:'clear', key}` | D `:3193-3291` | `merchantBlacklist` (config) | MISSING | none | |
| M5 | "Clear all" two-step `{action:'clear'}` | D `:3307-3333` | | MISSING | none | |

### N. ALData account settings

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| N1 | Auth / Publish status, Check status (`GET /aldata/auth`) | D `party-inventory-panels.tsx:449-467`, `use-party-console.tsx:190-229` | `aldata.auth`, `publishStatus` | PRESENT | P `screens/account/SettingsScreen.tsx:174-196`, `partyApi.ts:719-728` | |
| N2 | Reveal (`GET /aldata/key`) / Copy / Generate (`POST /aldata/key`) | D `:468-508` | | PRESENT | P `SettingsScreen.tsx:200-243`, `partyApi.ts:698-705` | |
| N3 | "Prepare mail" opens the prefilled mail composer (earthiverse / aldata_auth / key); user reviews postage and sends | D `:509-516`, `use-party-console.tsx:194-200` | `/merchant/send-mail` | PRESENT (adapted) | P `SettingsScreen.tsx:244-284` | No postage display. |
| N4 | Auth-pending poller (every 15s until CORRECT) + "Waiting for mail delivery…" notice | D `party-inventory-panels.tsx:453`, `use-party-console.tsx:181-189` | | MISSING | none | |
| N5 | `aldata.error` display | D `:526-528` | | PRESENT | P `SettingsScreen.tsx:290` | |

### O. Shared rule conflicts

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| O1 | "Automatic rules awaiting a choice": per conflict family/key "Paused" + "Use {owner}: {describe(value)}" buttons → `POST /merchant/rule-conflict {id, owner}` | D `shared-rule-conflicts.tsx:22-37`, `connected-inventory.tsx:223`; server `inventory/shared-rules.ts:96` | `merchantRules.conflicts` (config) | MISSING | none — grepped `rule-conflict`, `merchantRules` | Without this, paused shared rules cannot be resolved from mobile. |
| O2 | Incompatible-rules notice (npc vs stand vs deconstruct for the same item → "Paused. Remove the unwanted rule…") | D `:5-12,38-40` | `autoNpcSales`, `autoStandMarks`, `autoDeconstruction` + `itemRuleConflicts` | MISSING | none | |

## BROKEN details

### BR-1 Config section never fetched (Top gap #1)
- Server, `runtime/coordinator/telemetry/public-state.ts:254-258`:
  ```ts
  config: () => configPayload(state, ports),
  core: () => request.query?.dashboard !== "1" ? corePayload(fullPayload(state, ports, true)) : omitConfigFields({...
  ```
  `configFields` (`:65-82`) includes `standListings`, `standBids`, `merchantRoutinePriorities`, `merchantAutomations`, `threshold`, `restockPolicies`, `goldTargets`, `merchantForceStand`, `leader`, `farmingPolicy` and others.
- Dashboard fetches `section=config` as its own domain (`dashboard/features/party/query-cache.tsx:122-128,172`).
- PWA, `data/PartyDataProvider.tsx:140-143`, only fetches `state?section=core&dashboard=1`, `bank`, `market`, `logs`.
- Fix options: add `api.get('state?catalog=0&dashboard=1&section=config')` to the parallel poll and merge it, or drop `dashboard=1` from the core request (`corePayload` keeps config fields but loses `characterDetails`, which the PWA uses for Hunt). Also make the e2e mock honour `section` so tests catch this.

### BR-2 Routines: unknown `exchange` key, phantom gathering enable, wipe-to-50
- PWA `lib/routineLabels.ts:24` `exchange: 'Exchange'` and `:42` in `AUTOMATIC_ROUTINE_KEYS`. Dashboard `routine-labels.tsx:25-26` has `"manual exchange"` and `"automatic exchange"`; `automatic-routine-keys.tsx:10` has `"automatic exchange"`.
- PWA `RoutinesScreen.tsx:113` sends `[...AUTOMATIC_ROUTINE_KEYS, 'fishing', 'mining'].map(key => [key, enabledDraft[key] !== false])`. `enabledDraft` is seeded from `dynamicState.merchantAutomations` (`:22,33`), which never contains fishing/mining. The dashboard passes `{...merchantAutomations, fishing: gatheringModes.includes('fishing'), mining: …}` (`party-management-panels.tsx:617-621`). Server `merchant-configuration.ts:66-82` toggles gathering when the boolean differs from current.
- PWA `RoutinesScreen.tsx:31` seeds only when priorities are non-empty; `:112` sends `draft[key] ?? 50` for every key.

### BR-3 Ponty buy routed to ALData
- PWA `MarketScreen.tsx:307`: `if (listing.source === 'ponty') await api.buyPonty(...) else await api.buyAlData(listing.key!, qty)`.
- Ponty listing shape `characters/shared.js:1134-1136`: `{ key, rid, item, serverRegion, serverIdentifier, quantity, unitPrice, price }` (no `source`). ALData listings carry `source: "aldata"` (`aldata-listing.tsx:6`).
- Fix: tag the origin when merging (`MarketScreen.tsx:20`) rather than relying on a server field.

### BR-4 Stand Remove is a silent no-op for live and bank listings
- PWA `StandScreen.tsx:60`: `api.markForStand(listing.item, listing.slot!, listing.price, { remove: true })`, so the body is `{id: undefined, item, slot, bankPack: undefined, price, quantity: 1, remove: true}`.
- Server `merchant/stand-marks.ts:120-126`: without an id, only `entry.state !== "live" && !entry.tradeSlot && entry.slot === slot && !entry.bankPack` matches. `http/stand-marks.ts:62-64` then returns ok with nothing removed.
- Dashboard `use-party-console.tsx:698-700` sends `{...listing, remove:true}`.
- Fix: pass `id: listing.id, bankPack: listing.bankPack`.

### BR-5 WTB priority override cannot be cleared
- PWA `partyApi.ts:646`: `if (priorityOverride !== null) body.priorityOverride = priorityOverride`.
- Server `merchant-bid.ts:37-40`: `if (value === undefined) return previous; return value === null || value === "" ? undefined : Number(value)`.
- Fix: always send `priorityOverride` (null allowed).

### BR-6 Queue Retry shown on the wrong condition
- PWA `MerchantQueueSection.tsx:110`: `{job.realmBlockedReason && (<Button … Retry`. Dashboard `merchant-card-controls.tsx:137`: `{job.realmRetryExhausted && <button … Retry`.

### BR-7 Queue Cancel lacks the auto-routine disable confirmation and fishing/mining exclusion
- Dashboard `merchant-card-controls.tsx:122` excludes fishing/mining. `merchant-cancel-job-control.tsx:20,41` opens a "Cancel {label}? … will also disable this routine" dialog for `automaticRoutineKeys`.
- PWA `MerchantQueueSection.tsx:123-133` cancels immediately for every queued job and sends `{id: job.id ?? ''}`.

### BR-8 Force stand state display (via BR-1)
- PWA `MerchantControlsSection.tsx:63` uses `forceStand` from `dynamicState.merchantForceStand`, a config field that never arrives, so the button always shows Off.

### BR-9 / BR-10 (summarized above)
- K12 is the Ponty case (BR-3).
- D3 is wipe-to-50 (BR-2).
- I1: the stand count uses `standListings.length` instead of `occupiedStandSlots` (`StandScreen.tsx:19` vs `stand-inspection.ts:27-29`). Classified PARTIAL in the table but numerically wrong.

## Reuse opportunities (pure logic, port nearly verbatim)

- `dashboard/features/party/merchant-job-label.ts` (whole file) together with `runtime/coordinator/merchant/routines.ts:1-25` (`routineFor`, `routineEnabled`): gives queue labels, priority lookup and cancel semantics.
- `routine-labels.tsx`, `automatic-routine-keys.tsx`: replace `lib/routineLabels.ts` with a verbatim copy, which fixes BR-2(c) and D1.
- `abbreviated-gold.tsx`, `party-gold.tsx` (`partyGoldNames`, `goldTotals`): gold header.
- `stand-inspection.ts` (`standOccupancy`, `standSaleRows`, `standBuyRows`), `stand-capacity.ts`: needs `nativeStand` and merchant `slots`/`standOpen` in the PWA model.
- `exact-level-price.tsx`, `level-price-history.ts`, `suggested-item-value.tsx`, `ponty-price.tsx`, `npc-sale-value.tsx`, plus `upgrade-estimate`/`UPGRADE_CHANCES`: all price presets (J2, L9) and the 90% budget (H3). Check that the PWA's `lib/itemFormulas.ts` `npcSaleValue` signature (`WtbScreen.tsx:116` uses `(level, false, undefined, meta)`) matches before reusing.
- `automatic-commerce-rule-key.tsx`: auto-stand banner (J7) and exchange-mark price lookup.
- `dashboard/lib/account-inventory.ts` `inventoryCounts`: extend `lib/inventoryCounts.ts` with the bankbois parameter (H8).
- `wtb-preferences.tsx` explanation strings (`standBuyExplanation`, `higherLevelExplanation`, `autoStandExplanation`) plus the `useWTBReplacement` flow. This requires extending `PartyApiClient.post()` to return the parsed error body (`occupants`, `missing`, `deliveriesRemoved`), which also unblocks H9 and B2.
- `stand-sheet.tsx` market helpers (`dealValuesByItem`, ALData grouping `:505-549`, Ponty grouping `:788-840`, blacklist matching `:593-619`, `ownedKey`/`bankOwned` `:659-719`): extract into a pure module for the PWA market screen.
- `runtime/party-groups` `merchantPartyGroups`: Send-to-party group picker (C4).
- `shared-rule-conflicts.tsx` + `runtime/coordinator/inventory/shared-rules.ts` `itemRuleConflicts`: O1/O2.
- Existing PWA helpers to extend rather than duplicate: `MarketScreen` should gain tabs instead of a new screen; `WtbScreen.WtbForm` should become the single WTB dialog reachable from item details and market rows; `MerchantControlsSection` "Collection settings" should host E3–E6.

## Out-of-slice observations

1. BR-1 also breaks every other domain that reads config fields. That includes leader/followers/farmingPolicy/monsterFocus/huntBlacklist/huntSettings/farmingProfiles (farming auditor), marks/upgrades/compounds/statScrolls/merchantMarked/marked/npcSaleMarks/deconstructionMarks/autoItemMarks/autoUpgradeMarks (inventory/bank auditors), bankboiPrefix/anniversaryAutoChat (settings), and `roster`/`classChoices`. CharacterDetailScreen's debug banner (`CharacterDetailScreen.tsx:67-79`) is likely chasing this. High priority for whoever owns data plumbing.
2. `web/e2e/fixtures/mockPartyServer.ts:660-664` ignores `section` and returns the full state, which masks BR-1 in every e2e test.
3. `MerchantQueueSection.tsx:8-9,86-96` hard-codes a one-time production-attempt recovery for `Patinder:1790863565429:zq4qk8ap6o`, shown whenever the current job reason contains "upgrade"/"compound". This is stale debug UI that should be removed.
4. `PartyApiClient.post()` (`api/partyApi.ts:160-192`) discards every response field except `ok`/`error`. This blocks the WTB replacement (L6), craft-missing details (H9), stale-order counts (B2), and likely other domains' 409 detail flows.
5. `GoldTargetSection` is rendered for every character (`CharacterDetailScreen.tsx:199`), while the dashboard limits it to the merchant. The server accepts it, but it is a behavioural divergence.
6. Dashboard `player-stand-market-dialog.tsx` is dead code in v1.2.0 (no importer). The PWA's stand search (`MarketScreen.tsx:31-50`) is a PWA-only extra, and it cannot show results until BR-1 is fixed, because `standSearch` is a config field.
7. The bank-screen stand listing "all" uses `quantity: entry.item.q` rather than `markAll` (`BankScreen.tsx:337-339`). For the bank auditor to verify against `party-management-panels.tsx:380-400`.
