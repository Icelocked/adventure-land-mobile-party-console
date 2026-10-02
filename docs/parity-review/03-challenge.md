# 03: Adversarial challenge of the Inventory / Items / Equipment report

Reviewer 03. Paths are abbreviated as follows:
- `D:` = `console-v1.2.0/dashboard/features/party/`
- `R:` = `console-v1.2.0/runtime/coordinator/`
- `S:` = `console-v1.2.0/characters/shared.js`
- `P:` = `adventureland-party-mobile/web/src/`
- `E:` = `adventureland-party-mobile/web/e2e/`

I fully re-read these dashboard files: inventory-panel.tsx, connected-inventory.tsx, automatic-item-actions.tsx, upgrade-actions.tsx, equip-slot.tsx, equipment.tsx, item-actions.ts, clear-item-marks.tsx, merchant-visit-control.tsx, item-action-banner.ts and character-travel-dialog.tsx. I also re-read the relevant parts of use-party-console.tsx.

On the server side I read:
- R:http/automatic-sales.ts
- R:http/stand-marks.ts
- R:http/npc-sale.ts
- R:navigation/manual-commands.ts
- R:merchant/player-npc-sales.ts and R:merchant/automatic-sales.ts
- R:inventory/automatic-action.ts and R:inventory/shared-rules.ts
- R:merchant/deconstruction.ts
- R:telemetry/public-state.ts, public-state-characters.ts and dashboard-stream.ts
- R:inventory/transfer-commands.ts

On the PWA side I read in full: ItemActionPanel.tsx, AutoMarksSection.tsx, EquipmentSection.tsx, InventorySection.tsx, TravelSection.tsx, CharacterDetailScreen.tsx, PartyDataProvider.tsx (lines 40-200), partyApi.ts (lines 190-520), markBadge.ts, GearComparisonSheet.tsx (header) and the E:fixtures/mockPartyServer.ts handlers.

## Verdicts on the five focus points

| Focus | Verdict | Evidence |
|---|---|---|
| (a) Auto NPC-sale on the merchant stores a per-player rule, and the e2e mock hides it | **CONFIRMED, and worse than reported** | See section "B1" under Confirmed critical claims |
| (b) NPC sale and stand listing hard-code quantity 1; an empty price becomes 0 | **CONFIRMED** | P:api/partyApi.ts:254 (`quantity = 1`), :273 (`quantity = 1`). The callers never pass a quantity: P:ItemActionPanel.tsx:227, 232, 484. An empty price becomes `Number('')\|\|0` at P:ItemActionPanel.tsx:471 and 484. The server rejects it: `validPrice` requires price >= 1 (R:http/stand-marks.ts:17-26, 66-68 → 400 "invalid stand price or quantity"). Auto-stand requires the same (R:http/automatic-sales.ts:90). Contrast: the PWA's own BankScreen sends `quantity: entry.item.q` (P:screens/account/BankScreen.tsx:445), so the inventory path is the odd one out |
| (c) "Go home" and "Send merchant to…" behave differently from the dashboard | **CONFIRMED.** The auditor's PWA line numbers are wrong | P:TravelSection.tsx has only 63 lines. The auditor cites :217-248 and :220-223. The real lines are :28-34 ("Send merchant to..." toggles the travelPlaces list; "Go home" calls `sendCharacterTo(name,'main',0,0,'home')`) and :52. The substance is correct (R:navigation/manual-commands.ts:71-84 vs :112-130, :142-147). The dashboard's merchant card has **no** map-travel "Send to…" at all: the button is gated `character.name !== merchant` (D:inventory-panel.tsx:1076-1087). So the PWA merchant's map-travel list is an EXTRA, not a relabelled equivalent |
| (d) Equipment renders `trade*` slots | **CONFIRMED, and severity goes up** | See section "B4" under Confirmed critical claims |
| (e) Character stats are already in `characterDetails` from the core fetch | **CONFIRMED** | R:telemetry/public-state.ts:256-276: `section=core` with `dashboard=1` returns `characterDetails: diagnosticCharacters(dashboardCharacters(state, ports))`. The allow-list in R:telemetry/public-state-characters.ts:5-57 includes `characterDollHtml, primaryStat, attack, frequency, range, speed, unrestrictedSpeed, armor, resistance, str, int, dex, vit, fortitude, luck, goldBonus, xpBonus, combatStats`. The script really reports them (S:2552-2569 primaryStat/str/combatStats, S:2674 characterDollHtml). The PWA requests exactly this URL (P:data/PartyDataProvider.tsx:140) and discards everything except `monsterHunt` (P:data/PartyDataProvider.tsx:162, 173-175). The dashboard consumes the same field into a per-character `diagnostics` cache (D:query-cache.tsx:204-222), and that cache feeds `GearComparisonDialog currentCharacter` (D:party-reference-panels.tsx:119-123). The PWA's comment claiming the data is unavailable (P:screens/itempanel/GearComparisonSheet.tsx:9-16) is false. Caveat: `dashboardCharacters` filters to characters in `ports.slots()` (public-state.ts:181-187), so inactive-slot characters get no details |

## Refuted claims

| # | Auditor claim | Finding |
|---|---|---|
| 27 (part) | "no remove/unlist from here" for stand listings | **Partly refuted.** The item panel has no remove, but carried-inventory listings can be removed and repriced in StandScreen (P:screens/account/StandScreen.tsx:60 remove; :77 price edit that keeps `quantity` and `id`). The `/stand` screen is routed (P:App.tsx:50). Editing quantity is still missing everywhere |
| 72/73 | Citation `TravelSection.tsx:217-248` / `:220-223` | **Citation wrong.** The file is 63 lines. The correct lines are P:TravelSection.tsx:28-34 and :45-58. The conclusion stands |
| — | No row was falsely marked MISSING | I grepped P:src for each MISSING item: `slots free` (only BankScreen), mluck/Clover, statBadge, setProgress, tracktrix, Hands, rule-conflict, merchantRules, merchantWeapon, characterDollHtml/Doll, `retry:`, Remaining/∞, "From catalog", Exclusive, upgrade-preview. Every one has zero hits in inventory, equipment or itempanel code. `operation` appears only in partyApi/MerchantCommerceScreen with an unrelated meaning. `canDeconstruct`/`deconstructionCatalog` exist only in models/state.ts and BankScreen. `update-auto-upgrade-rule` exists only as a remove (partyApi.ts:427-429). All MISSING rows stand |

## Downgraded / upgraded claims

| # | Auditor | Now | Reason |
|---|---|---|---|
| 26 Auto mark for bank | PRESENT | **PARTIAL** | The dashboard shows it only when a merchant is configured, and disables it once set: `{!!merchant && <AutomaticItemActions section="bank">}` (D:inventory-panel.tsx:939-945) and `disabled={bank}` (D:automatic-item-actions.tsx:33). The PWA always shows it and always enables it (P:ItemActionPanel.tsx:209). The auditor's own note says "No disabled state", which contradicts PRESENT |
| 35 Auto compound | PRESENT | **PARTIAL** | The dashboard label shows the current target, "Auto compound to +N" (D:automatic-item-actions.tsx:45), and the row is hidden unless `level < min(7, max)` (:31, :44). The PWA label is static and the row shows even when the picker renders null (P:ItemActionPanel.tsx:255, 394-395). This is the same class of gap as #31, which the auditor marked PARTIAL |
| 43 / 54 Clear all marks | PRESENT | **PARTIAL (minor)** | The dashboard shows it only when some mark or rule matches (D:inventory-panel.tsx:1066; D:equip-slot.tsx:137). It also carries the tooltip "Clear this item's manual marks and matching shared automatic rules" (D:clear-item-marks.tsx:6). The PWA always shows it, with no explanation (P:ItemActionPanel.tsx:318, 363) |
| 75 Send to… | PRESENT | **PARTIAL** | The dashboard dialog lets you choose a known place **or type a map name and X/Y coordinates** (D:character-travel-dialog.tsx:72-82, 119-160), and it shows errors (D:use-party-console.tsx:723-735). The PWA offers presets only, with no manual coordinates. Its result is discarded (`await api.sendCharacterTo(...)` with no check, P:TravelSection.tsx:52), so a 4xx response is invisible |
| 74 Return to leader | PARTIAL | PARTIAL, plus a further defect | The result is also discarded (`void api.returnToLeader`, P:TravelSection.tsx:37). When the leader is offline, the server's 409 "an online different party leader is required" (R:navigation/manual-commands.ts:131-134) never reaches the user. The dashboard routes it to `setActionError` (D:use-party-console.tsx:426-431). "Go home" (TravelSection.tsx:32) has the same silent-failure problem |
| 46 Empty equipment tiles | PARTIAL | **PARTIAL, mostly MISSING** | The script sends only occupied slots: `if (item) out[slot] = ...` (S:2704-2707). The PWA iterates present keys only (P:EquipmentSection.tsx:22), so on initial load it shows **no** empty slots. "empty" appears only for slots that were emptied during the session, because the live diff sends `null` for removed keys (R:telemetry/dashboard-stream.ts:50-56). The dashboard always renders all 15 fixed slots (D:equipment.tsx:42-48; D:equipment-slots.tsx) |
| 42/69 (B1) | BROKEN | **BROKEN, higher severity** | See below: the PWA also wipes the merchant's other automatic rules for the item, and its Remove is a silent no-op |
| 45 (B4) | BROKEN | **BROKEN, higher severity** | See below: tapping a trade tile and choosing Unequip pulls the listing off the real stand and closes the stand |
| 41 (B2) | BROKEN | BROKEN, one addition | The server de-duplicates by source/character/slot/item and returns the existing mark (R:http/npc-sale.ts:167-170). Re-tapping cannot raise the quantity, so the only fix is to remove the mark, and remove is MISSING (#58) |
| 27 (B3) | BROKEN | BROKEN, one addition | Re-marking an already-listed item resolves to the same listing (server `marks.find(id, pack, slot, item)`, R:http/stand-marks.ts:60-61). It then **overwrites its quantity to 1**: `listing.quantity = quantity` (R:merchant/stand-marks.ts:153-154). So the PWA's "Mark for Stand" can actively shrink an existing stack listing |

## Confirmed critical claims (one line each)

**B1 (#42/#69)**
- What goes wrong: on the merchant, the PWA sends `{character: <merchant>, item, action}` (P:api/partyApi.ts:327-329; called from P:ItemActionPanel.tsx:236 and P:AutoMarksSection.tsx:39).
- Server behaviour: it keeps `character` unless `merchantRules` is set (R:http/automatic-sales.ts:70), so the rule key becomes `JSON.stringify([merchant, key])` (R:merchant/player-npc-sales.ts:11-14). The `{character}` rule then hits the early return at R:http/automatic-sales.ts:55, which skips the stand-rule cleanup and `syncStand`.
- **New finding: the rule never fires.** The per-player NPC path runs only for non-merchant statuses (R:merchant/automatic-sales.ts:209-212). The merchant uses `reconcileMerchant` with the plain key.
- **New finding: the merchant's other automatic rules are wiped.** `ports.selectAction(item, merchant, 'npc')` still runs (automatic-sales.ts:53 → R:inventory/automatic-action.ts:120-128). It clears the merchant's auto-bank, auto-upgrade, auto-stand and similar rules for that item.
- Net effect: the user's existing merchant rule is replaced by a dead rule that is invisible, both in the PWA list (`rule.character == null` filter, P:AutoMarksSection.tsx:38) and in the dashboard list (`!rule.character`, D:inventory-panel.tsx:1094).
- **New finding: Remove is a no-op.** The PWA's Remove on a real account-wide rule deletes the `[merchant,key]` key instead, so the server returns ok and the rule stays.
- How the tests hide it: the mock rewrites `character === merchantName` to `undefined` and uses a plain key (E:fixtures/mockPartyServer.ts:354-372). E:golden-path.spec.ts:35-40 and E:journey-daily-use.spec.ts:57-58 exercise exactly this merchant path, and they pass only because of the mock.

**B2 (#41):** the NPC sale always sends `quantity: 1` (P:api/partyApi.ts:273), and the server honours it (`Number(body.quantity \|\| 1)`, R:http/npc-sale.ts:65, 87). The dashboard defaults to `item.q` (D:connected-inventory.tsx:100).

**B3 (#27):** the stand listing sends `quantity = 1` (P:api/partyApi.ts:254). An empty price becomes 0 and gets a 400 (R:http/stand-marks.ts:17-26). The dashboard's defaults are `existing?.price \|\| max(1, def.g)` and `existing?.quantity \|\| item.q` (D:connected-inventory.tsx:83-90). The mock accepts price 0 (E:fixtures/mockPartyServer.ts:491-505), which masks the 400.

**B4 (#45)**
- How the bug happens: the live `slots` includes `trade1..N` (the script copies `character.slots` wholesale, S:2704-2707), and stream compaction does not filter them (R:telemetry/dashboard-stream.ts:80-87, 193). The dashboard filters them out (D:equipment.tsx:45-47, 51). The PWA does not (P:EquipmentSection.tsx:22).
- **New finding:** tapping a trade tile opens EquipmentActions, which offers Unequip (P:ItemActionPanel.tsx:345). That sends `unequip {slot:"tradeN"}`. The server accepts any `^[a-z0-9_]+$` slot (R:inventory/transfer-commands.ts:57, 67). The merchant script then calls `closeMerchantStandForTravel()` and `unequip("tradeN")` (S:9803-9808). The result is that the item is pulled off the real stand behind the coordinator's `standListings` bookkeeping, and the stand is closed.
- Upgrade-mark with `equipped:true` on a trade slot is also offered.

**B5 (#73):** PWA "Go home" sends `character-travel` (P:TravelSection.tsx:32). That goes through `travel()`, which calls `authorize()` and overwrites `characterLocations`, with no realm reset (R:navigation/manual-commands.ts:71-84). Real `go-home` sets `block.realm = activeRealm` and restarts the block (:112-130).

**B6 (#72):** "Send merchant to…" in the dashboard posts `/command {character:<target>, type:"bank"}` (D:merchant-visit-control.tsx:19 → R:navigation/manual-commands.ts:142-147). No `type: 'bank'` command exists anywhere in P:src (grepped).

**#97 / #98 (gear projection and doll):** the data is available via `characterDetails` (see focus point e).

**#60 / #66 (shared-rules mode):** the PWA reads `autoDeconstruction[characterName]` and `autoItemMarks[characterName]` (P:AutoMarksSection.tsx:42, 52), but the server writes to `ruleOwner()` (R:inventory/shared-rules.ts:20-22; R:merchant/deconstruction.ts:301). In shared mode the PWA's non-merchant NPC list is also always empty, because the server forces `character` to undefined (R:http/automatic-sales.ts:70) while the PWA filters `rule.character === characterName` (P:AutoMarksSection.tsx:38).

## Exhaustive inventory context-menu enumeration (dashboard vs auditor table)

Dashboard menu order is from D:inventory-panel.tsx:770-1068. "merchant" means `state.merchantCharacter` is configured. "self=merchant" means this card is the configured merchant.

| Order | Entry (and condition) | Auditor row | Diff / PWA |
|---|---|---|---|
| 1 | Equip (when isEquipment) :771 | #17 | ok |
| 2 | "Use" / "Use elixir" (when isUsable) :775-777 | #18 | ok |
| 3 | Compare with equipped: a submenu when there are 2+ slots (ring, earring, 1-handed weapon → Main/Off hand), each with the equipped item name or "Empty"; otherwise a single item :778-815 | #19/#20 | ok |
| 4 | Deliver to… (targets with `seenAt>0`, not self; bankbois excluded from `chars`, use-party-console.tsx:782-788). Merchant + equipment gets a nested Don't equip / Equip with a ✓ :816-874 | #21/#22 | ok |
| 5 | Stat scroll submenu (self=merchant and def.stat). Trigger reads "Stat scroll: X" / "Change stat scroll · X" / "Add stat scroll". The current choice is disabled :875-920 | #23 | ok |
| 6 | Auto exchange (merchant, self=merchant, def.e>0; disabled when marked) :921-927 → automatic-item-actions.tsx:39 | #24 | ok |
| 7 | Mark for bank (always shown; disabled when bank-marked) :928-938 | #25 | ok |
| 8 | Auto mark for bank (merchant; disabled when set) :939-945 → aia.tsx:33 | #26 | **Downgraded to PARTIAL** (see above) |
| 9 | Mark for stand / Edit stand listing (self=merchant; disabled when full and not listed) :946-958 | #27 | ok |
| 10 | Auto mark for stand… / Update auto mark for stand… (merchant, self=merchant) :961-967 → aia.tsx:36-38 | #28 | ok |
| 11 | Mark for upgrade submenu (merchant; upgradeable; max > 0). Tiers with gold cost; trigger reads "· N tiers"; **"Upgrade with <offering>" rows inside the same submenu, plus a live UpgradePreviewPanel** :968-992 → upgrade-actions.tsx:52-82 | #29/#30 | ok |
| 12 | Auto mark for upgrade submenu (merchant). Current tier disabled; trigger reads "· N tiers"; **"Add upgrade rule"** :968-992 → upgrade-actions.tsx:83-103 | #31/#32 | ok |
| 13 | Buy another level 0 (merchant configured, self≠merchant, meta.buyable) :976 → upgrade-actions.tsx:105-107 | #33 | ok |
| 14 | Mark for compounding (merchant, compoundable, not already grouped) :994-1005 | #34 | ok |
| 15 | Auto compound / Auto compound to +N submenu (merchant, compoundable, level < min(7, max)) :1006-1012 → aia.tsx:44-54 | #35 | **Downgraded to PARTIAL** |
| 16 | Mark for merchant (self≠merchant; disabled when marked) :1015-1025 | #36 | ok |
| 17 | Auto mark for merchant (self≠merchant; disabled when set) :1026-1036 | #37 | ok |
| 18 | Separator (merchant, or deconstructable) :1039 | — | cosmetic |
| 19 | Mark for deconstruction (canDeconstruct; disabled while pending) → confirmation dialog :1041-1044 | #38/#39 | ok |
| 20 | Auto mark for deconstruction (canDeconstruct; **disabled when the auto rule already exists**) → confirmation :1045-1048 | #40 | Auditor missed the disabled state. The PWA has neither gating nor a disabled state (P:ItemActionPanel.tsx:238) |
| 21 | Sell to NPC… (**only when a merchant is configured**) → quantity dialog :1050-1058 | #41 | Auditor missed the `merchant` gate. The PWA always shows it (P:ItemActionPanel.tsx:222) |
| 22 | Auto sell to NPC… / Update auto sell to NPC… (merchant) :1059-1065 → aia.tsx:55 | #42 | "Update" label missing in the PWA (P:ItemActionPanel.tsx:236 is static) |
| 23 | Clear all marks footer (conditional, with tooltip) :1066-1068 | #43 | **Downgraded to PARTIAL (minor)** |
| — | Lucky slot tile: left-click opens LuckySlotMenu instead of details :716 | #14 | ok |

Equipped-item menu (D:equip-slot.tsx:117-138):
- Unequip (not elixir).
- Disabled "Active elixir effect".
- Mark for upgrade submenu, which includes the **offering rows plus the preview with `offeringSource {slot, equipped:true}`**.
- Auto mark for upgrade, with "Add upgrade rule".
- Conditional Clear all marks.
- Buy is **never** shown because `allowBuy` defaults to false.

The auditor covered all of these except the equipped-side tier labels and the offering rows (#53 mentions only that offerings are missing).

PWA-only rows on the inventory sheet:
- "Mark for Merchant" / "Auto-mark for Merchant" on the merchant itself (P:ItemActionPanel.tsx:210-211; the dashboard hides them at :1013).
- "Mark for NPC Sale" / "Auto-sell" / "Mark for Deconstruction" / "Auto-deconstruct" with no gating.
- Equipped "Buy copy" for the merchant (P:ItemActionPanel.tsx:362).

## Missed gaps

| # | Feature | Dashboard evidence (file:line) | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| M1 | Trade slots tapped as equipment trigger a real unequip, which unlists from the stand and closes it | D:equipment.tsx:45-47 (filter) | `/command {type:"unequip", slot:"tradeN"}` → S:9803-9808 | BROKEN (destructive) | P:EquipmentSection.tsx:22-33; P:ItemActionPanel.tsx:345 | Part of B4. This raises severity from cosmetic to data-affecting |
| M2 | Auto NPC-sale on the merchant wipes the merchant's other automatic rules for the item and creates a dead rule | R:http/automatic-sales.ts:53-55; R:inventory/automatic-action.ts:120-128; R:merchant/automatic-sales.ts:209-212 | `/merchant/auto-npc-sale` | BROKEN | P:ItemActionPanel.tsx:236 | Part of B1 |
| M3 | Manual map name + X/Y coordinate travel | D:character-travel-dialog.tsx:72-82, 119-160 | `/command {type:"character-travel", location:{map,x,y}}` | MISSING | P:TravelSection.tsx:43-58 (presets only) | #75 downgraded |
| M4 | Error surfacing for travel, go-home and return-leader | D:use-party-console.tsx:426-431, 733-735 | — | MISSING | P:TravelSection.tsx:32, 37, 52 (results discarded) | A 409 is silent |
| M5 | The merchant card has no map "Send to…" | D:inventory-panel.tsx:1076 | — | EXTRA in the PWA | P:TravelSection.tsx:28-30 | Not a parity gap. It does make the "Send merchant to…" label collision worse |
| M6 | Item actions hidden when no merchant is configured (auto-bank, Sell to NPC, auto NPC, auto compound, auto exchange, auto stand) | D:inventory-panel.tsx:921, 939, 961, 1006, 1050, 1059 | — | PARTIAL | P:ItemActionPanel.tsx:209, 222-238 (ungated) | The PWA gates only upgrade and compound, via `hasMerchant` (:183-185). `hasMerchant` uses ctype, not `merchantCharacter` |
| M7 | Auto-deconstruct disabled when the rule exists; auto-bank disabled when set | D:inventory-panel.tsx:1045; D:automatic-item-actions.tsx:33 | autoDeconstruction / autoItemMarks | MISSING | P:ItemActionPanel.tsx:209, 238 | |
| M8 | "Update auto sell to NPC…" / "Update auto mark for stand…" / "Auto compound to +N" labels that reflect existing rules | D:automatic-item-actions.tsx:37, 45, 55 | autoNpcSales, autoStandMarks, autoCompounds | MISSING | P:ItemActionPanel.tsx:217, 236, 255 | |
| M9 | Equipped "Mark for upgrade · N tiers" / "Auto mark · N tiers" labels; current auto tier disabled | D:upgrade-actions.tsx:57, 88, 92 via D:equip-slot.tsx:123-136 | upgrades, autoUpgradeMarks | MISSING | P:ItemActionPanel.tsx:348-358 | Same as #29/#31, but on the equipped side |
| M10 | Re-marking a listed item for stand overwrites the listing's quantity to 1 | R:http/stand-marks.ts:60-61; R:merchant/stand-marks.ts:153-154 | `/merchant/stand` | BROKEN | P:ItemActionPanel.tsx:484; P:api/partyApi.ts:254 | Extends B3 |
| M11 | Inventory tile falls back to the item name when no sprite exists, and uses the live `entry.meta.sprite` | D:inventory-panel.tsx:725-731 | items[i].meta.sprite | PARTIAL | P:InventorySection.tsx:50 (catalog sprite only; blank when the item is not in the catalog) | Minor |
| M12 | Clear-marks tooltip explaining that it also clears matching shared automatic rules | D:clear-item-marks.tsx:6 | — | MISSING | P:ItemActionPanel.tsx:318 | A user cannot tell that "Clear marks" also deletes rules |
| M13 | Bankboi exclusion for "the merchant": the PWA uses `ctype==='merchant'` for NPC-sale source, stand gating, statScrollInventory and the npcSaleMarks filter | D:connected-inventory.tsx:97-98 (`name === state.merchantCharacter`) | merchantCharacter | BROKEN for bankboi accounts | P:ItemActionPanel.tsx:71, 183; P:CharacterDetailScreen.tsx:111, 183, 209 | The server treats `source:'merchant'` only as the configured merchant (R:http/npc-sale.ts:144-146). A bankboi tile would send `source:'merchant'` with the wrong slot owner. The auditor flagged this out-of-slice; it belongs in-slice |
| M14 | Exchange "Add" button inside item details when opened from commerce | D:item-details.tsx:748-749 | exchangeAdd | out-of-slice | — | For the commerce auditor |
| M15 | The e2e mock also masks the price-0 stand 400 and does duplicate pushes instead of the server's update-by-identity | R:http/stand-marks.ts:17-26, 60-70 | — | test gap | E:fixtures/mockPartyServer.ts:491-505 | The mock accepts `price: Number(body.price) \|\| 0` |

## Dependencies / ordering notes

1. **Model `merchantCharacter` and `merchantRules` in `PartyStateDynamic` first.** B1, B6, M6, M13, #60/#66 and #71 all depend on knowing the configured merchant rather than inferring it from ctype. Both fields are in the core payload the PWA already fetches (the dashboard reads `state.merchantCharacter` / `state.merchantRules`, D:connected-inventory.tsx:47).
2. **Keep the full `characterDetails` in PartyDataProvider** (P:data/PartyDataProvider.tsx:162-175) before attempting #97/#98, or the gear projection or the doll. This is a small change; the data is already on the wire.
3. **Fix the e2e mock in the same change as B1 and B3.** Remove the merchant→undefined normalization (E:mockPartyServer.ts:360-362), adopt `npcSaleRuleKey` keys, and validate price >= 1. Otherwise the golden-path tests keep passing on a broken implementation.
4. **B4 is a one-line filter** (`!slot.startsWith('trade')`) plus the fixed 15-slot order from D:equipment-slots.tsx. Do it immediately, because M1 is destructive.
5. B2 and B3 both need a quantity/price sheet that reuses `ModifiedItemWarning`. Order matters: fix the defaults (`item.q`, `existing?.price || max(1, def.g)`) before adding any "Edit stand listing" entry point, to avoid M10.
6. #58 (remove an NPC-sale mark by `id`) should land with B2. Because the server de-duplicates, a wrong-quantity sale can only be corrected by removing it.
7. B5/B6 need two new API methods: `goHome()` → `type:"go-home"` and `requestMerchantVisit(target)` → `{character: target, type:"bank"}`. They also need result and error handling in TravelSection (M4).

## Counts
- Refuted: 1 partial (#27 remove/unlist exists in StandScreen) and 1 citation error (#72/#73). 0 MISSING rows refuted.
- Downgraded: 5 (#26, #35, #43/#54, #75, #46).
- Severity raised: 2 (B1, B4). Extended: 2 (B2, B3).
- Confirmed critical: B1-B6, plus focus point (e).
- Missed gaps: 15 (M1-M15). M1, M2, M10 and M13 are BROKEN-class.
