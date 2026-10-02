# 04-challenge: adversarial review of 04-upgrades-exchange-lucky.md

Reviewer 04. Both repos were treated as read-only.

Path abbreviations: same as the report. **C** = `scratchpad/console-v1.2.0`, **D** = `C/dashboard/features/party`, **R** = `C/runtime`, **P** = `F:/CodingProjects/adventureland-party-mobile/web/src`.

## Headline

The report holds up well. No MISSING row was refuted outright.

- **One fix recipe is wrong.** Row 46 (bankbois) cannot be fixed by "add bankbois to `inventoryCounts`". The PWA never receives bankboi *items* at all; see U1.
- **One row is downgraded:** row 50, MISSING → PARTIAL.
- **The five focus items:** all confirmed, with one correction and one nuance. The production button is safe to delete.

## Focus answers

### (a) Auto-exchange toggle: CONFIRMED

The server toggles. R/coordinator/inventory/merchant-item-commands.ts:57-61:

```ts
if (state.autoExchanges[key]) delete state.autoExchanges[key];
else { ports.selectAction?.(...); state.autoExchanges[key] = { name: item.name, level }; }
```

- **Removal path.** `selected()` (lines 64-73) routes a merchant-inventory `auto-exchange` with a real slot to `exchange()`. A POST on an already-marked key therefore deletes the rule and returns `null`, which is success.
- **PWA guard.** `!autoExchangeMarked && run(...)` at P/screens/itempanel/ItemActionPanel.tsx:192,284 reads `dynamicState.autoExchanges`. That field is a `configFields` member (R/coordinator/telemetry/public-state.ts:74), which `omitConfigFields` strips from `core&dashboard=1` (lines 101-105, 257). The PWA default is `{}` (P/models/state.ts:772).
- **Today's failure:**
  - The row always reads "Auto exchange".
  - Tapping it on an item that was auto-marked from the dashboard silently deletes the rule.
  - The success path then refreshes as if the rule had been added.
- **Dashboard comparison.** The dashboard's gate is the same: `definition.e > 0` and holder == merchant (D/inventory-panel.tsx:690-691). The difference is that the dashboard disables the row (D/automatic-item-actions.tsx:39).
- **Fixing B1 fixes this row.** No other change is needed.
- **Residual minor issue.** The PWA `isMerchant` is roster-ctype based. The server additionally requires `body.character === state.merchantCharacter` (merchant-item-commands.ts:65), otherwise it returns `undefined` and falls through. If the account has more than one ctype-merchant, the row appears for a non-designated merchant and fails. Tag: blocked-by-config-fetch (needs `merchantCharacter`).

### (b) routineLabels `'exchange'` key: CONFIRMED BROKEN

Evidence:
- **PWA keys.** P/lib/routineLabels.ts:24 (`exchange: 'Exchange'`) and :42 (`'exchange'` in `AUTOMATIC_ROUTINE_KEYS`).
- **What Save sends.** P/screens/account/RoutinesScreen.tsx:112-113 builds `priorities` from `Object.keys(ROUTINE_LABELS)` and `enabled` from `AUTOMATIC_ROUTINE_KEYS + fishing/mining`.
- **Server, priorities.** `setPriorities` skips keys that are not in `ports.priorities` (R/coordinator/http/routine-priorities.ts:28-29).
- **Server, automations.** `updateAutomations` iterates only `Object.keys(ports.automations)` (lines 37-41).
- **The defaults.** They contain `'manual exchange'` and `'automatic exchange'` but no `'exchange'` (R/coordinator/merchant/initial-settings.ts:60-61, 88).
- **Legacy migration.** `migrateExchangeAutomations` / `migrateExchangePriorities` (R/coordinator/merchant/routines.ts:29-50) only run when the coordinator loads persisted settings, so a live POST of `exchange` is dropped.

Result: neither exchange routine can be prioritised or toggled from the PWA.

The PWA labels also lack these keys, which the dashboard has (D/routine-labels.tsx:7-8, 17, 25-26):
- `deliveries` ("Marked deliveries")
- `withdrawals` ("Marked withdrawals")
- `upgrade preview` ("Refresh upgrade chances")
- `manual exchange`
- `automatic exchange`

The dashboard's `automaticRoutineKeys` is D/automatic-routine-keys.tsx:3-15. The fix is a verbatim replacement of P/lib/routineLabels.ts from those two files.

**Severity is higher than the report implies.** Before B1 is fixed, "Save routines" is destructive. The seeding guard (RoutinesScreen.tsx:31) never fires because `merchantRoutinePriorities` is stripped from core. So the draft is `{}`, and Save posts 50 for every PWA-known key and `true` for every toggle. That re-enables any automation the user disabled on the dashboard and flattens their priorities. Treat the RoutinesScreen as **do-not-use until B1 lands**. Tag: blocked-by-config-fetch.

### (c) Exchange owned counts excluding bankbois: CONFIRMED, but the report's fix is WRONG

The report says bankbois "is sent in core as summaries (public-state.ts:153)" and proposes adding a bankbois parameter to `inventoryCounts`. That is not enough:

- **Core sends summaries without items.** `core&dashboard=1` sends `bankbois: bankboiSummaries(...)` (R/coordinator/telemetry/public-state.ts:153). `bankboiSummaries` (lines 160-176) keeps only `name, ctype, level, state, gold, seenAt, error, transaction`. There is no `items` field.
- **Full bankbois come only from the bank section with `dashboard=1`:** `...(request.query?.dashboard === "1" ? { bankbois: ports.bankbois() } : {})` (public-state.ts:245).
- **The PWA asks for the bank section without that flag:** `api.get('state?section=bank')` (P/data/PartyDataProvider.tsx:141).
- **How the dashboard gets them.** It loads the `bank` domain with `dashboard=1` (D/query-cache.tsx:174) via `usePanelModel(base, {inventory:true, bank:true})` (D/party-merchant-commerce-dialog.tsx:19; D/use-panel-model.ts:60-72). The bank result is merged after core, so the full bankbois overwrite the summaries. The dialog then receives `bankbois={state.bankbois}` (party-merchant-commerce-dialog.tsx:53).

Correct fix, in order:
1. Change the PWA bank poll to `state?section=bank&dashboard=1`. The PWA already spreads `bank` after `core` (PartyDataProvider.tsx:186-192), so the full array will win.
2. Add `bankbois: {name; items?}[]` to P/models/state.ts.
3. Port C/dashboard/lib/account-inventory.ts:5-25 verbatim. This includes the `storageNames` exclusion, which drops online characters that are bankbois so they are not double-counted.
4. Pass `bankbois` at P/screens/account/MerchantCommerceScreen.tsx:505.

Impact check: the server does not validate owned counts on `exchange-order` (R/coordinator/http/merchant-exchange.ts:97-112, `normalizeExchange` lines 33-48). So the effect is client-side only: Add, Choose→Add and "Exchange all" are wrongly disabled (MerchantCommerceScreen.tsx:522-525, 539, 589). BROKEN stands.

Tags: **blocked-by-bank-dashboard-fetch**, which is a separate dependency from config. Changing the bank poll also affects BankScreen's bankboi packs (out of slice).

### (d) Item details reward navigation: CONFIRMED BROKEN

- **PWA.** The fixed-reward row at P/screens/itemdetail/ItemDetailBrowser.tsx:418 is `onClick={() => onNavigateItem(entry.id, entry.level)}`. `rewards` is filtered by `entry.id === id && entry.level === level` (P/lib/itemFormulas.ts:404), so `entry.id` is always the item being viewed. The click re-navigates to itself, and the "qty ×" prefix is missing.
- **Dashboard.** D/item-exchange-details.tsx:116-125 uses `target(entry.reward).id/.level` and `entry.rewardQuantity || 1`.
- **Fix.** The PWA already has `exchangeTarget` (used at itemFormulas.ts:401), so the fix is one line: `const [rid, rlvl] = exchangeTarget(entry.reward); onNavigateItem(rid, rlvl)` and name `${entry.rewardQuantity ?? 1} × ${entry.name}`.
- **Related small defect (row 63 nuance).** Non-inspectable table results (gold, shells, …) still render as tappable rows that silently no-op (ItemDetailBrowser.tsx:426). The dashboard renders them `disabled` (D/item-exchange-details.tsx:64, 136-138). It is cosmetic; row 63 stays PRESENT.

### (e) Hardcoded Patinder production-recovery button: SAFE TO DELETE

Evidence:
- **What it is.** P/screens/character-detail/sections/MerchantQueueSection.tsx:8-47, 86-96 posts `merchant/production {character:'Patinder', action:'complete', id:'Patinder:1790863565429:zq4qk8ap6o', success:false}` (P/api/partyApi.ts:450-451). It renders whenever `current.reason` contains "upgrade" or "compound".
- **The root cause is fixed in v1.2.0 for the scenario the PWA comment describes** (localStorage journal cleared while the server attempt is still incomplete):
  - The server now persists the client journal on every checkpoint: `checkpointProduction` (R/coordinator/inventory/production.ts:85-94), called from `beginProduction` (line 80) and the `checkpoint` action (line 129).
  - The client re-adopts the server's journal when its own localStorage is empty: C/characters/shared.js:4276-4283 calls `action:"pending"` and then `journal = orphaned.journal; localStorage.setItem(...)`. Recovery then proceeds normally.
  - The dispatcher actively probes the idle merchant with `merchant-production-recover` every 5 s while anything is pending (R/coordinator/merchant/dispatcher.ts:243-262).
- **What is not fixed.** An attempt that has *no* server-side journal (for example, one admitted before the checkpoint protocol) still throws "Production recovery needs review … no local journal" (shared.js:4281). It blocks **all** merchant dispatch, not just production (dispatcher.ts:266 `if (productionHeld()) return;`).
  - The sanctioned way out in v1.2.0 is `action:'resolve-unknown'`, which takes the `id`, `item`, `kind` and a mandatory `reason` (production.ts:122-126, 146-159). It deliberately does not guess success or failure.
  - The PWA button's `complete, success:false` is exactly the guess v1.2.0 avoids.
  - No dashboard UI exists for production. I grepped `resolve-unknown` and `production` under C/dashboard; the only hits are dev/prod-mode files.
- **Why deletion is harmless:**
  - The id is fixed. If that attempt is already completed, `finishProduction` returns early (production.ts:107), so the button "succeeds" and falsely shows "cleared". If the attempt is unknown, the request returns 409 (line 106).
  - It cannot affect any other attempt.
  - In the genuine stuck state the dispatcher holds work, so `current` is normally null and the button would not even render (MerchantQueueSection.tsx:94).
- **Open question.** I could not verify whether the Patinder attempt is still pending without a live query, which I did not make. The user can check the merchant logs for "Production recovery pending; merchant work held" (dispatcher.ts:250) or "needs review".
- **Recommendation.** Delete it. If a replacement is wanted, it goes beyond parity: a generic panel that lists `action:'pending'` (merchant character only) and offers `resolve-unknown` with a required reason, behind a confirm. Do not reuse `complete`.

## Refuted claims

None of the MISSING or UNREACHABLE rows were fully refuted. For each, I grepped P for the endpoint, the state key and the label:
- `upgrade-preview`, `offering` in itempanel, `upgradeOfferingStock`, `update-auto-upgrade-rule` (only `remove`), `buyUpgradeBatch`, `upgradeTiers`
- `markMode` / `Mark multiple`, `exchangeAdd`, `autoExchanges` in markBadge, `'upgrade preview'`

All returned no hits outside the places the report cites.

## Downgraded / upgraded / corrected claims

| Row | Report | Now | Reason |
|---|---|---|---|
| 50 | MISSING | **PARTIAL** | The "potential results" of box and table exchanges can be viewed in the PWA via Catalog → item → Exchange tab: P/screens/account/CatalogScreen.tsx:48 → ItemDetailBrowser.tsx:183, 420-428 (rewards with %). What is missing is the per-tile gear entry point and the "N required per exchange" header in the exchange screen (MerchantCommerceScreen.tsx:536-549 has no info affordance). |
| 46 | BROKEN, fix "add bankbois" | BROKEN, **fix corrected** | See (c). It needs `section=bank&dashboard=1`; core's bankbois carry no items. |
| 29 | PARTIAL | PARTIAL, **with a concrete failure** | P/lib/itemFormulas.ts:152-156 returns `meta.maxLevel` when set. Any compoundable with `maxLevel > 7` makes the PWA offer +8 and above. The server's `validTier` caps at 7 (R/coordinator/inventory/compound-commands.ts:58-60). When the check fails `automatic()` returns `undefined` (line 103), so the command falls through to other handlers instead of saving the rule. The dashboard caps at `Math.min(7, …)` (D/automatic-item-actions.tsx:31). |
| 58 | BROKEN | BROKEN, **severity raised** | The destructive Save under B1 (focus b). This should be a P0 alongside B1. |
| 59 | BROKEN | BROKEN, **scope widened** | The dashboard hides cancel entirely for `fishing` / `mining` jobs and for the current job (D/merchant-card-controls.tsx:120-122, `status === "queued" && reason !== fishing/mining`). The PWA shows cancel on every queued job, including fishing and mining (MerchantQueueSection.tsx:123-133). The PWA also ignores the 404 failure. The dashboard's non-automatic cancel tooltip, "Cancel and undo pending intent" (D/merchant-cancel-job-control.tsx:40), matters: cancelling `manual upgrades` / `manual compounds` / `stat scrolls` wipes the character's `upgrades` / `compounds` / `statScrolls` marks (R/coordinator/http/merchant-control.ts:45-60). The PWA gives no hint of this. |
| 56 | BROKEN | BROKEN, confirmed | See (a). It becomes PRESENT once B1 lands. One residual multi-merchant caveat. |

## PRESENT rows re-verified end to end

| Row | Verdict | Check |
|---|---|---|
| 6 | OK | `buy-copy` body is `{type, character, item}` (P/api/partyApi.ts:206-215; ItemActionPanel.tsx:279). |
| 21-23 | OK | `upgradeOfferingRules` is in core via `offeringPayload` (public-state.ts:115, 286-288). It is not a config field, so it is not blocked by B1. |
| 34 | OK (wiring) | Owner is passed as `character` and the server resolves it with `ruleOwner` (compound-commands.ts:104). Unreachable while the list is empty (B1). |
| 36 | OK | `stat-scroll-mark {slot, statType}` (ItemActionPanel.tsx:276). The same-stat row is disabled, matching the dashboard. |
| 40 | OK | `luckyUpgradeSlots` is not in `configFields`, so it arrives in core. |
| 45 / 47 | OK | Counts are wrong, but that is row 46's problem. |
| 48 | OK | The server matches `entry.reward === line.reward` (merchant-exchange.ts:38). Box entries have no `reward` key (C/characters/shared.js:2013-2019), and the PWA sends `reward: undefined`, which is omitted. Token entries carry `reward` (shared.js:2029), which the PWA sends. Both match. |
| 60 | OK | |
| 61 | OK | |
| 63 | OK | Minor: no `disabled` styling, see (d). |
| 64 | OK | |
| 68 | OK | |

## Confirmed critical claims (one line each)

- B1: `core&dashboard=1` strips every config field (public-state.ts:65-83, 101-105, 257). The PWA never requests `section=config` (PartyDataProvider.tsx:139-146). The other reviewer is verifying this independently.
- B2 / row 56: auto-exchange is a server toggle, and the PWA guard is blind under B1 (merchant-item-commands.ts:57-61; ItemActionPanel.tsx:192).
- B3 / row 58: the legacy `'exchange'` key is dropped by the server (routine-priorities.ts:28-29, 37-41).
- B4 / row 59: cancelling an auto-exchange job deletes the `autoExchanges` keys and disables `'automatic exchange'` with no PWA confirm (merchant-control.ts:67-71; MerchantQueueSection.tsx:127-131).
- B5 / row 46: bankbois are excluded. The fix is corrected per (c).
- B6 / row 62: the reward row navigates to itself (ItemDetailBrowser.tsx:418).
- Row 73: the Patinder button is a hardcoded one-off and safe to delete per (e).

## Missed gaps

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| M1 | Full bankboi inventories via the bank section | D/use-panel-model.ts:60-72; D/query-cache.tsx:174 | `GET state?section=bank&dashboard=1` → `bankbois` (public-state.ts:245) | BROKEN | P/data/PartyDataProvider.tsx:141 (no `dashboard=1`) | Root cause behind row 46. Also affects bank and bankboi views (out of slice). |
| M2 | Merchant job cancel hidden for fishing/mining and for the current job | D/merchant-card-controls.tsx:120-122 | `POST /merchant/job/cancel` | BROKEN | MerchantQueueSection.tsx:123-133 | Cancelling a fishing or mining job can disable that automation via `ports.automated` (merchant-control.ts:71). |
| M3 | Cancel tooltip "Cancel and undo pending intent" (manual upgrade/compound/stat-scroll cancel wipes marks) | D/merchant-cancel-job-control.tsx:40; R/coordinator/http/merchant-control.ts:45-60 | | MISSING | MerchantQueueSection.tsx:126 (`aria-label="Cancel job"` only) | |
| M4 | Job labels via `routineFor` + `routineLabels` (e.g. "Automatic exchange" vs "Manual exchange") | D/merchant-card-controls.tsx:90, 122; R/coordinator/merchant/routines.ts:8-17 | `job.reason`, `job.autoExchangeKeys` | PARTIAL | MerchantQueueSection.tsx:49 (`job.routine ?? job.reason`) | An auto-exchange job shows the raw "exchange". The report mentions this only inside B4 prose; it deserves its own row. |
| M5 | Production recovery visibility ("Production recovery pending; merchant work held" is an error log) | R/coordinator/merchant/dispatcher.ts:243-262 | `merchantActivity` / logs | n/a (no dashboard UI) | | For information. The only signal is in logs. A PWA log viewer that surfaces error-level merchant logs covers this. |
| M6 | Auto-exchange row restricted to the designated merchant (`merchantCharacter`), not any ctype-merchant | D/inventory-panel.tsx:690-691 (`character.name === merchant`) | `merchantCharacter` (config) | PARTIAL | ItemActionPanel.tsx:191 (`isMerchant` from roster ctype) | blocked-by-config-fetch. The same pattern applies to rows 1, 36 and 27. |
| M7 | Compound target cap of 7 | D/automatic-item-actions.tsx:31 | `auto-compound-mark {targetTier ≤ 7}` | BROKEN (edge) | P/screens/itempanel/ItemActionPanel.tsx:393-410 via itemFormulas.ts:152-156 | See row 29 above. |

## Rows tagged blocked-by-config-fetch

These cannot be fixed or verified until `section=config` is fetched and merged:

- **Fully blocked:** 8, 9, 16, 17, 18, 19 (list population), 20, 28, 30, 31, 32, 33, 34, 35, 37, 38, 39, 54, 56, 57, 58, 59 (routine-disabled state display), 67 (reading the current `buyUpgradeBatchSize`).
- **Partly blocked (correct gating needs `merchantCharacter` and/or the current-rule labels):** 1, 2, 13, 14, 27, 29, 36, 53 (existing `autoStandMarks` price), 55, M6.
- **Not blocked by config:**
  - 3-5, 12, 15: offering stock and rules are already in core. The executor is `merchantCharacter`, so it is soft-blocked.
  - 21-25, 40-44, 45, 47-52, 61-66, 68-72.
- **Separate dependency, blocked-by-bank-dashboard-fetch:** 46, M1.

## Dependencies and ordering

1. **P0, B1 config fetch.** Add `state?catalog=0&dashboard=1&section=config` to the parallel poll and spread it in. This immediately un-breaks rows 8/9/16/20/28/31/35/38 (display) and row 56 (guard), and makes RoutinesScreen seeding work.
   - Until it ships, RoutinesScreen Save is destructive. Consider disabling Save when `merchantRoutinePriorities` is empty as a stop-gap.
2. **P0, in the same PR as or right after B1:** replace P/lib/routineLabels.ts with D/routine-labels.tsx + D/automatic-routine-keys.tsx (row 58). Port `routineFor` (R/coordinator/merchant/routines.ts:8-17) so that both the cancel confirm (row 59) and job labels (M4) key off it.
3. **P1, bank poll with `dashboard=1`, then the `inventoryCounts` port with bankbois** (row 46, M1). The model needs `bankbois` typed with `items`.
4. **P1, one-line fixes:** row 62 (`exchangeTarget(entry.reward)`), row 29 / M7 (`Math.min(7, …)`), cancel visibility (M2).
5. **P1, delete the Patinder block** (MerchantQueueSection.tsx:8-47, 86-96) and `completeProductionAttempt` if unused elsewhere. A grep shows MerchantQueueSection is the only caller (P/api/partyApi.ts:437-452).
6. **P2:** rule editing (rows 17/18/32/33) via the existing `AutoRuleGroup`. It depends on B1 for data and on porting `upgradeRuleTiers` / `upgradeRuleQuantity`.
7. **P2:** offering upgrades and the preview panel (rows 3-5), then the exchange workflow (rows 50-55). Rows 53-55 depend on B1 (`autoStandMarks`, `autoNpcSales`, `autoUpgradeMarks`, `autoCompounds`, `autoExchanges`, `autoItemMarks`, `autoDeconstruction` are all config fields).

## Out-of-slice observations

- **Retry button gating.** The PWA shows Retry when `realmBlockedReason` is set (MerchantQueueSection.tsx:110). The dashboard shows it only when `realmRetryExhausted` is set (D/merchant-card-controls.tsx:132-134).
- **Missing job details.** The dashboard also shows per-job `P{priority}`, "Waiting: <deferred reason>", "Retry at <time>" and `pauseReason` (merchant-card-controls.tsx:94-131). The PWA shows none of these.
- **Bank poll side effects.** Adding `dashboard=1` to the PWA bank poll changes the bank-section payload for BankScreen too (bankbois with items). This is beneficial, but the bank auditor should know about it.
