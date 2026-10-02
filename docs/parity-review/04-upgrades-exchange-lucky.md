# 04: Upgrades, compounds, offerings, lucky slots, stat scrolls, exchanges, production

Auditor 04. Both repos were treated as read-only.

Path abbreviations:
- **D** = `scratchpad/console-v1.2.0/dashboard/features/party`
- **DL** = `scratchpad/console-v1.2.0/dashboard/lib`
- **R** = `scratchpad/console-v1.2.0/runtime`
- **P** = `F:/CodingProjects/adventureland-party-mobile/web/src`

## Summary

### Counts
70 features were classified. Row 7 is a PWA-only extra, row 26 is folded into row 25, and row 73 is a note.

| Status | Count | Rows |
|---|---|---|
| PRESENT | 16 | 6, 21, 22, 23, 34, 36, 40, 44, 45, 47, 48, 60, 61, 63, 64, 68 |
| PARTIAL | 17 | 1, 2, 13, 14, 19, 25, 27, 29, 37, 41, 43, 49, 65, 66, 69, 70, 71 |
| BROKEN | 13 | 8, 9, 16, 20, 28, 31, 35, 38, 46, 56, 58, 59, 62 |
| MISSING | 24 | 3, 4, 5, 10, 11, 12, 15, 17, 18, 24, 30, 32, 33, 39, 42, 50, 51, 52, 53, 54, 55, 57, 67, 72 |
| UNREACHABLE | 0 | none |

Several PRESENT rows are correct only in their wiring; in practice they are hidden by B1 (see notes on rows 34 and 56).

### Top 5 most impactful gaps

**1. Root-cause BROKEN: the PWA never fetches the `config` state section.** All state for upgrades, compounds, stat scrolls and auto rules is therefore permanently empty.
- The PWA polls `state?section=core&dashboard=1` (P/data/PartyDataProvider.tsx:140). It never requests `section=config` (grepped `section=config` and `'config'` across P: no hits).
- In v1.2.0, `core` with `dashboard=1` is passed through `omitConfigFields` (R/coordinator/telemetry/public-state.ts:254-258, 101-105). That function deletes every key in `configFields` (public-state.ts:65-79) and `configExtraKeys` (public-state.ts:81-83).
- The deleted keys include `upgrades`, `statScrolls`, `compounds`, `autoCompounds`, `autoExchanges` (line 74), `autoUpgradeMarks` (line 82), `buyUpgradeBatchSize` (line 69), `merchantRoutinePriorities` and `merchantAutomations` (line 73), and `merchantCharacter`, `leader` and `farmingPolicy`.
- The dashboard fetches that section separately: `useDomain("config")` (D/use-party-console.tsx:152) calls `/state?catalog=0&dashboard=1&section=${domain}` (D/query-cache.tsx:174).
- The e2e mock hides this, because it returns every field regardless of section (P/../e2e/fixtures/mockPartyServer.ts:176-202).
- What this breaks:
  - Every upgrade, compound and stat-scroll badge.
  - Every Auto upgrades / Auto compounds rule list, including their Clear-all buttons.
  - The "already marked" guard on Auto exchange.
  - Routine enabled-state and priorities.
- This is also very likely the root cause of the PWA's TEMPORARY "farmingPolicy/leader never updates" diagnostic (P/screens/character-detail/CharacterDetailScreen.tsx:67-79).

**2. Automatic exchange gotcha: unsurfaced and unrecoverable from the PWA.**
- Cancelling a queued automatic exchange job in the PWA (P/screens/character-detail/sections/MerchantQueueSection.tsx:123-133) gives no confirmation.
- The dashboard confirms first: D/merchant-cancel-job-control.tsx:20,41,48-50, which uses `routineFor` to map the job to `'automatic exchange'` (R/coordinator/merchant/routines.ts:8-13).
- The server then deletes the job's `autoExchanges` keys **and** sets `merchantAutomations['automatic exchange']=false` (R/coordinator/http/merchant-control.ts:67-71).
- The PWA cannot see that state (gap 1).
- It also cannot re-enable it. RoutinesScreen still uses the legacy key `'exchange'` (P/lib/routineLabels.ts:24,42; P/screens/account/RoutinesScreen.tsx:113). The server silently ignores any key that is not in `ports.automations` (R/coordinator/http/routine-priorities.ts:37-41).
- The `'manual exchange'` and `'automatic exchange'` rows are missing entirely (dashboard: D/routine-labels.tsx:25-26).

**3. No manual "Upgrade with offering" and no server upgrade-chance preview.**
- The dashboard's upgrade submenu has "Upgrade with Primling / Primordial Essence / Primordial X". It is stock-gated, opens a confirm dialog, and sends `upgrade-mark` with `offering` and `tiers:1` (D/upgrade-actions.tsx:71-76; D/upgrade-offering-controls.tsx:65-120).
- The dashboard also has a live server preview panel that POSTs `/party-api/upgrade-preview`, polls every 2s, and offers "Refresh chances" (D/upgrade-preview-panel.tsx:10-69).
- Neither exists in the PWA. `upgradeOfferingStock` is not modelled at all.

**4. The exchange-rule workflow is largely missing.**
- No per-exchange rules overlay (gear button) showing the potential results of box/table exchanges.
- No "Mark multiple" bulk staging (bank / stand / upgrade→+N / npc).
- No reward-tile automatic actions or banners.
- No nested-exchange drill-down.
- No tap-to-inspect with an "Add" button.
- Dashboard references: D/merchant-commerce-dialog.tsx:85-99, 394-422, 602-711; D/exchange-reward-tile.tsx; D/exchange-mark-controls.tsx; D/party-merchant-commerce-dialog.tsx:26-40.
- The PWA exchange screen is only a catalog list, a cart and a currency chooser (P/screens/account/MerchantCommerceScreen.tsx:465-644).

**5. Auto-rule editing, bank upgrades and the buy-upgrade batch size are missing.**
- Auto upgrade and auto compound rules can only be removed in the PWA. Editing target tiers and remaining quantity (∞ / Completed / N) is missing (dashboard: D/inventory-panel.tsx:1130-1237).
- Bank-item "Mark for upgrade" (withdraw with `upgradeTiers`) and "Auto mark for upgrade" are missing (D/bank-upgrade-actions.tsx; D/party-inventory-panels.tsx:167-171).
- "Maximum number to buy at once for upgrading" (`POST /config {buyUpgradeBatchSize}`) is missing (D/buy-upgrade-batch-setting.tsx).

## Feature table

| # | Feature | Dashboard evidence | Endpoint / state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | Mark for upgrade: tier submenu "+L → +L+t" with scroll gold cost (inventory) | D/upgrade-actions.tsx:52-70; D/inventory-panel.tsx:968-993 | `POST /command {type:'upgrade-mark', character, item, slot, tiers}` → R/coordinator/inventory/upgrade-commands.ts:55-71,172 | PARTIAL | P/screens/itempanel/ItemActionPanel.tsx:240-245, 372-387 | Wiring is correct. The submenu trigger lacks the current-mark suffix "· N tiers" (D:57). The visibility gate uses roster ctype (P:183) instead of `state.merchantCharacter`. |
| 2 | Mark for upgrade on equipped items | D/equip-slot.tsx:123-136; D/inventory-panel.tsx:496-500 | `upgrade-mark {slot:<slotName>, equipped:true, tiers}` | PARTIAL | P/screens/itempanel/ItemActionPanel.tsx:346-351 | Wiring is correct. No current-mark label. |
| 3 | "Upgrade with Primling / Primordial Essence / Primordial X" (disabled without stock) plus "Confirm upgrade" dialog | D/upgrade-actions.tsx:71-76; D/upgrade-offering-controls.tsx:69-91,94-117 | `upgrade-mark {…source, tiers:1, offering}` (server validates stock: upgrade-commands.ts:185-190) | MISSING | none: grepped `offering` in P/screens/itempanel; P/screens/account/OfferingsScreen.tsx:17-22 says it is deliberately not ported | Applies to inventory and equipped items. |
| 4 | Offering stock state (gates #3) | D/connected-inventory.tsx:173 (`state.upgradeOfferingStock`) | `upgradeOfferingStock` (R/coordinator/telemetry/public-state.ts:286-288, sent in core) | MISSING | not in P/models/state.ts (grepped `upgradeOfferingStock`: no hits) | It arrives at runtime through the spread but is untyped and unused. |
| 5 | Server upgrade preview panel | D/upgrade-preview-panel.tsx:10-69 | `POST /party-api/upgrade-preview {character, slot, item, refresh}` (R/coordinator/merchant/upgrade-preview.ts:19-38,64) | MISSING | grepped `upgrade-preview`, `previewOptions`: none | Shows "Next attempt +L→+L+1", executor, a status line (queued / running / unavailable / partial / complete / invalidated), per-option % chance with observed time, "Refresh chances", and the lucky-slot disclaimer. |
| 6 | "Buy another level 0" (non-merchant holder, buyable) | D/upgrade-actions.tsx:105-107; D/inventory-panel.tsx:976,984 | `buy-copy` → R/coordinator/inventory/merchant-item-commands.ts:79-83 | PRESENT | P/screens/itempanel/ItemActionPanel.tsx:189,279 | |
| 7 | Equipment "Buy copy" | none: D/equip-slot.tsx:123 omits `allowBuy` (default false, D/upgrade-actions.tsx:28) | `buy-copy` | EXTRA (not in dashboard) | P/screens/itempanel/ItemActionPanel.tsx:362 | Inverted relative to the dashboard: the PWA shows it only for the merchant. |
| 8 | Inventory upgrade banner "+L → +T" / "Auto → +T" | D/inventory-panel.tsx:648-653,696 | `state.upgrades[char]` (config section) | BROKEN | P/lib/markBadge.ts:26-30,58-59; P/screens/character-detail/CharacterDetailScreen.tsx:170 | The code is right, but `upgrades` is never fetched (gap 1). |
| 9 | Equipment upgrade / stat banner | D/equip-slot.tsx:62-65 | `state.upgrades`, `state.statScrolls` | BROKEN | P/screens/character-detail/sections/EquipmentSection.tsx:101; CharacterDetailScreen.tsx:161 | Same cause. Equipped stat-scroll marks are also passed as `[]`. |
| 10 | Bank item "Mark for upgrade" (tier submenu) | D/bank-upgrade-actions.tsx:5-14; D/bank-sheet.tsx:636,1121; D/party-inventory-panels.tsx:168 | `POST /command {type:'withdraw', pack, slot, item, markAll:false, upgradeTiers}` (D/bank-withdrawal.tsx:33-36; R/coordinator/inventory/transfer-commands.ts:128-160) | MISSING | P/api/partyApi.ts:238-242 (`withdrawFromBank` has no `upgradeTiers`); grepped `upgrade` in P/screens/account/BankScreen.tsx: none | Includes bankboi packs. |
| 11 | Bank item "Auto mark for upgrade" | D/party-inventory-panels.tsx:169 | `auto-upgrade-mark {slot:-1, item, tiers}` | MISSING | BankScreen: none | |
| 12 | Bank upgrade "Add upgrade rule" | D/upgrade-actions.tsx:100 (via D/bank-upgrade-actions.tsx) | opens offering-rule dialog | MISSING | none | |
| 13 | Auto mark for upgrade (inventory), current tier disabled, label "· N tiers" | D/upgrade-actions.tsx:83-98; D/inventory-panel.tsx:985-991 | `auto-upgrade-mark {slot, tiers}` → upgrade-commands.ts:94-110 | PARTIAL | P/screens/itempanel/ItemActionPanel.tsx:246-249 | Wiring is correct. The current tier is neither shown nor disabled, and `autoUpgradeMarks` is not fetched anyway. |
| 14 | Auto mark for upgrade (equipped) | D/equip-slot.tsx:128-134 | `auto-upgrade-mark {slot, equipped:true, tiers}` | PARTIAL | P/screens/itempanel/ItemActionPanel.tsx:352-359 | Same as 13. |
| 15 | "Add upgrade rule" from the item's auto submenu (dialog prefilled with this item) | D/upgrade-actions.tsx:99-101; D/upgrade-offering-controls.tsx:72-75 | `upgrade-offering-rule {rule}` | MISSING | none in ItemActionPanel | Only the global search-based form exists (row 25). |
| 16 | "Auto upgrades" list: every owner's rules, sprite with "+L → +T" strip, owner detail, count | D/inventory-panel.tsx:1130-1180, 334-377 | `state.autoUpgradeMarks` (config extra key) | BROKEN | P/screens/character-detail/sections/AutoMarksSection.tsx:70-80,107 | Never populated (gap 1). Even when populated, it would not show the target, tiers or remaining quantity (shows only "+L"). |
| 17 | Edit auto-upgrade target tiers (inline input, Enter / Escape / blur, validation 1..13-L) | D/inventory-panel.tsx:1145-1157, 385-462 | `update-auto-upgrade-rule {ruleKey, tiers}` → upgrade-commands.ts:139-155 | MISSING | grepped `update-auto-upgrade-rule` in P: only remove (P/api/partyApi.ts:427-429) | |
| 18 | Edit auto-upgrade remaining quantity (-1 = ∞, 0 = "Completed") | D/inventory-panel.tsx:1158-1170 | `update-auto-upgrade-rule {ruleKey, quantity}` | MISSING | none | |
| 19 | Remove one auto-upgrade rule (two-click "Really?") | D/inventory-panel.tsx:1172-1176, 464-478 | `update-auto-upgrade-rule {ruleKey, remove:true}` | PARTIAL | P/api/partyApi.ts:427-429; AutoMarksSection.tsx:148-158 | Wiring matches. No per-item confirm. Errors are ignored (no `result.kind` check). |
| 20 | Clear all auto upgrades ("Really?") | D/inventory-panel.tsx:301-321,532 | `clear-auto-upgrades` (merchant only) → R/coordinator/inventory/compound-commands.ts:121-131 | BROKEN | AutoMarksSection.tsx:96,161-184 | The button renders only when the list is non-empty, and it is always empty (gap 1). |
| 21 | Upgrade (offering) rules list: item, range, offering icon and label, Required / When available, count | D/upgrade-offering-controls.tsx:122-160; D/inventory-panel.tsx:1181 | `state.upgradeOfferingRules` (core payload via offeringPayload) | PRESENT | P/screens/account/OfferingsScreen.tsx:54-76; navigation P/App.tsx:57, P/screens/character-detail/AccountMenu.tsx:19 | Moved to its own screen. |
| 22 | Edit offering rule | D/upgrade-offering-controls.tsx:156 | `upgrade-offering-rule {rule:{id,…}}` → R/coordinator/inventory/upgrade-offerings.ts:15-33 | PRESENT | OfferingsScreen.tsx:67-69,200 | |
| 23 | Remove offering rule | D/upgrade-offering-controls.tsx:38-41,157 | `upgrade-offering-rule {rule:{id}, remove:true}` | PRESENT | OfferingsScreen.tsx:36-42; P/api/partyApi.ts:666-668 | Silently no-ops when no ctype-merchant character is online (P:37). |
| 24 | Clear all offering rules (two-click) | D/upgrade-offering-controls.tsx:42-47,142-149 | loops `remove` | MISSING | OfferingsScreen: none | |
| 25 | Add offering rule dialog (From / To selects, offering select, Required / Only-if-available radios, client overlap validation) | D/upgrade-offering-controls.tsx:76-80,101-114 | `upgrade-offering-rule {rule}` | PARTIAL | OfferingsScreen.tsx:90-213 | No client-side overlap check or `ceiling>max` message (the server still 409s). The item must be found by search instead of right-clicking the item. |
| 26 | (folded into 25) | | | | | |
| 27 | "Mark for compounding" (hidden once grouped) | D/inventory-panel.tsx:994-1005 | `compound-mark {slot}` → compound-commands.ts:80-100 | PARTIAL | ItemActionPanel.tsx:252-254 | No grouped check (compounds state is never fetched). |
| 28 | Compound group banner "+L → +L+1" | D/inventory-panel.tsx:661-663,697 | `state.compounds` (config) | BROKEN | P/lib/markBadge.ts:60-64 | Gap 1. |
| 29 | Auto compound submenu: tiers L+1..min(7,max), `compoundPassCost` gold per tier, trigger label "Auto compound to +N" | D/automatic-item-actions.tsx:44-54; DL/compound-cost.ts | `auto-compound-mark {targetTier}` → compound-commands.ts:101-119 | PARTIAL | ItemActionPanel.tsx:255-263, 393-410 | Cost and wiring match. Not capped at 7 (P:394 uses `itemMaximumLevel`). No current-rule label. The row still shows when L ≥ max. |
| 30 | Auto compound pending banner "Auto compound → +N" | D/inventory-panel.tsx:664-668,699 | `state.autoCompounds` | MISSING | P/lib/markBadge.ts (no auto-compound case) | |
| 31 | "Auto compounds" list (owner, target) | D/inventory-panel.tsx:1182-1237 | `state.autoCompounds` (config) | BROKEN | AutoMarksSection.tsx:82-89,108 | Gap 1. No quantity display. |
| 32 | Edit auto-compound target (1-7) | D/inventory-panel.tsx:1193-1206 | `auto-compound-mark {name},{targetTier}` | MISSING | none | |
| 33 | Edit auto-compound quantity (∞ / Completed / N) | D/inventory-panel.tsx:1207-1226 | `auto-compound-mark {targetTier, quantity}` | MISSING | none | |
| 34 | Remove auto compound | D/inventory-panel.tsx:1228-1234 | `auto-compound-mark {targetTier, remove:true}` | PRESENT (wiring) | P/api/partyApi.ts:433-435 | Unreachable in practice because the list is empty (gap 1). No confirm. |
| 35 | Clear all auto compounds | D/inventory-panel.tsx:531 | `clear-auto-compounds` | BROKEN | AutoMarksSection.tsx:97 | Same as 20. |
| 36 | Stat scroll submenu (merchant inventory, `definition.stat`): purchasable STR/INT/DEX/VIT with "Xg · N scrolls", others only if owned ≥ required ("owned/required"), current disabled | D/inventory-panel.tsx:875-920; D/stat-scrolls.tsx; D/stat-scroll-quantity.tsx; D/primary-stat-scroll-cost.tsx | `stat-scroll-mark {slot, statType}` → R/coordinator/inventory/stat-scroll-commands.ts:145-171 | PRESENT | ItemActionPanel.tsx:186,266-278,417-454; P/lib/itemFormulas.ts:204-241 | Inventory counts come from the ctype-merchant character instead of `merchantCharacter` (P:71). |
| 37 | Stat scroll trigger shows a pending mark "Stat scroll: STR" | D/inventory-panel.tsx:879-880 | `state.statScrolls` | PARTIAL | ItemActionPanel.tsx:268 (shows only the existing `stat_type`) | |
| 38 | Stat scroll banner | D/inventory-panel.tsx:654-660,695 | `state.statScrolls` (config) | BROKEN | P/lib/markBadge.ts:56-57 | Gap 1. |
| 39 | Equipped stat-scroll banner | D/equip-slot.tsx:63 | `state.statScrolls` | MISSING | EquipmentSection.tsx:101 passes `[]` | |
| 40 | Lucky slot summary ("Verified slot" / "Next upgrade will test… slot N (inventory position N+1)") | D/lucky-slot-tracker.tsx:13-15 | `luckyUpgradeSlots`, `luckySlotTracking` (publicStateFields, R/coordinator/telemetry/public-state-types.ts:70-71, so present in core) | PRESENT | P/screens/character-detail/sections/LuckySlotSection.tsx:82-103; P/lib/luckySlot.ts | `luckySlotSearch` is ported verbatim. |
| 41 | Lucky statistics dialog: rolls, average, ">0.963 count (pct)", "Zero rolls count (pct)", status, sampled count, inference text, explanatory paragraphs, Close | D/lucky-slot-tracker.tsx:16-36 | same | PARTIAL | LuckySlotSection.tsx:107-170 | Percent only, without counts (P:160-161). Drops the "Normal upgrade jobs rotate… No extra upgrades are queued" paragraph, the "published server model" wording and the dialog description. |
| 42 | Lucky slot outline on the merchant's physical inventory grid, tooltip, menu ("Show lucky slot data" / "Show item details"), empty-slot clickable | D/inventory-panel.tsx:214-217,580-591,716-724,759; D/lucky-slot-menu.tsx; D/lucky-upgrade-slot.tsx | derived | MISSING | P/screens/character-detail/sections/InventorySection.tsx:207-233 (no lucky marker) | |
| 43 | Merging the live local evidence stream (`char.luckySlotTracking`) into the aggregate | D/connected-inventory.tsx:51-54; R/lucky-slot-tracking.ts:48-62 | status stream | PARTIAL | P/lib/luckySlot.ts:5-24 (persisted streams only) | Acknowledged in the PWA comment. |
| 44 | Verified-slot validation 0..41 | D/lucky-upgrade-slot.tsx:8-10 | | PRESENT | LuckySlotSection.tsx:86 (`!= null`) | Looser check; fine for real data. |
| 45 | Exchange catalog: search, tile shows "N required · M owned", Add disabled when not enough owned | D/merchant-commerce-dialog.tsx:361-425 | `merchantCatalog.exchangeable` | PRESENT | P/screens/account/MerchantCommerceScreen.tsx:527-553 | |
| 46 | Exchange owned counts include bankboi storage | D/merchant-commerce-dialog.tsx:130-139 (`inventoryCounts(merchants, bank, bankbois, true)`); DL/account-inventory.ts | `bankbois` | BROKEN | P/screens/account/MerchantCommerceScreen.tsx:498-505; P/lib/inventoryCounts.ts:3-9 | No bankbois: under-counts and wrongly disables Add / "Exchange all" when currency sits in bankboi storage (the server sources it: R/coordinator/http/merchant-exchange.ts:72-80). |
| 47 | Currency grouping, "Choose", choices panel with currency icon "× N" and Add (disabled by running total) | D/merchant-commerce-dialog.tsx:152-162, 636-661 | | PRESENT | MerchantCommerceScreen.tsx:438-463, 580-619 | The PWA closes the chooser after Add; the dashboard keeps it open. |
| 48 | Exchange cart: per-line quantity, "uses N currency", ×reward qty, remove, "Exchange all" | D/merchant-commerce-dialog.tsx:427-554, 296-332; D/use-party-console.tsx:561 | `POST /merchant/exchange-order {exchanges:[{id,quantity,level,reward}]}` → R/coordinator/http/merchant-exchange.ts:98-112; R/coordinator/http/registration.ts:237 | PRESENT | MerchantCommerceScreen.tsx:121-139, 555-578; P/api/partyApi.ts:383-387 | |
| 49 | Missing-materials error detail " · id +L: R required, A available" | D/merchant-commerce-dialog.tsx:323-327 | `error.details.missing` | PARTIAL | P/api/partyApi.ts:83-94 (only `error` is parsed) | |
| 50 | Exchange rules overlay (gear on every tile): header, "N required per exchange", "Potential results" grid with % | D/merchant-commerce-dialog.tsx:412-413, 602-711 | | MISSING | MerchantCommerceScreen.tsx:620-638 shows results only inside the currency chooser; non-choice (box/table) rows have no way to view results | |
| 51 | Tap an exchange tile to open item details with an "Add" button | D/merchant-commerce-dialog.tsx:392-396; D/party-merchant-commerce-dialog.tsx:54-64; D/item-details.tsx:748-749 | `selected.exchangeAdd` | MISSING | ItemRow has no tap handler (MerchantCommerceScreen.tsx:166-193) | |
| 52 | Nested exchange drill-down (a result that is itself an exchange opens that table) | D/merchant-commerce-dialog.tsx:685-688 | | MISSING | none | |
| 53 | "Mark multiple" bulk staging: Bank / Stand / Upgrade (target +1..+13) / NPC modes, staged "Pending", "N pending changes. Done saves; closing discards.", stand-price note, error | D/merchant-commerce-dialog.tsx:76-99, 616-633; D/exchange-mark-controls.tsx; D/party-merchant-commerce-dialog.tsx:26-40 | per draft: `auto-item-mark {mode:'bank', action:'set'}`, `auto-upgrade-mark {slot:-1, tiers:target-level}`, `POST /merchant/auto-npc-sale {item}`, `POST /merchant/auto-stand {item, price}` | MISSING | grepped `markMode`, `Mark multiple`: none | |
| 54 | Reward-tile banner (Auto exchange / Auto sell to NPC / Auto stand / Auto upgrade → +N / Auto compound → +N / Auto deconstruction / "Auto bank (default)") and quantity badge | D/exchange-reward-tile.tsx:21-68 | autoExchanges, autoNpcSales, autoStandMarks, autoUpgradeMarks, autoCompounds, autoDeconstruction, autoItemMarks | MISSING | none | |
| 55 | Reward-tile context menu (Auto bank, Auto stand…, Auto exchange, Auto upgrade tiers, Auto compound tiers, Auto sell to NPC…) for prospective items | D/exchange-reward-tile.tsx:69-79; D/automatic-item-actions.tsx | `auto-exchange {slot:-1}` (R/coordinator/inventory/merchant-item-commands.ts:71) and the others | MISSING | none | Also rendered in item details (D/party-item-details.tsx:35). |
| 56 | "Auto exchange" on a merchant inventory item (disabled when already marked) | D/automatic-item-actions.tsx:39-41; D/inventory-panel.tsx:669-671,690-691,921-927 | `auto-exchange {slot}`; **a server toggle**: deletes the key if present (R/coordinator/inventory/merchant-item-commands.ts:50-63) | BROKEN | ItemActionPanel.tsx:190-192, 281-286 | The guard reads `dynamicState.autoExchanges`, which is never fetched (gap 1). So the row always says "Auto exchange", and tapping it on an already-marked item **silently removes** the rule. |
| 57 | "Auto exchange" banner on inventory | D/inventory-panel.tsx:703 | `autoExchanges` | MISSING | P/lib/markBadge.ts (no case) | |
| 58 | Automatic exchange routine enable toggle and priority; Manual exchange priority | D/routine-labels.tsx:25-26; D/automatic-routine-keys.tsx:10 | `POST /merchant/routine-priorities {priorities, enabled}`; keys `'automatic exchange'`, `'manual exchange'` (R/coordinator/merchant/initial-settings.ts:61,88) | BROKEN | P/lib/routineLabels.ts:24,42; P/screens/account/RoutinesScreen.tsx:113 | The PWA sends the legacy `'exchange'`, which the server ignores (R/coordinator/http/routine-priorities.ts:28-29,37-41). The toggle state also cannot be read (gap 1). |
| 59 | Cancelling an auto-exchange job confirms "Canceling this job will also disable this routine until you re-enable it in Routines." | D/merchant-cancel-job-control.tsx:20-63; D/merchant-card-controls.tsx:123 | `POST /merchant/job/cancel {id}` → R/coordinator/http/merchant-control.ts:67-82 | BROKEN | P/screens/character-detail/sections/MerchantQueueSection.tsx:123-133 | No confirm, no warning. The disabled state is never surfaced and cannot be undone from the PWA (rows 58, gap 1). The same applies to the auto upgrade / auto compound routines. |
| 60 | Clear marks removes the auto-exchange rule | D/inventory-panel.tsx:1066-1068 | `clear-item-marks` (R/coordinator/inventory/clear-item-marks.ts:108-116) | PRESENT | ItemActionPanel.tsx:318 | |
| 61 | Item details "Exchange price" (currency × required, "for N") | D/item-exchange-details.tsx:82-101 | | PRESENT | P/screens/itemdetail/ItemDetailBrowser.tsx:391-405; P/lib/itemFormulas.ts:398-416 | |
| 62 | Item details fixed-reward row: "qty × reward name" opens the **reward** item | D/item-exchange-details.tsx:115-126 (`target(entry.reward).id/level`, `rewardQuantity`) | | BROKEN | ItemDetailBrowser.tsx:418-419 calls `onNavigateItem(entry.id, entry.level)`, which is the current currency item itself; the quantity is omitted | |
| 63 | Item details table rewards with chance %, non-inspectable kinds disabled | D/item-exchange-details.tsx:127-142 | | PRESENT | ItemDetailBrowser.tsx:420-428 | Dashboard tiles also carry the automatic actions (row 55). |
| 64 | "Reward in" sources (summed chance) | D/item-exchange-details.tsx:42-47,158-169 | | PRESENT | ItemDetailBrowser.tsx:435-451 | |
| 65 | "Rewards" heading for boxes; cosmo / sixcake footnotes; npc name | D/item-exchange-details.tsx:105,146-155 | | PARTIAL | ItemDetailBrowser.tsx:409 (always "Exchange reward"; no footnotes) | |
| 66 | Exchange sections follow the preview-level slider | D/item-details.tsx:705 (`level={previewLevel}`) | | PARTIAL | ItemDetailBrowser.tsx:125 (uses `target.level`) | |
| 67 | Buy-upgrade batch size setting (1-42, Apply, error) | D/buy-upgrade-batch-setting.tsx:7-24; D/merchant-collection-settings.tsx:36 | `POST /config {buyUpgradeBatchSize}`; `state.buyUpgradeBatchSize` (config) | MISSING | grepped `buyUpgradeBatch`: none; P/api/partyApi.ts:541-546 only sends threshold fields | |
| 68 | Buy cart target level for upgradeable items | D/merchant-commerce-dialog.tsx:455-469, 302-314 | `POST /merchant/order {buys:[{id,quantity,level,budget,maxAttempts}]}` | PRESENT | MerchantCommerceScreen.tsx:61-64, 272-282 | The server overwrites budget/attempts (R/coordinator/http/merchant-order.ts:43-51), so omitting them is fine. |
| 69 | "90% budget: N base items · k scrollG" estimate and "Gold (est)" total | D/merchant-commerce-dialog.tsx:208-233, 478-489, 526-528; D/upgrade-estimate.tsx | | PARTIAL | MerchantCommerceScreen.tsx:15-25,235,289 (scope cut on purpose; total is plain cost×qty) | |
| 70 | Level-preview property math (`propertiesAtLevel`: union of actual, preview and reported keys; keeps non-numeric reported values; preview-only `stat_type`) | D/properties-at-level.tsx:6-39 | | PARTIAL | P/lib/itemFormulas.ts:134-147 | Keys only from calculated sets: properties that exist only in server `meta.properties` vanish. The same `statType` is applied to both actual and preview. |
| 71 | Catalog comparison A/B/C… with per-column preview-level slider and stat-scroll select | D/catalog-comparison.tsx:17-99 | | PARTIAL | P/screens/itempanel/GearComparisonSheet.tsx:41-47,132,147-150 (two-way vs equipped only) | Mostly out of slice (catalog auditor). |
| 72 | Routine label "Refresh upgrade chances" (upgrade-preview job priority) | D/routine-labels.tsx:17 | `'upgrade preview'` | MISSING | P/lib/routineLabels.ts (absent) | |
| 73 | Production attempts (`/merchant/production`) | No dashboard UI (grepped `production` in D: only dashboard-mode-control) | R/coordinator/inventory/production.ts:115-137 | n/a (note) | P/screens/character-detail/sections/MerchantQueueSection.tsx:8-47,94-96 | The PWA ships a **hardcoded one-off** "Clear stuck production attempt" for `Patinder:1790863565429:zq4qk8ap6o`. It shows whenever the current job reason contains "upgrade" or "compound" and posts `complete, success:false`. It is not parity and should be removed. |

## BROKEN details

### B1. Config section never fetched (affects rows 8, 9, 16, 20, 28, 31, 35, 38, 56, 58, 59)

PWA poll (P/data/PartyDataProvider.tsx:139-144):
```ts
api.get('state?section=core&dashboard=1'),
api.get('state?section=bank'),
api.get('state?section=market'),
api.get('state?catalog=0&dashboard=1&section=logs'),
```

Server (R/coordinator/telemetry/public-state.ts:254-258, 101-105):
```ts
config: () => configPayload(state, ports),
core: () => request.query?.dashboard !== "1" ? corePayload(...) : omitConfigFields({...fullPayload(state, ports, true, true), ...})
...
function omitConfigFields(payload) { for (const key of configFields) delete payload[key]; for (const key of configExtraKeys) delete payload[key]; ...}
```

`configFields` (lines 65-79) includes `upgrades, statScrolls, compounds, autoCompounds, autoExchanges, buyUpgradeBatchSize, merchantRoutinePriorities, merchantAutomations, merchantCharacter, leader, farmingPolicy, marked, merchantMarked, autoItemMarks, …`. `configExtraKeys` (line 82) includes `autoUpgradeMarks`.

The dashboard fetches it separately: D/query-cache.tsx:174 and D/use-party-console.tsx:152 `useDomain("config")`.

Fix: add `api.get('state?catalog=0&dashboard=1&section=config')` to the parallel poll and spread it in.

### B2. Auto exchange toggle silently removes rules (row 56)

PWA (P/screens/itempanel/ItemActionPanel.tsx:192,284):
```ts
const autoExchangeMarked = isMerchant && !!dynamicState.autoExchanges[`${item.name}@${level}`]   // always {} (B1)
onClick={() => !autoExchangeMarked && run(() => api.itemCommand('auto-exchange', characterName, item, slot))}
```

Server (R/coordinator/inventory/merchant-item-commands.ts:57-59):
```ts
if (state.autoExchanges[key]) delete state.autoExchanges[key];
else { ...; state.autoExchanges[key] = { name: item.name, level }; }
```

### B3. Automatic-exchange routine key (row 58)

PWA: P/lib/routineLabels.ts:24 `exchange: 'Exchange'` and :42 `'exchange'`. P/screens/account/RoutinesScreen.tsx:113 sends `enabled` built from these keys.

Server: R/coordinator/http/routine-priorities.ts:28-29 skips unknown priority keys (`if (!(reason in ports.priorities)) continue;`). Lines 37-41 only apply known automation keys.

The valid keys are `'manual exchange'` and `'automatic exchange'` (R/coordinator/merchant/routines.ts:43-50; D/routine-labels.tsx:25-26). The PWA labels are also missing `deliveries`, `withdrawals` and `upgrade preview` (D/routine-labels.tsx:7-8,17).

### B4. Cancelling an automatic job (row 59)

PWA: P/screens/character-detail/sections/MerchantQueueSection.tsx:127-131 posts `merchant/job/cancel` immediately.

Dashboard: D/merchant-cancel-job-control.tsx:20,41 opens a confirm dialog when `automaticRoutineKeys.has(routineFor(job))`. `routineFor` maps an exchange job with `autoExchangeKeys` to `'automatic exchange'` (R/coordinator/merchant/routines.ts:8-13).

Server side effect: R/coordinator/http/merchant-control.ts:68-71 deletes the job's `autoExchanges` keys and sets `merchantAutomations['automatic exchange'] = false`. Other automatic reasons (auto upgrade, auto compound, …) also get disabled via `ports.automated`.

The PWA also labels jobs with the raw routine key (`jobLabel` = `job.routine ?? job.reason`, MerchantQueueSection.tsx:49) instead of `routineLabels[routineFor(job)]`.

### B5. Exchange owned counts exclude bankbois (row 46)

- Dashboard (D/merchant-commerce-dialog.tsx:130-139): `inventoryCounts(characters.filter(ctype==='merchant'), bank, bankbois, true)`.
- PWA (P/screens/account/MerchantCommerceScreen.tsx:505): `inventoryCounts(merchantOnly, bank, true)`. P/lib/inventoryCounts.ts has no bankbois source.
- `bankbois` is not in P/models/state.ts. It is sent in core as summaries (R/coordinator/telemetry/public-state.ts:153).

### B6. Item-details fixed reward navigates to itself (row 62)

- Dashboard (D/item-exchange-details.tsx:116-125): `row(entry.key, target(entry.reward).id, entry.name, entry.rewardQuantity || 1, entry.sprite, '100%', target(entry.reward).level, …)`.
- PWA (P/screens/itemdetail/ItemDetailBrowser.tsx:418): `<RelatedItemRow name={entry.name} … onClick={() => onNavigateItem(entry.id, entry.level)} />`. `entry.id` is the currency, i.e. the item already being viewed.

## Reuse opportunities

Pure logic that can be ported nearly verbatim:
- **Already ported:**
  - `upgradeScrollCost`, `compoundPassCost`, `statScrollQuantity`, `primaryStatScrollCost`, `STAT_SCROLLS` (minus `multiplier`, kept separately), `itemMaximumLevel`, `exchangeSections`, `rewardPercentage`, all in P/lib/itemFormulas.ts.
  - `luckySlotSearch`, `slotLogEvidence`, `aggregateSlotTracking`, in P/lib/luckySlot.ts.
  - To keep the lucky port honest, add the local-stream merge from R/lucky-slot-tracking.ts:48-62 (`mergeSlotStream` / `normalizeSlotTracking`).
- **Not yet ported, pure:**
  - `upgradeEstimate` and its cache (D/upgrade-estimate.tsx, D/upgrade-estimate-cache.tsx): deterministic seeded Monte Carlo, no React. Needed for row 69 and for suggested prices.
  - `upgradeRuleTiers` and `upgradeRuleQuantity` (D/upgrade-rule-tiers.tsx, D/upgrade-rule-quantity.tsx), for rows 16-18.
  - `propertiesAtLevel` (D/properties-at-level.tsx), which should replace `previewProperties` (row 70).
  - `upgradeOfferings`, `offeringOverlap`, `offeringRule`, `previewOptions` (R/upgrade-offerings.ts, R/upgrade-preview.ts). The PWA already has `UPGRADE_OFFERING_LABELS` (P/models/state.ts:617-622) and could add `offeringOverlap` for client validation.
  - `routineFor` and `routineEnabled` (R/coordinator/merchant/routines.ts:8-24), to label jobs and decide when a cancel needs confirmation.
  - `automaticRoutineKeys` and `routineLabels` (D/automatic-routine-keys.tsx, D/routine-labels.tsx). Replace P/lib/routineLabels.ts wholesale.
  - `inventoryCounts` with bankbois (DL/account-inventory.ts).
  - `physicalInventory` and `validLuckySlot` (D/lucky-upgrade-slot.tsx).
- **Existing PWA helpers to extend:**
  - `markBadgeFor` (P/lib/markBadge.ts): add auto-compound-pending, auto-exchange, stand and auto-stand cases. Item-action-banner priority is in D/item-action-banner.
  - `AutoRuleGroup` (AutoMarksSection.tsx:117): add an `edits` array like the dashboard's `automaticSection` (D/inventory-panel.tsx:258-274), plus per-item confirm and error display.
  - `withdrawFromBank` (P/api/partyApi.ts:238): add an optional `upgradeTiers`.
  - `setThresholds` (P/api/partyApi.ts:541): add `buyUpgradeBatchSize`.
  - `UpgradeTierPicker` (ItemActionPanel.tsx:372): take `currentTiers` to disable or label it, and add offering rows plus an embedded preview.

## Out-of-slice observations

1. **B1 affects far more than this domain.** `leader`, `farmingPolicy`, `merchantCharacter`, `marked`, `merchantMarked`, `autoItemMarks`, `merchantDeliveries`, `standListings`, `npcSaleMarks`, `deconstructionMarks`, `autoDeconstruction`, `autoNpcSales`, `autoStandMarks`, `standBids`, `goldTargets`, `restockPolicies`, `threshold`, `itemCollectionThreshold`, `monsterFocus*`, `huntBlacklist`, `huntSettings` and more are all stripped from `core&dashboard=1`. This matches the PWA's TEMPORARY "farmingPolicy/leader never updates" diagnostic (CharacterDetailScreen.tsx:67-79).
2. **RoutinesScreen is destructive under B1.**
   - `merchantRoutinePriorities` is never populated, so the seeding guard (RoutinesScreen.tsx:30-36) never fires and the draft stays `{}`.
   - "Save routines" then posts every priority as 50 (line 112) and every automatic routine as enabled (line 113).
   - That overwrites the user's real priorities and re-enables any routine they disabled on the dashboard.
3. The PWA equipment panel offers "Buy copy" for the merchant (ItemActionPanel.tsx:362). The dashboard never offers buy on equipped items.
4. The PWA inventory grid is positional for all characters (InventorySection.tsx:210). The dashboard compacts it for non-merchants (D/inventory-panel.tsx:582; D/compact-inventory.tsx).
5. Per-character vs shared rule owner: the dashboard uses `ruleName = state.merchantRules ? merchantCharacter : name` for autoItemMarks and autoDeconstruction (D/connected-inventory.tsx:47,186,195). PWA AutoMarksSection always uses `characterName` (AutoMarksSection.tsx:42,52).
6. The hardcoded Patinder production recovery (MerchantQueueSection.tsx:8-47,94-96) should be deleted. The dashboard has no production UI. If recovery is needed, it should be generic, use `action:'inspect'` / `'pending'` (R/coordinator/inventory/production.ts:116-125), and be gated on a real pending attempt.
7. AutoMarksSection's remove and clear-all handlers ignore `ApiResult` failures (AutoMarksSection.tsx:152-155,168-172), so errors are never shown.
