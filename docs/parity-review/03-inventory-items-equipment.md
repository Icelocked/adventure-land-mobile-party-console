# 03 — Inventory, item details, item context menus & marks, equipment, gear comparison

Auditor 03. Dashboard = `console-v1.2.0` (abbreviated `D:`; paths relative to `dashboard/features/party/` unless prefixed). PWA = `F:\CodingProjects\adventureland-party-mobile\web\src` (abbreviated `P:`).

All dashboard inventory/equipment actions funnel through `command()` → `POST /party-api/command {character, type, item, ...extra}` (D:use-party-console.tsx:393-430). The backend dispatches through `createCoordinatorCharacterCommands` handlers (D:runtime/coordinator/http/character-actions.ts:110-120 → character-command.ts:65-72). PWA equivalent: `PartyApiClient.itemCommand()` / `sendCommand()` → same `POST command` (P:api/partyApi.ts:197-216). Where body shapes match I mark the wiring correct.

## Summary

| Classification | Count |
|---|---|
| PRESENT | 33 |
| PARTIAL | 40 |
| BROKEN | 7 |
| MISSING | 29 |
| UNREACHABLE | 0 |
| (PWA-only extra / deferred) | 2 |

### Top 5 most impactful gaps
1. **Auto-sell-to-NPC on the merchant writes the wrong rule (BROKEN).** PWA always sends `character: <merchant>`. The real server only drops `character` in shared-rules mode, so it stores a per-player rule under `npcSaleRuleKey(item, merchant)` instead of the account-wide merchant rule. The merchant's own rule list filters `rule.character == null`, so the rule never shows up, and Remove misses the real key. The e2e mock hides the bug because it normalizes merchant→undefined. The real server does not (#43, #69).
2. **Sell to NPC and Mark for stand hard-code quantity 1 and have no default price (BROKEN).** Selling a 200-stack sells 1. A stand listing for a stack lists 1. An empty price field sends `price: 0`, which the server rejects. The dashboard dialogs default to the stack quantity and the existing/definition price, and let you edit both (#28, #42).
3. **Merchant travel buttons do something different from the dashboard (BROKEN).** PWA "Go home" sends `character-travel` to main 0,0, not `go-home`. It skips the home-realm switch and overwrites `characterLocations`. PWA "Send merchant to…" moves the merchant to a map place. The dashboard button with that label queues a merchant visit to a party member (`type:"bank"`), and the PWA cannot do that at all (#72, #73).
4. **Shared-rules mode (`state.merchantRules`) and `merchantCharacter` are not modeled in the PWA.** The rule-conflict resolution panel (`/merchant/rule-conflict`) is missing (#71). Rule lists on non-merchant screens read `[characterName]`, which is wrong in shared mode (#60, #66). The PWA finds "the merchant" by `ctype==='merchant'`, so bankbois are a hazard.
5. **Most of the item context menu and tile status is missing.** Missing: deconstruction confirmation with reward odds and cost, "Upgrade with offering" with the upgrade preview panel, compare-slot choice, the in-progress operation overlay (chance %), stat-type/mluck badges, the merchant price tooltip, the inline edit of auto-upgrade/compound target and quantity, manual NPC-sale/deconstruction mark rows with Retry, and the equipment set-progress badge. Gear comparison is item-stats-only. The PWA comment says character stats aren't available, but they are: the PWA already fetches `state?section=core&dashboard=1`, whose `characterDetails` carries str/int/dex/attack/combatStats/characterDollHtml (D:runtime/coordinator/telemetry/public-state.ts:263 and public-state-characters.ts:4-57). The PWA only extracts `monsterHunt` (P:data/PartyDataProvider.tsx:162-165).

## Feature table

### A. Inventory grid & tiles

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | Inventory grid, 5 columns, one tile per slot | inventory-panel.tsx:581-1072 | `characters[name].items` (live) | PRESENT | P:screens/character-detail/sections/InventorySection.tsx:39-62; P:data/PartyDataProvider.tsx:68-73 (fixed-length array, index==slot) | |
| 2 | Capacity counter `occupied/total`, colored (<5 free rose, ≤10 orange), tooltip "N slots free" | inventory-panel.tsx:226-231, 574-576 | `inventorySize`, items | MISSING | none: grepped "slots free", "occupied" in P:screens/character-detail; only BankScreen has it (P:screens/account/BankScreen.tsx:63) | BankScreen's freeColor logic can be reused |
| 3 | Collapsible "Inventory" header | inventory-panel.tsx:560-578 | UI | MISSING | InventorySection.tsx:38 (static SectionCard) | Low priority |
| 4 | Non-merchant compacted order vs merchant physical order | inventory-panel.tsx:582; compact-inventory.tsx:4-7 | — | PRESENT (layout differs) | InventorySection.tsx:40 (always physical) | Acceptable mobile difference |
| 5 | `+level` label only when level > 0 | inventory-panel.tsx:735-737 | item.level | PARTIAL | InventorySection.tsx:51 (`level != null`, so shows "+0") | |
| 6 | Colored stat_type badge (INT/STR/DEX/VIT colors) | inventory-panel.tsx:738-744; stat-badge-class.tsx:3-16 | item.stat_type | MISSING | none: grepped statBadge, stat_type in sections | P:ItemActionPanel.tsx:88 shows stat_type only as text in the sheet |
| 7 | Quantity badge | inventory-panel.tsx:745-749 | item.q | PRESENT | InventorySection.tsx:52 | |
| 8 | Merchant's Luck clover (item.m) | mluck-clover.tsx:5-15; inventory-panel.tsx:750 | item.m | MISSING | none: grepped Clover, mluck | |
| 9 | In-progress upgrade/compound overlay: from→to, success %, pulsing result sprite | item-operation-overlay.tsx:6-41; inventory-entry.tsx:10-16; inventory-panel.tsx:732-734 | `items[i].operation` | MISSING | P:models/item.ts:28-31 (InventoryEntry has no `operation`/`meta`); grepped "operation" | Data already arrives in the live record. Only the type and render are missing |
| 10 | Action banner, priority-sorted (13 candidates + "Rule conflict") | inventory-panel.tsx:692-708; item-action-banner.ts:18-33 | marked, merchantMarked, autoItemMarks, upgrades, statScrolls, compounds, autoCompounds, npcSaleMarks, autoNpcSales, standListings, autoStandMarks, autoExchanges, deconstructionMarks, autoDeconstruction, merchantDeliveries, merchantWeapon | PARTIAL | P:lib/markBadge.ts:37-72 | Missing: stand sale, auto stand, auto exchange, auto-compound pending, auto deconstruction rule, auto-NPC rule without a mark, rule-based auto bank/merchant (autoItemMarks), merchant weapon, Rule conflict. Priority also differs: the dashboard ranks manual(1) < auto(2) < delivery(3) < bank(4) < merchant(5) < weapon(6). The PWA uses a fixed order with merchant before bank |
| 11 | Banner tooltip (NPC sale state/error/retry, conflict families) | inventory-panel.tsx:679-683, 751 | npcSaleMarks.error/retryAt | MISSING | markBadge.ts returns {label,color} only | |
| 12 | Tile border colored by banner | inventory-panel.tsx:719; item-action-banner.ts:4-17 | — | PARTIAL | InventorySection.tsx:47 (fixed border), 53-60 (bottom strip) | |
| 13 | Merchant hover tooltip: suggested price details, deconstruction state, NPC-sale state | inventory-panel.tsx:753-768 | standPriceHistory, merchantCatalog.buyable | MISSING | none. `standPriceHistory` is not in P:models/state.ts (grepped) even though the PWA fetches `section=market` (P:data/PartyDataProvider.tsx:142) | |
| 14 | Lucky upgrade slot outline in merchant grid; click opens lucky-slot menu | inventory-panel.tsx:215-217, 583-596, 716-724 | luckyUpgradeSlots, luckySlotTracking | PARTIAL | P:screens/character-detail/sections/LuckySlotSection.tsx; CharacterDetailScreen.tsx:156-158 | Separate section, no in-grid marker. Defer to the lucky-slot auditor |
| 15 | "Loading inventory…" when items/slots are not yet received | connected-inventory.tsx:169-171 | — | PARTIAL | InventorySection.tsx:35 returns null | |
| 16 | Left-click opens item details | inventory-panel.tsx:716; connected-inventory.tsx:140-153 | — | PRESENT | CharacterDetailScreen.tsx:196; P:screens/itempanel/ItemActionPanel.tsx:94-102 | Tap opens a sheet with details and actions |

### B. Inventory context menu (right-click)

| # | Feature | Dashboard evidence | Endpoint/body | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 17 | Equip (only when isEquipment) | inventory-panel.tsx:771-774; item-actions.ts:3-5 | `/command {type:"equip", item}` | PARTIAL | ItemActionPanel.tsx:205 | Wiring matches. Not gated, so it shows for every item |
| 18 | Use / "Use elixir" (only when isUsable) | inventory-panel.tsx:775-777; item-actions.ts:6-8 | `/command {type:"use-item", item, slot}` | PARTIAL | ItemActionPanel.tsx:207 | Wiring matches. Not gated; single label |
| 19 | Compare with equipped (equipment only) | inventory-panel.tsx:778-815 | opens GearComparisonDialog | PRESENT | ItemActionPanel.tsx:119, 206, 127-136 | |
| 20 | Compare slot submenu (Main/Off hand, Ring 1/2, Earring 1/2, with the currently equipped item's name) | inventory-panel.tsx:778-809; comparison-slot-label.tsx | onCompare(entry, slot) | MISSING | GearComparisonSheet.tsx:36-37 (auto-picks the slot) | |
| 21 | Deliver to… (targets: online, not self) | inventory-panel.tsx:816-874 | `/command {type:"give", item, target, slot}` | PARTIAL | ItemActionPanel.tsx:178, 288-317 | Wiring matches. Targets come from the whole roster (P:models/roster.ts:6-14), so offline characters and bankbois appear; no `seenAt` filter |
| 22 | Deliver, merchant + equipment: "Don't equip" / "Equip", with ✓ on the current target | inventory-panel.tsx:828-858 | `give` + `equipOnDelivery` | PRESENT | ItemActionPanel.tsx:290-308 | |
| 23 | Stat scroll submenu (merchant, def.stat): cost or owned/required; label "Stat scroll: X" (pending) / "Change stat scroll · X" / "Add stat scroll" | inventory-panel.tsx:875-920 | `/command {type:"stat-scroll-mark", item, slot, statType}` | PARTIAL | ItemActionPanel.tsx:266-278, 417-454 | Wiring and costs match. No pending-mark label variant |
| 24 | Auto exchange (merchant, def.e>0; disabled once marked) | automatic-item-actions.tsx:39-41; inventory-panel.tsx:921-927 | `/command {type:"auto-exchange", item, slot}` | PRESENT | ItemActionPanel.tsx:191-192, 281-286 | |
| 25 | Mark for bank (disabled once marked) | inventory-panel.tsx:928-938 | `/command {type:"mark", item, slot}` | PARTIAL | ItemActionPanel.tsx:208 | No disabled state |
| 26 | Auto mark for bank (shown only when a merchant is configured; disabled once set) | automatic-item-actions.tsx:33-35 | `/command {type:"auto-item-mark", item, mode:"bank"}` | PRESENT | ItemActionPanel.tsx:209 | No disabled state |
| 27 | Mark for stand / "Edit stand listing" (merchant; disabled when stand is 16/16 and the item is not listed) opens the stand dialog: price defaults to the existing price or def.g, quantity defaults to existing or item.q | inventory-panel.tsx:946-958; connected-inventory.tsx:76-93; use-party-console.tsx:578-597 | `/merchant/stand {id, slot, item, bankPack, price, quantity, markAll, remove}` | **BROKEN** | ItemActionPanel.tsx:213-216, 478-489; P:api/partyApi.ts:248-256 | See BROKEN details |
| 28 | Auto mark for stand… / "Update auto mark for stand…" (default price = existing rule price or def.g) | automatic-item-actions.tsx:36-38; connected-inventory.tsx:110-124 | `/merchant/auto-stand {item, price, action:"set"}` | PARTIAL | ItemActionPanel.tsx:217-218, 465-476; partyApi.ts:333-335 | Field defaults to item.price or empty. Empty sends `price:0` and the server rejects it (D:runtime/coordinator/http/automatic-sales.ts:90). No "Update" label and no remove from here. The extra `character` field is ignored by the server |
| 29 | Mark for upgrade: tiers "+a → +b" with scroll gold cost; trigger shows "· N tiers" when a mark exists | upgrade-actions.tsx:52-70 | `/command {type:"upgrade-mark", item, slot, tiers}` | PARTIAL | ItemActionPanel.tsx:240-245, 372-387 | Wiring matches. No existing-mark indicator |
| 30 | "Upgrade with Primling / Primordial Essence / Primordial X" (disabled without stock) + live UpgradePreviewPanel | upgrade-actions.tsx:71-78 | upgrade-offering-controls / upgrade-preview-panel | MISSING | none: grepped "offering" in itempanel | Defer the offering internals to the upgrades auditor |
| 31 | Auto mark for upgrade (tiers, current tier disabled, label "· N tiers") | upgrade-actions.tsx:83-98 | `/command {type:"auto-upgrade-mark", item, slot, tiers}` | PARTIAL | ItemActionPanel.tsx:246-249 | Wiring matches. Current tier not disabled; no label |
| 32 | "Add upgrade rule" from the item (offering rule) | upgrade-actions.tsx:99-101 | offerings.select | PARTIAL | P:screens/account/OfferingsScreen.tsx exists; no per-item entry | Reachable only as a separate screen |
| 33 | Buy another level 0 (non-merchant, buyable) | upgrade-actions.tsx:105-107; inventory-panel.tsx:976, 984 | `/command {type:"buy-copy", item}` | PRESENT | ItemActionPanel.tsx:189, 279 | |
| 34 | Mark for compounding (compoundable, not already grouped) | inventory-panel.tsx:994-1005 | `/command {type:"compound-mark", item, slot}` | PRESENT | ItemActionPanel.tsx:254 | Not hidden when already grouped (minor) |
| 35 | Auto compound → tiers up to min(7, max) with compound pass cost; label "Auto compound to +N" | automatic-item-actions.tsx:44-54 | `/command {type:"auto-compound-mark", item, targetTier}` | PRESENT | ItemActionPanel.tsx:255-263, 393-410 | Label lacks the current target |
| 36 | Mark for merchant (non-merchant only; disabled once marked) | inventory-panel.tsx:1013-1025 | `/command {type:"merchant-mark", item, slot}` | PARTIAL | ItemActionPanel.tsx:210 | Also shown on the merchant's own items; no disabled state |
| 37 | Auto mark for merchant (non-merchant only; disabled once set) | inventory-panel.tsx:1026-1036 | `/command {type:"auto-item-mark", mode:"merchant"}` | PARTIAL | ItemActionPanel.tsx:211 | Same gating gap |
| 38 | Mark for deconstruction (only when canDeconstruct; disabled while pending) opens the confirmation | inventory-panel.tsx:1040-1044; deconstruction.ts:26-34; connected-inventory.tsx:59-67, 224-228 | `/deconstruction/mark {character, slot, item}` | PARTIAL | ItemActionPanel.tsx:237; partyApi.ts:312-314 | Body is fine. Not gated by `deconstructionCatalog` (the PWA has `canDeconstruct` at P:models/state.ts:386 but only BankScreen uses it). No confirmation |
| 39 | Deconstruction confirmation dialog: reward rows with sprite, quantity, chance %; "separate roll" note; cost per item; error display; separate titles for auto / all | deconstruction-confirmation.tsx:13-60; deconstruction.ts:19-25 | deconstructionCatalog | MISSING | none: grepped deconstructionRewards | Pure logic, easy to port |
| 40 | Auto mark for deconstruction (with confirmation) | inventory-panel.tsx:1045-1048 | `/deconstruction/auto {character, slot, item}` | PARTIAL | ItemActionPanel.tsx:238; partyApi.ts:319-323 | No gating or confirmation |
| 41 | Sell to NPC… opens a dialog: quantity 1..q (default q), modified-item acknowledgement | inventory-panel.tsx:1050-1058; connected-inventory.tsx:94-104; use-party-console.tsx:604-647 | `/merchant/npc-sale {source, character, slot, item, quantity, acknowledged}` | **BROKEN** | ItemActionPanel.tsx:222-235; partyApi.ts:267-278 | quantity hard-coded to 1. See BROKEN details |
| 42 | Auto sell to NPC… / "Update auto sell to NPC…" | automatic-item-actions.tsx:55; connected-inventory.tsx:105-109; use-party-console.tsx:649-662 | `/merchant/auto-npc-sale {item, character (undefined for merchant), action:"set"}` | **BROKEN** | ItemActionPanel.tsx:236; partyApi.ts:327-329 | Wrong `character` for the merchant |
| 43 | Clear all marks (footer, only when any mark exists) | clear-item-marks.tsx:5-12; inventory-panel.tsx:1066-1068 | `/command {type:"clear-item-marks", item, slot}` | PRESENT | ItemActionPanel.tsx:318 | Always shown |
| 44 | "Merchant weapon" banner | inventory-panel.tsx:630-633, 707 | `state.merchantWeapon` | MISSING | none: grepped merchantWeapon in P:models | |

### C. Equipment

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 45 | Fixed 15-slot order in 2 columns, plus extra slots, **excluding `trade*` stand slots** | equipment.tsx:42-48, 61-156; equipment-slots.tsx | `characters[name].slots` | **BROKEN** | P:screens/character-detail/sections/EquipmentSection.tsx:22, 28 (`Object.entries(slots)`, no filter) | See BROKEN details |
| 46 | Empty slots shown as disabled "Empty" tiles | equip-slot.tsx:103-108 | — | PARTIAL | EquipmentSection.tsx:45 | Only for slots present in the record |
| 47 | Slot label "earring 1" (digit spaced, capitalized) | equip-slot.tsx:86-88 | — | PARTIAL | EquipmentSection.tsx:38 (raw key) | Cosmetic |
| 48 | Level badge, stat_type badge, mluck clover on the equipped sprite | equip-slot.tsx:70-83 | item.level / stat_type / m | PARTIAL | EquipmentSection.tsx:42 (level only) | |
| 49 | Set progress badge `current/total` | equipment.tsx:49-57, 85-95; equip-slot.tsx:95-99 | meta.world.set | MISSING | none: grepped setProgress | Catalog meta has world.set |
| 50 | Equipment banner (upgrade / stat scroll) | equip-slot.tsx:62-65, 82 | upgrades (equipped), statScrolls | PARTIAL | EquipmentSection.tsx:29; CharacterDetailScreen.tsx:161 | No stat scroll marks passed |
| 51 | Unequip (not elixir) | equip-slot.tsx:118-121; inventory-panel.tsx:492-495 | `/command {type:"unequip", item, slot:<name>}` | PRESENT | ItemActionPanel.tsx:345 | |
| 52 | Elixir: disabled "Active elixir effect" | equip-slot.tsx:122 | — | PARTIAL | ItemActionPanel.tsx:345 (Unequip just hidden) | |
| 53 | Equipped upgrade / auto-upgrade marks | equip-slot.tsx:123-136; inventory-panel.tsx:496-505 | `upgrade-mark` / `auto-upgrade-mark` + `{slot, equipped:true, tiers}` | PRESENT | ItemActionPanel.tsx:346-361 | Offerings missing (see #30) |
| 54 | Clear all marks on equipped (conditional) | equip-slot.tsx:137; inventory-panel.tsx:521-524 | `clear-item-marks {slot, equipped:true}` | PRESENT | ItemActionPanel.tsx:363 | |
| 55 | Click equipped opens details | equip-slot.tsx:112 | — | PRESENT | CharacterDetailScreen.tsx:163 | |
| 56 | (PWA-only) "Buy copy" on equipped items for the merchant | the dashboard passes `onBuy` but `allowBuy` defaults to false (equip-slot.tsx:123-136; upgrade-actions.tsx:28, 105) | buy-copy | EXTRA | ItemActionPanel.tsx:362 | Not in the dashboard menu |

### D. Automatic-rule sections & card buttons (bottom of inventory panel)

| # | Feature | Dashboard evidence | Endpoint/body | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 57 | Auto NPC sales list: rules **plus all manual npcSaleMarks** (owner · qty · state · error; Remove disabled while running) | inventory-panel.tsx:1089-1102 | autoNpcSales, npcSaleMarks | PARTIAL | P:screens/character-detail/sections/AutoMarksSection.tsx:37-40 | Rules only |
| 58 | Remove a manual NPC-sale mark | inventory-panel.tsx:1100; connected-inventory.tsx:72-75 | `/merchant/npc-sale {character, id, remove:true}` | MISSING | partyApi.ts:267-278 has no `id` parameter | |
| 59 | Auto deconstruction list including pending deconstruction marks (owner · qty · state · error), Retry when blocked, remove by id | inventory-panel.tsx:1103-1115; connected-inventory.tsx:59-71 | `/deconstruction/mark {character, id, retry:true}` / `{..., id, remove:true}` (server: D:runtime/coordinator/merchant/deconstruction.ts:251-275) | MISSING | AutoMarksSection.tsx:42-50 (rules only); grepped "retry: true" | |
| 60 | Auto deconstruction rules list scoped to the rule owner | connected-inventory.tsx:47, 195 (`autoDeconstruction[ruleName]`) | autoDeconstruction | PARTIAL (wrong in shared-rules mode) | AutoMarksSection.tsx:42 (`[characterName]`) | Server stores under `ruleOwner()` (D:runtime/coordinator/inventory/shared-rules.ts:20-22; deconstruction.ts:301). The dashboard shows these sections only on the merchant card (inventory-panel.tsx:277), so on non-merchant cards this is a PWA-only view that shows empty in shared mode |
| 61 | Auto stand marks list with price; remove | inventory-panel.tsx:1118-1129 | `/merchant/auto-stand {action:"remove", item}` | PRESENT | AutoMarksSection.tsx:63-68 | Extra price/character fields are harmless |
| 62 | Auto upgrades list (all owners) with a "+a → +b" tile and owner detail | inventory-panel.tsx:1130-1180, 334-377 | autoUpgradeMarks | PARTIAL | AutoMarksSection.tsx:70-80 | No target range shown |
| 63 | Inline edit of auto-upgrade target tiers (1..13-level) and remaining quantity (-1=∞, "Completed") | inventory-panel.tsx:1145-1171, 385-463 | `/command {type:"update-auto-upgrade-rule", item, ruleKey, tiers}` / `{ruleKey, quantity}` | MISSING | partyApi.ts:425-429 (remove only) | |
| 64 | Inline edit of auto-compound target (1..7) and remaining quantity | inventory-panel.tsx:1192-1227 | `/command {type:"auto-compound-mark", item:{name}, targetTier, quantity}` | MISSING | AutoMarksSection.tsx:82-89 (remove only) | |
| 65 | Auto merchant marks list | inventory-panel.tsx:1240-1258 | `remove-auto-item-mark {mode:"merchant", ruleKey}` | PRESENT | AutoMarksSection.tsx:91-93 | |
| 66 | Auto bank marks list scoped to the rule owner | inventory-panel.tsx:1259-1275; connected-inventory.tsx:47, 186 | autoItemMarks[ruleName] | PARTIAL (wrong in shared-rules mode) | AutoMarksSection.tsx:52-55 | Reads `[characterName]`. The merchant card is correct; the non-merchant view is PWA-only (see #60) |
| 67 | Per-section "Clear all" with confirmation | inventory-panel.tsx:301-321, 529-542 | per kind | PRESENT | AutoMarksSection.tsx:161-184 | |
| 68 | Per-entry two-tap "Really?" remove | inventory-panel.tsx:244-252, 464-478 | — | PARTIAL | AutoMarksSection.tsx:148-158 (single tap, no confirmation) | |
| 69 | Remove an auto-NPC rule from the merchant's list | connected-inventory.tsx:133-139; use-party-console.tsx:673-682 (`{action:"remove", item}`, no character) | `/merchant/auto-npc-sale` | **BROKEN** | AutoMarksSection.tsx:39 → partyApi.ts:327-329 (`character: <merchant>`) | Deletes the wrong key |
| 70 | Upgrade offering rules block | inventory-panel.tsx:1181 | — | DEFERRED | P:screens/account/OfferingsScreen.tsx | Offerings auditor |
| 71 | Shared-rule conflicts panel + resolve | connected-inventory.tsx:223 (`SharedRuleConflicts`) | `/merchant/rule-conflict {id, owner}` | MISSING | none: grepped rule-conflict, merchantRules | |
| 72 | "Send merchant to…": dialog of online non-merchant characters, queues a merchant visit | merchant-visit-control.tsx:10-41; inventory-panel.tsx:1278 | `/command {character:<target>, type:"bank"}` (D:runtime/coordinator/navigation/manual-commands.ts:142-147) | **BROKEN** / capability MISSING | P:screens/character-detail/sections/TravelSection.tsx:217-248 | Same label, different action |
| 73 | Go home (merchant) | inventory-panel.tsx:1279-1286 | `/command {type:"go-home"}` (manual-commands.ts:112-129, 154-155) | **BROKEN** | TravelSection.tsx:220-223 | |
| 74 | Return to leader (disabled unless a different, online leader exists) | inventory-panel.tsx:209-212, 1289-1297 | `/command {type:"return-leader"}` | PARTIAL | TravelSection.tsx:225-229 | Hidden only for the leader; not disabled when the leader is offline. The server 409s (manual-commands.ts:131-134) |
| 75 | Send to… (travel dialog) | inventory-panel.tsx:1076-1087; use-party-console.tsx:720-736 | `/command {type:"character-travel", location, label}` | PRESENT | TravelSection.tsx:232-248; partyApi.ts:391-393 | Travel auditor |

### E. Item details dialog

| # | Feature | Dashboard evidence | Endpoint/state | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 76 | Header: sprite, name +level, "character · slot N" | item-details.tsx:312-325 | — | PRESENT | ItemActionPanel.tsx:83-92; ItemDetailBrowser.tsx:150-156 | |
| 77 | "Add to stand" from details (merchant/bank source, slot ≥ 0, disabled when stand is full) | item-details.tsx:328-339; party-item-details.tsx:45-66 | opens the stand dialog | PARTIAL | merchant: ItemActionPanel.tsx:213-216 (StandForm) | No stand-full guard |
| 78 | "Add to WTB" (uses the preview level) | item-details.tsx:340-350; party-item-details.tsx:44 | opens the WTB dialog → `/merchant/bid` | PARTIAL | P:screens/account/WtbScreen.tsx:31-63 (separate screen, picker) | No shortcut from details; level not carried over |
| 79 | Tracktrix bonuses for tracker / supercomputer | item-details.tsx:355 | tracktrix | MISSING | grepped tracktrix, tracker | |
| 80 | Explanation text | item-details.tsx:356-358 | def.explanation | PRESENT | ItemDetailBrowser.tsx:157 | |
| 81 | Buy from NPC / Sell to NPC values | item-details.tsx:359-382; npc-sale-value.tsx | — | PRESENT | ItemDetailBrowser.tsx:227-230; P:lib/itemFormulas.ts:244-286 | Verbatim port |
| 82 | Eligible classes (· nH) + "Hands required: a or b depending on class" | item-details.tsx:383-409 | meta.usage | PARTIAL | ItemDetailBrowser.tsx:232-244 | No hands line |
| 83 | Level stat preview slider, "· current", 0 / current / max labels | item-details.tsx:410-567 | — | PRESENT | ItemDetailBrowser.tsx:246-256 | Slider max is `maxLevel`, not `max(actual, max)`; no tick labels |
| 84 | Compare popover: pick any party character → pick slot → gear comparison | item-details.tsx:422-536, 158-167 | — | MISSING | none (compare only from own inventory; ItemActionPanel.tsx:119) | |
| 85 | Compare "From catalog" → catalog comparison with the level-adjusted item as A | item-details.tsx:516-531; party-item-details.tsx:71-75 | — | MISSING | none | |
| 86 | Stats grid: derived `equip_slot` row, stackable / max_stack_size, `type` hidden, ranked order | item-details.tsx:191-227, 569-580 | — | PARTIAL | itemFormulas.ts:324-356 (keeps raw `type`, no equip_slot) | |
| 87 | Set bonus with clickable pieces, bonus tiers | item-details.tsx:581-621 | meta.world.set | PRESENT | ItemDetailBrowser.tsx:315-342 | |
| 88 | Ingredient in (uses, level, craft fee) | item-details.tsx:622-654 | world.usedIn | PRESENT | ItemDetailBrowser.tsx:367-384 | |
| 89 | Craftable (fee, quest, materials with drop sources) | item-details.tsx:655-704 | world.recipe | PRESENT | ItemDetailBrowser.tsx:344-365 | |
| 90 | Exchange price / rewards / "Reward in" | item-exchange-details.tsx:12-172 | merchantCatalog.exchangeable | PARTIAL | ItemDetailBrowser.tsx:388-454; itemFormulas.ts:398-425 | Missing: "Rewards" title for boxes, cosmo/sixcake notes, reward +level label in rows |
| 91 | Exchange reward tile: auto-rule banner + right-click automatic actions (auto bank/stand/exchange/upgrade/compound/NPC) | exchange-reward-tile.tsx:21-80; party-item-details.tsx:35 | `/command` auto-* for merchant | MISSING | none | |
| 92 | Monster drops with Sort select (Name / Percentage) | item-details.tsx:706-747 | world.drops | PARTIAL | ItemDetailBrowser.tsx:456-468 (percentage only) | |
| 93 | Monster drill-in: Navigate-to-monster button, achievement progress, full definition grid, bestiary drops | item-details.tsx:235-293; definition-grid.tsx | `/navigate-to-monster` | PARTIAL | ItemDetailBrowser.tsx:470-497 (HP/ATK/XP + drops) | Bestiary auditor may cover navigation |
| 94 | Back-navigation trail between items and monsters | item-details.tsx:78-148, 299-311 | — | PRESENT | ItemDetailBrowser.tsx:60-71 | |
| 95 | Live-instance meta merged over catalog meta (`detailMeta`) | use-party-console.tsx:808-813; connected-inventory.tsx:146 | items[i].meta | PARTIAL | ItemActionPanel.tsx:57; ItemDetailBrowser.tsx:113, 127 (catalog only) | Live `properties` are ignored |

### F. Gear comparison

| # | Feature | Dashboard evidence | State | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 96 | Open from inventory "Compare with equipped" | inventory-panel.tsx:778-815; connected-inventory.tsx:154-165 | — | PRESENT | ItemActionPanel.tsx:127-136 | |
| 97 | Full character projection (HP, MP, Attack, Attack speed, Range, Run speed, Armor, Resistance, STR/INT/DEX/VIT, Fortitude, Luck, Gold, XP, Evasion, Reflection, Lifesteal, Manasteal, piercings, Crit, Dmg return, MP cost, Output) with delta and % | gear-comparison-dialog.tsx:150-256, 368-396 | characterDetails (str/int/dex/vit/attack/frequency/armor/resistance/speed/unrestrictedSpeed/combatStats…) | PARTIAL | P:screens/itempanel/GearComparisonSheet.tsx:9-16, 46-51 (item stats only) | The comment's premise is wrong: the data is in `state?section=core&dashboard=1` → `characterDetails` (D:runtime/coordinator/telemetry/public-state.ts:263; public-state-characters.ts:4-57), which the PWA already fetches (P:data/PartyDataProvider.tsx:140, 162-165) |
| 98 | Character doll image | gear-comparison-dialog.tsx:323-328 | characterDollHtml | MISSING | none | Also in characterDetails |
| 99 | Set changes section (before → after counts, GAINED / LOST bonuses) | gear-comparison-dialog.tsx:124-149, 257-259, 413-447 | meta.world.set | MISSING | none | |
| 100 | Stat-scroll preview (No stat + 4 primary buttons, exotic dropdown) per side | gear-comparison-dialog.tsx:261-317 | — | PRESENT | GearComparisonSheet.tsx:130-142 | All stats shown as chips |
| 101 | Independent preview-level sliders per side | gear-comparison-dialog.tsx:345-367 | — | PRESENT | GearComparisonSheet.tsx:144-152 | |

### G. Equipment catalog & catalog comparison

| # | Feature | Dashboard evidence | State | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 102 | Catalog reachable | party-equipment-catalog-dialog.tsx:17-19 | merchantCatalog.allItems | PRESENT | P:App.tsx:47; P:screens/character-detail/AccountMenu.tsx:13 | |
| 103 | Equipment-only list (EQUIPMENT_TYPES) | equipment-catalog-dialog.tsx:69-73 | — | PARTIAL | P:screens/account/CatalogScreen.tsx:20 (all items) | |
| 104 | Search across name, id, set | equipment-catalog-dialog.tsx:90-100 | — | PARTIAL | CatalogScreen.tsx:20 (name only) | |
| 105 | Sort (25 options) + sorted stat value on tile | equipment-catalog-dialog.tsx:110-159, 291-319 | — | MISSING | none | |
| 106 | Type filter chips | equipment-catalog-dialog.tsx:191-223 | — | MISSING | none | |
| 107 | Class filter chips + "Exclusive gear" | equipment-catalog-dialog.tsx:224-270 | meta.usage.classes | MISSING | none | |
| 108 | Result count / "sorted by" line | equipment-catalog-dialog.tsx:271-282 | — | MISSING | none | |
| 109 | Tile shows type · T{tier} · set | equipment-catalog-dialog.tsx:306-314 | — | MISSING | CatalogScreen.tsx:37-39 (name + max level) | |
| 110 | Inspect → full details | party-equipment-catalog-dialog.tsx:40-47 | — | PRESENT | CatalogScreen.tsx:45-51 | |
| 111 | Catalog comparison: A + up to 3 items, per-item level slider and stat-scroll select, delta table with %, ability rows, remove, "Compare selected" / "Cancel comparison" / "Back to catalog" | party-equipment-catalog-dialog.tsx:56-83; catalog-comparison.tsx:17-99; equipment-catalog-dialog.tsx:321-331 | — | MISSING | none | |

## BROKEN details

### B1 (#42, #69) Auto-sell-to-NPC rule for the merchant
- Dashboard, merchant: `onAutoNpcSale` sets `character: name === state.merchantCharacter ? undefined : name` (D:connected-inventory.tsx:105-109). `confirmAutoNpcSale` posts `{item, character, action:"set"}` (D:use-party-console.tsx:653-657). Removal on the merchant posts `{action:"remove", item}` with **no character** (D:use-party-console.tsx:673-677, routed from D:connected-inventory.tsx:133-138).
- PWA: `autoNpcSale(character, item, remove)` always posts `{ character, item, action }` (P:api/partyApi.ts:327-329), called with `characterName` even for the merchant (P:ItemActionPanel.tsx:236; P:AutoMarksSection.tsx:39).
- Server: `const character = state.merchantRules ? undefined : typeof body.character === "string" ? body.character : undefined;`. When character is set, `key = npcSaleRuleKey(item, character)` and the rule stores `{character}` (D:runtime/coordinator/http/automatic-sales.ts:47-55, 70). Result: on the merchant, the PWA creates a merchant-scoped *player* rule, not the account-wide rule. It doesn't clear the conflicting auto-stand rule (line 55 returns early), and the merchant's list hides it (`rule.character == null`, P:AutoMarksSection.tsx:38). Remove targets the player key, so it never removes an account-wide rule created by the dashboard.
- The e2e mock masks this: it rewrites `character === merchantName` to `undefined` (P/../e2e/fixtures/mockPartyServer.ts:354-372). The real server does not.

### B2 (#41) Sell to NPC quantity
- Dashboard: the dialog defaults `quantity: String(entry.item.q || 1)` (D:connected-inventory.tsx:94-102), validates 1..available, and posts `quantity` (D:use-party-console.tsx:607-641).
- PWA: `markForNpcSale(..., { isMerchant, acknowledged })`. `quantity` defaults to `1` (P:api/partyApi.ts:271-277) and the UI never sets it (P:ItemActionPanel.tsx:222-235). A stack sells 1 unit. There is no quantity input.

### B3 (#27) Mark for stand
- Dashboard: the stand dialog defaults price to `existing?.price || max(1, def.g)` and quantity to `existing?.quantity || entry.item.q || 1`. It blocks when 16/16 (D:connected-inventory.tsx:76-93) and posts `{id, slot, item, bankPack, price, quantity, markAll, remove}` (D:use-party-console.tsx:589-597).
- PWA: `StandForm` price defaults to `item.price` or `''`. `Number('')||0` sends `price:0` (P:ItemActionPanel.tsx:478-486). `markForStand` sends `quantity = 1` (P:api/partyApi.ts:254-255). There is no stand-full guard and no remove/unlist from here.

### B4 (#45) Equipment shows merchant stand `trade*` slots
- Dashboard filters `!slot.startsWith("trade")` when building the equipped list (D:equipment.tsx:45-47) and the set counts (:51). The same `slots` record carries trade slots: the coordinator iterates them (D:runtime/coordinator/status/merchant-observation.ts:128), and the dashboard counts `occupiedStandSlots` from `characters[merchant].slots` keys starting with `trade` (D:use-party-console.tsx:805-807).
- PWA renders `Object.entries(slots)` unfiltered (P:EquipmentSection.tsx:22-28). On the merchant, the stand's trade1..N listings likely appear as "equipment", and tapping one offers Unequip / upgrade on a stand listing.

### B5 (#73) Go home
- Dashboard: `onCommand(character.name, "go-home")` (D:inventory-panel.tsx:1281). The server's `home()` requires the configured merchant, resets `block.realm = state.activeRealm`, and restarts the block if the realm differs. It does **not** touch `characterLocations` (D:runtime/coordinator/navigation/manual-commands.ts:112-129).
- PWA: `api.sendCharacterTo(characterName, 'main', 0, 0, 'home')` sends `character-travel` (P:TravelSection.tsx:221; P:api/partyApi.ts:391-393). That runs `travel()`: it calls `authorize` (which records the location as the character's saved location) and never returns the merchant to the home realm (manual-commands.ts:71-83).

### B6 (#72) "Send merchant to…"
- Dashboard: lists online non-merchant characters (seen within 10 s) and posts `/command {character: <target>, type:"bank"}`, which queues a "manual visit" (D:merchant-visit-control.tsx:13-20; manual-commands.ts:142-147).
- PWA: the same label opens the `travelPlaces` list and sends the merchant to a map location (P:TravelSection.tsx:217-248). The per-character visit (`type:"bank"`) is never sent anywhere in the PWA (grepped `type: 'bank'`). Only the party-wide `/bank-party` exists (P:api/partyApi.ts:499-501).

### Note (#60, #66, downgraded to PARTIAL) Shared-rules scoping
- Dashboard: `ruleName = state.merchantRules ? String(state.merchantCharacter) : name`, used for `autoItemMarks`, `autoUpgradeMarks`, `autoDeconstruction`, `autoCompounds` (D:connected-inventory.tsx:47, 186-187, 195, 214). The server writes to `ruleOwner()` = the merchant when shared rules are active (D:runtime/coordinator/inventory/shared-rules.ts:20-22; deconstruction.ts:301).
- PWA: `dynamicState.autoDeconstruction[characterName]` and `autoItemMarks[characterName]` (P:AutoMarksSection.tsx:42, 52). `merchantRules` is not modeled (grepped P:models/state.ts). Non-merchant screens show empty auto-bank and auto-deconstruction lists while rules are active. The dashboard renders these sections only on the merchant card (D:inventory-panel.tsx:277), so this is wrong data in a PWA-only view, not a lost capability. Tile banners also use `ruleName` (D:connected-inventory.tsx:186), which is covered under #10.

## Reuse opportunities
- **Pure logic to port nearly verbatim:** `item-action-banner.ts` (whole priority + conflict detection; would replace P:lib/markBadge.ts), `deconstruction.ts` `deconstructionRewards` (P already has `canDeconstruct` at P:models/state.ts:386), `deconstruction-confirmation.tsx` body, `item-operation-overlay.tsx`, `stat-badge-class.tsx`, `mluck-clover.tsx`, `comparison-slot-label.tsx`, `equipment-slots.tsx` (slot order + trade filter from equipment.tsx:42-48), the set-count reducer (equipment.tsx:49-57), gear-comparison `project()`/`setState()` math (gear-comparison-dialog.tsx:124-226), `catalog-comparison.tsx` table logic, the equipment-catalog filter/sort `useMemo` (equipment-catalog-dialog.tsx:69-123), `item-exchange-details.tsx` box/cosmo/sixcake notes, and the `automaticRuleItem` / inline-edit validation (inventory-panel.tsx:232-238, 389-393).
- **Existing PWA helpers to extend, not duplicate:**
  - `lib/markBadge.ts` → swap in the banner port.
  - `lib/itemFormulas.ts` already has `comparisonSlotsFor`, `STAT_SCROLLS`, `previewProperties`, `npcSaleValue`, `compoundPassCost`, `upgradeScrollCost`. Add `propertiesAtLevel`/projection there.
  - `ModifiedItemWarning` → reuse inside a proper NPC-sale quantity sheet.
  - BankScreen's free-slot color and deconstruction gating → reuse in InventorySection and ItemActionPanel.
  - `AutoMarksSection` `RuleEntry` → add `edits`, `retry`, `disabled`, `upgradeTarget` fields mirroring inventory-panel.tsx:258-275.
  - `PartyDataProvider` already receives `characterDetails` → extend its type beyond `monsterHunt` (P:data/PartyDataProvider.tsx:162) to feed gear comparison and the doll.
  - `partyApi`: add `id` to `markForNpcSale` for remove; add `id`/`retry` to deconstruction; add `quantity` to stand and NPC sale; add `goHome()`, `requestMerchantVisit(target)` (`type:"bank"`), `updateAutoUpgradeRule(owner,item,ruleKey,{tiers|quantity})`, `resolveRuleConflict(id, owner)`.
  - Add `merchantCharacter`, `merchantRules`, `merchantWeapon`, `standPriceHistory` to `PartyStateDynamic`.

## Out-of-slice observations
- The PWA has **no `merchantCharacter`** anywhere (grepped P:models/state.ts). "The merchant" is inferred from `ctype === 'merchant'` (P:ItemActionPanel.tsx:71, 183; CharacterDetailScreen.tsx:111, 146-157). Bankbois are merchant-class characters, so the stat-scroll inventory may sum the wrong character's bag, and a bankboi's screen would render merchant-only controls. The dashboard excludes bankbois from `chars` (D:use-party-console.tsx:771-781).
- `standPriceHistory` (section=market) is fetched but not modeled. Suggested-price details and the WTB/stand price presets depend on it (also acknowledged in P:WtbScreen.tsx:14-17).
- A temporary diagnostic banner (`coreFetchDebug`) is still rendered on every character screen (P:CharacterDetailScreen.tsx:67-79).
- `party-inventory-panels.tsx` contains the bank sheet, stand/market sheets, Interface Settings (realm switch, ALData key, hosting, console updates, dashboard state import, create character) and the realm-switch confirmation. These belong to other auditors (bank/stand/settings), so I did not table them. Two things for those auditors to check: the bank-side auto-upgrade path posts `/command {type:"auto-upgrade-mark", slot:-1, ...}` (D:party-inventory-panels.tsx:167-171), and bank clear-marks posts `/command {type:"clear-item-marks", pack, ...}` (:179-182).
- `doll-layers.tsx` is consumed only by `map-canvas.tsx`, and `lib/account-inventory.ts` only by `merchant-commerce-dialog.tsx`. Map and commerce auditors.
- In the dashboard, every `automaticSection` (auto NPC, deconstruction, bank, etc.) returns null unless the card is the merchant's (D:inventory-panel.tsx:277). The PWA's AutoMarksSection shows NPC, deconstruction and bank rule lists on every character (P:AutoMarksSection.tsx:102-112). This is extra exposure, not a gap.
