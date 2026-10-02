# 06 — Bank / Bankbois / Mail / Bestiary / Achievements / Reference panels / Catalog

Auditor 06. Dashboard = console-v1.2.0 (abbrev `D:` = `scratchpad/console-v1.2.0/dashboard/features/party/`, `R:` = `scratchpad/console-v1.2.0/runtime/coordinator/`). PWA = `F:\CodingProjects\adventureland-party-mobile\web\src\` (abbrev `P:`).

## Summary

| Classification | Count |
|---|---|
| PRESENT | 12 |
| PARTIAL | 25 |
| BROKEN | 6 |
| MISSING | 55 |
| UNREACHABLE | 0 |

All PWA screens in this slice can be reached from navigation (`P:App.tsx:46-52`, `P:screens/character-detail/AccountMenu.tsx:11-22`), so nothing is UNREACHABLE. Most gaps are things that were never ported.

### Top 5 most impactful gaps
1. **Bankbois are missing entirely** (#33–#40). The PWA has no `bankbois` or `bankboiQueue` state, no create or delete, no bankboi inventory grid, and no withdraw, stand or NPC actions on `bankboi:NAME` packs. Grepping `bankboi` in `P:` only finds the prefix setting and comments. This also means mail attachments can't come from bankbois, and "sell all copies" counts miss bankboi stock.
2. **Withdrawal target is resolved wrongly** (#8, #9, BROKEN). The PWA picks "the first live character whose ctype is merchant" (`P:screens/account/BankScreen.tsx:30`) instead of the configured `merchantCharacter` (`D:party-inventory-panels.tsx:108-111`). Withdraw is disabled whenever the merchant is offline, because offline characters are deleted from `QK.characters` (`P:data/PartyDataProvider.tsx:299-302`). It can also send the withdrawal to a live bankboi or a second merchant. The auto-bank confirmation round-trip is also missing (#10). The server replies 409 `auto_bank_confirmation_required` (`R:inventory/withdrawal-bank-guard.ts:21-24`), the PWA shows the question as plain error text, and the user has no way to answer it.
3. **Most bank context-menu actions are missing.** Mark/auto-mark for upgrade, auto stand, auto NPC sale, auto deconstruction, Clear all marks, and tap-to-open item details are all absent (#7, #13–#15, #17, #19, #20). The "Mark all for stand" that does exist is BROKEN (#12): it sends `quantity = q` instead of `markAll: true`.
4. **Mail is about a quarter ported** (#43–#60). Missing: attachment picker (merchant inventory, bank, bankbois) with quantity, postage estimate, the two-step send confirmation (gold is spent), Refresh, Delete, Reply, attachment inspect, inbox error and loading states. A `taken: "pending"` attachment is shown as "(collected)" (BROKEN, #49). The Collect button stays enabled while collection is already queued or collecting.
5. **Bestiary, Tracktrix achievements and catalog are reduced to plain lists.** Bestiary has no search, map filter, sort, Tracktrix score/high-score/achievement progress, monster details dialog (spawns, definition grid, zone/world drops, Navigate-to-monster) or Tracktrix bonuses popover (#63–#78). `monsterAchievements` and `tracktrix` per-character state isn't modeled at all (#81, #82). The equipment catalog has none of its filters or sorts, and has no catalog-comparison mode (#84–#94).

## Feature table

Endpoints below are relative to `/party-api`.

### Bank sheet (`D:bank-sheet.tsx`, wired in `D:party-inventory-panels.tsx:102-187, 233-275`)

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | Open bank ("Inspect bank" header button) | `D:party-header.tsx:92-99` | `state.bank` | PRESENT | `P:screens/character-detail/AccountMenu.tsx:18`, `P:App.tsx:52` | |
| 2 | "No snapshot yet" empty state | `D:bank-sheet.tsx:407` | `state.bank` | PRESENT | `P:screens/account/BankScreen.tsx:45-46` | Wording differs ("No bank data yet.") |
| 3 | Search box (name/ID), non-matches dimmed to 25% | `D:bank-sheet.tsx:242-247, 410-417, 494` | client | MISSING | none — no search in `BankScreen.tsx` | |
| 4 | Pack header occupied/total, colored by free slots, items1 only 35 usable | `D:bank-sheet.tsx:430-466` | `bank.packs` | PRESENT | `P:BankScreen.tsx:55-65` | PWA also prints "N free" |
| 5a | `stat_type` badge on tile | `D:bank-sheet.tsx:514-526` | `item.stat_type` | MISSING | none — `BankRow` renders name/level/q only (`P:BankScreen.tsx:318-322`) | |
| 5b | Merchant's Luck clover (`item.m`) | `D:bank-sheet.tsx:538`, `D:mluck-clover.tsx` | `item.m` | MISSING | grepped `\.m\b`/`clover` in BankScreen: none | |
| 5c | Auto-stand banner ("Auto stand · Xg") | `D:bank-sheet.tsx:539`, `D:auto-stand-banner.tsx:5-8` | `state.autoStandMarks` | MISSING | `autoStandMarks` isn't read in BankScreen | |
| 5d | RESERVED overlay on items1 slots 35–41 (filled and empty) | `D:bank-sheet.tsx:472, 541-549, 675-681` | `bank.packs.items1` | MISSING | PWA counts it in "free" only (`P:BankScreen.tsx:55`) | |
| 5e | Mark indicators: amber border = withdraw, $ = stand (hidden when auto-stand rule exists), "NPC" = NPC sale | `D:bank-sheet.tsx:313-345, 494, 551-581` | `withdrawals[merchant]`, `standListings`, `npcSaleMarks` | PARTIAL | `P:BankScreen.tsx:242-253, 296-305, 315, 323` | Only one prioritized label is shown, so co-existing marks are hidden. PWA uses name+level identity (`P:models/state.ts:403-405`), not the dashboard `same()` all-keys compare (`D:same.tsx`). |
| 7 | Tap tile → full item details (bank source: add-to-stand, compare, catalog-compare, WTB) | `D:bank-sheet.tsx:486`, `D:party-inventory-panels.tsx:102-107`, `D:party-item-details.tsx:45-74` | — | MISSING | Tap only toggles an action strip (`P:BankScreen.tsx:316`) | |
| 8 | Mark/Unmark for withdrawal | `D:bank-sheet.tsx:588-598`, `D:bank-withdrawal.tsx:33-37` | POST `/command` `{character: merchantCharacter, type:"withdraw", pack, slot, item, markAll:false, removeAutoBankMark}` | BROKEN | `P:BankScreen.tsx:30, 353-360`, `P:api/partyApi.ts:238-242` | Wrong character resolution (see BROKEN details) |
| 9 | Mark all for withdrawal | `D:bank-sheet.tsx:600-610` | same + `markAll:true` | BROKEN | `P:BankScreen.tsx:361-368` | Same defect as #8 |
| 10 | "Remove automatic bank mark?" confirm, then retry with `removeAutoBankMark:true` | `D:bank-withdrawal.tsx:22-25, 39-51`; `R:inventory/withdrawal-bank-guard.ts:18-24` | 409 `code:auto_bank_confirmation_required` | MISSING | grepped `removeAutoBankMark` in `P:`: only `merchant/order` (`P:api/partyApi.ts:376-378`) | Dead end: the user can't confirm |
| 11 | Mark/Unmark for stand (dialog: price defaults to existing or `definition.g`, quantity defaults to existing or `q`, price helper buttons, markAll checkbox, disabled when stand is full 16/16) | `D:bank-sheet.tsx:612-624`, `D:party-inventory-panels.tsx:129-152`, `D:party-management-panels.tsx:~235-420`, `D:use-party-console.tsx:589-598` | POST `/merchant/stand` `{id, slot, item, bankPack, price, quantity, markAll, remove}` | PARTIAL | `P:BankScreen.tsx:327-405`, `P:api/partyApi.ts:248-256` | Single mark always sends `quantity:1` (dashboard default is the whole stack). Default price is `item.price` (usually blank) instead of `definition.g`. No stand-full gate, no price helpers. Unmark (`remove:true, id`) is correct. |
| 12 | "Mark all for stand" | dashboard: markAll checkbox in the stand dialog (`D:party-management-panels.tsx:~393-410`) → `markAll:true` lists every identical copy (merchant + bank) | `/merchant/stand` `markAll` | BROKEN | `P:BankScreen.tsx:394-403, 339` | PWA's "Mark all" sends `quantity: q` for this one slot and never `markAll` |
| 13 | Auto mark for stand… (disabled if no merchant or `item.l`) | `D:bank-sheet.tsx:626-632`, `D:party-inventory-panels.tsx:172-177`, `D:use-party-console.tsx:581-586` | POST `/merchant/auto-stand` `{item, price, action:"set"}` | MISSING | `api.autoStand` exists (`P:api/partyApi.ts:333-335`) but isn't used in BankScreen | |
| 14 | Mark for upgrade (tier submenu with scroll cost) → withdraw with `upgradeTiers` | `D:bank-upgrade-actions.tsx:5-14`, `D:upgrade-actions.tsx:52-81`, `D:party-inventory-panels.tsx:167-168` | POST `/command` withdraw + `upgradeTiers` (`R:inventory/transfer-commands.ts:137-146`) | MISSING | grepped `upgradeTiers` in `P:`: none | |
| 15 | Auto mark for upgrade (tiers) | `D:upgrade-actions.tsx:82-101`, `D:party-inventory-panels.tsx:169-170` | POST `/command` `{character: merchant, type:"auto-upgrade-mark", slot:-1, item, tiers}` | MISSING | Only used from ItemActionPanel for carried items (`P:screens/itempanel/ItemActionPanel.tsx:248`) | |
| 16 | Mark for deconstruction: confirmation dialog with possible rewards %, cost per item; disabled without merchant | `D:bank-deconstruction-actions.tsx:6-17`, `D:deconstruction-confirmation.tsx:13-60`, `D:party-inventory-panels.tsx:271-275` | POST `/deconstruction/mark` `{pack, slot, item, all}` | PARTIAL | `P:BankScreen.tsx:407-424`, `P:api/partyApi.ts:308-310` | Wiring matches. No confirmation, rewards or cost. PWA adds "Mark all for deconstruction" (`all:true`), which the dashboard bank menu doesn't offer (server supports it). |
| 17 | Auto mark for deconstruction | `D:bank-deconstruction-actions.tsx:12-15`, `D:party-inventory-panels.tsx:274` | POST `/deconstruction/auto` `{character: merchant, item}` | MISSING | `api.autoDeconstruct` exists (`P:api/partyApi.ts:319-323`), not used in bank | |
| 18 | Sell to NPC… dialog (quantity editable, default = stack; modified-item acknowledgement; always a confirmation) | `D:bank-sheet.tsx:640-650`, `D:party-inventory-panels.tsx:153-164`, `D:use-party-console.tsx:604-650`, `D:party-management-panels.tsx:498-609` | POST `/merchant/npc-sale` `{source:"bank", pack, slot, item, quantity, acknowledged}` | PARTIAL | `P:BankScreen.tsx:426-464`, `P:api/partyApi.ts:283-293` | Unmodified items sell on one tap with no confirmation. Quantity is fixed at 1 ("Sell") or `q` ("Sell all"), with no input. |
| 19 | Auto sell to NPC… | `D:bank-sheet.tsx:652-658`, `D:party-inventory-panels.tsx:178`, `D:use-party-console.tsx:651-660` | POST `/merchant/auto-npc-sale` `{item, character: merchant, action:"set"}` | MISSING | API exists (`P:api/partyApi.ts:327-329`), not in bank | |
| 20 | Clear all marks (manual marks + matching shared auto rules) | `D:clear-item-marks.tsx:5-12`, `D:party-inventory-panels.tsx:179-182` | POST `/command` `{character: merchant, type:"clear-item-marks", pack, slot, item}` | MISSING | Only carried items have it (`P:ItemActionPanel.tsx:318`) | |
| 21 | Disabled states (no merchant, `item.l` locked, stand full) | `D:bank-sheet.tsx:590, 602, 614, 626, 652` | — | PARTIAL | Only `!merchant` on withdraw (`P:BankScreen.tsx:356, 364`) | |
| 22 | "Sort on next visit · On/Off" + status (Sorting / Retry pending: msg / Queued) + help text | `D:bank-sort-control.tsx:22-31` | POST `/merchant/bank-sort` `{enabled}`; `bankSortMode`, `bankSortRequest` | PRESENT | `P:BankScreen.tsx:43, 128-147`, `P:api/partyApi.ts:533-535` | Help text and error display missing (minor) |
| 23 | Bank sorting mode radio (automatic / request) in Merchant settings | `D:bank-sort-control.tsx:14-21`, `D:merchant-collection-settings.tsx:35` | POST `/merchant/bank-sort` `{mode}` | PRESENT | `P:screens/character-detail/sections/MerchantControlsSection.tsx:99-100, 174-180` | Explanatory text missing |
| 24 | "Marked withdrawals create merchant jobs" toggle | `D:withdrawal-trip-setting.tsx:5-26`, `D:merchant-collection-settings.tsx:39`, `D:merchant-card-controls.tsx:305` | POST `/merchant/routine-priorities` `{priorities:{}, enabled:{withdrawals}}`; `merchantAutomations.withdrawals` | MISSING | grepped `withdrawals` in `P:lib/routineLabels.ts`, `RoutinesScreen.tsx`, `MerchantControlsSection.tsx`: none | The `withdrawals` routine label ("Marked withdrawals", `D:routine-labels.tsx:8`) is also missing from `P:lib/routineLabels.ts:5-32` |
| 25 | Floor names (Main bank / Bank basement / Bank underground) | `D:bank-sheet.tsx:383-391` | `bankVaults[].floor` | PARTIAL | `P:BankScreen.tsx:176` shows raw `bank_b`/`bank_u` | |
| 26 | Floor access status "Accessible" / "Locked · requires KEY" | `D:bank-sheet.tsx:373-381, 743-755` | `bankVaults`, `bank.packs` | MISSING | none | |
| 27 | Unlock floor with key; "Owned: N" (merchant inventory + bank); disabled if 0 keys or no merchant | `D:bank-sheet.tsx:349-371, 759-791` | POST `/bank/unlock` `{pack, kind:"key"}` | PARTIAL | `P:BankScreen.tsx:192-231` | Button exists for gold-0 keyed vaults. No owned count, no disable when keys aren't owned. Server returns "required bank key is not owned" (`R:http/bank-unlock.ts:54`). |
| 28 | Gold vault unlock buttons only when the floor is accessible | `D:bank-sheet.tsx:795-839` | POST `/bank/unlock` `{pack, kind:"gold"}` | BROKEN | `P:BankScreen.tsx:157-158, 197-198` | PWA offers "Unlock · Xg" for every locked vault, including ones on locked floors. Server rejects 409 "unlock the bank floor first" (`R:http/bank-unlock.ts:50-51`). |
| 29 | Notices: "No purchasable locked vaults…" / "Vault purchases remain disabled until floor access is unlocked." | `D:bank-sheet.tsx:841-857` | — | MISSING | none | |
| 30 | Unlock confirmation dialog explaining "MERCHANT will spend N gold to permanently unlock PACK" / "retrieve and consume KEY" | `D:bank-sheet.tsx:1190-1270` | — | PARTIAL | `P:BankScreen.tsx:203-222` ("Really unlock · Ng?") | Doesn't say a merchant errand is queued or that the key is consumed |
| 31 | Unlock request wiring | `D:party-inventory-panels.tsx:183-187` | POST `/bank/unlock` `{pack, kind}` | PRESENT | `P:api/partyApi.ts:300-302` | PWA sends `kind: undefined` for gold. Server treats non-`key` as gold (`R:http/bank-unlock.ts:52-55`), so it works. |
| 32 | Vault gold cost display (abbreviated with exact tooltip) | `D:bank-sheet.tsx:823-831` | `bankVaults[].gold` | PRESENT | `P:BankScreen.tsx:198` (exact `toLocaleString`) | |

### Bankbois (`D:bank-sheet.tsx:871-1184`, `D:account-settings.tsx`)

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 33 | Bankbois section header "Transparent overflow storage · N staged or waiting" | `D:bank-sheet.tsx:891-903` | `state.bankboiQueue` (`R:telemetry/public-state.ts:153`) | MISSING | grepped `bankboiQueue`, `bankbois` in `P:`: none in code (comment only at `P:lib/inventoryCounts.ts:7-9`) | |
| 34 | Create bankboi button (busy spinner, Success/Failed output, "NAME created · provisioning queued") | `D:bank-sheet.tsx:267-309, 907-941`, `D:party-inventory-panels.tsx:112-115` | POST `/bankbois/create` `{}` (`R:http/dashboard.ts:81`) | MISSING | none | |
| 35 | First-bankboi confirm "This will reserve 7 slots from bank pane 1" | `D:bank-sheet.tsx:871-889` | — | MISSING | none | |
| 36 | "Set bankboi name in settings first" alert and button disabled without prefix | `D:bank-sheet.tsx:909, 925` | `state.bankboiPrefix` | MISSING | none | |
| 37 | Bankboi card: name, `transaction.mode · phase` or state, occupied/42, error | `D:bank-sheet.tsx:947-1017`, `D:bankboi.tsx` | `state.bankbois[]` | MISSING | none | |
| 38 | Delete bankboi (only when empty; two-step "Really? ×"), error surfaced | `D:bank-sheet.tsx:985-1007`, `D:party-inventory-panels.tsx:116-122` | POST `/bankbois/:name/delete` (`R:http/dashboard.ts:84`, `R:http/bankboi-delete.ts:56-77`, 180-minute cooldown) | MISSING | none | |
| 39 | Bankboi 42-slot item grid with the full context menu (withdraw, withdraw all, stand, auto stand, upgrade, deconstruct, NPC sale, auto NPC, clear marks) on pack `bankboi:NAME` | `D:bank-sheet.tsx:1019-1164` | same endpoints with `pack:"bankboi:NAME"` | MISSING | none | |
| 40 | "No bankbois yet. Reserved overflow cargo will wait safely…" | `D:bank-sheet.tsx:1172-1178` | — | MISSING | none | |
| 41 | Default bankboi name (3–11 chars, maxLength 11, help text, Saved/error feedback) | `D:account-settings.tsx:9, 22-25` | POST `/dashboard-preferences` `{bankboiPrefix}` | PARTIAL | `P:screens/account/SettingsScreen.tsx:67-73`, `P:api/partyApi.ts:680-682` | No validation hint or maxLength, and the result is ignored (no error or saved feedback) |

### Mail (`D:send-mail-dialog.tsx`, `D:party-send-mail-dialog.tsx`, `D:mail-*`)

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 43 | Header "Mail (N)" button with live count (10s poll) | `D:party-header.tsx:44-51`, `D:mail-count.tsx:2-5` | GET `/mail` `.count` | PARTIAL | `P:AccountMenu.tsx:12` (no count); count only in screen title `P:screens/account/MailScreen.tsx:27` | |
| 44 | Inbox row: subject or "(No subject)", "From X", localized date, attachment status line | `D:send-mail-dialog.tsx:227-251` | GET `/mail` `messages[]` | PARTIAL | `P:MailScreen.tsx:76-101` | Raw `sent` string. Attachment status is collapsed into collect/collected. |
| 45 | Refresh (forces game inbox refetch) | `D:send-mail-dialog.tsx:103-120, 200-206` | POST `/mail/refresh` (`R:http/dashboard.ts:94-96`, `R:http/mail-inbox.ts:14-28`) | MISSING | grepped `mail/refresh`: none; scaffold refresh only re-polls state | |
| 46 | "Mail may be out of date: ERR" and "Loading mail…" vs "No received mail." | `D:send-mail-dialog.tsx:217-226` | `inbox.error`, `inbox.updatedAt` | MISSING | `P:models/mail.ts:7-10` has no `error`/`updatedAt` | |
| 47 | Message detail: subject, `from → to · date`, body (pre-wrap) | `D:send-mail-dialog.tsx:254-263` | `messages[].to` | PARTIAL | `P:MailScreen.tsx:77-80` | No "to"; body not pre-wrapped |
| 48 | Attachment tile: sprite, catalog name, `+level`, `× q`; tap to inspect item details | `D:send-mail-dialog.tsx:264-300` | — | PARTIAL | `P:MailScreen.tsx:81-83` (name only) | No sprite, level, quantity or inspect |
| 49 | Attachment status: Collected / "Game is processing collection" (`taken:"pending"`) / `collection` text / `collectionError` | `D:send-mail-dialog.tsx:301-310`, `D:received-mail.tsx:12-14` | `taken`, `collection`, `collectionError` | BROKEN | `P:MailScreen.tsx:73, 95-97`; `P:models/mail.ts:12-23` lacks `collection`/`collectionError` | `"pending"` renders as "(collected)" |
| 50 | Collect attachment, disabled when taken≠false or collection queued/collecting | `D:send-mail-dialog.tsx:311-323` | POST `/mail/collect` `{id}` | PARTIAL | `P:MailScreen.tsx:84-94`, `P:api/partyApi.ts:740-742` | Wiring is correct. Stays enabled while queued or collecting, and errors aren't shown. |
| 51 | Delete message (two-step "Confirm permanent deletion" / Cancel; disabled while an attachment is uncollected) | `D:send-mail-dialog.tsx:327-353` | POST `/mail/delete` `{id}` | MISSING | grepped `mail/delete`: none | |
| 52 | Reply (prefills recipient) | `D:send-mail-dialog.tsx:354-369` | — | MISSING | none | |
| 53 | Compose: Character name, Subject (max 74), Message (max 1000); Send disabled until recipient and subject are set | `D:send-mail-dialog.tsx:390-425, 571-578` | POST `/merchant/send-mail` `{recipient, subject, message, quantity, source?}` | PARTIAL | `P:MailScreen.tsx:31-55`, `P:api/partyApi.ts:734-736` | No maxLength or disable rules (server validates, `R:http/send-mail.ts:9-17`) |
| 54 | Attachment picker: merchant inventory, every bank pack, every bankboi, with search; select / remove / clear | `D:send-mail-dialog.tsx:121-145, 377-387, 426-546` | `source:{pack, slot, item}` | MISSING | Comment at `P:MailScreen.tsx:10-13` admits this; `api.sendMail` has no source param | |
| 55 | Attachment quantity "(1–N)" for stackables, validated | `D:send-mail-dialog.tsx:161-168, 461-476` | `quantity` (`R:http/send-mail.ts:43-48`) | MISSING | none | |
| 57 | Postage estimate "Postage: N gold per message, charged by Adventure Land" + attachment warning | `D:send-mail-dialog.tsx:71-83, 555-560` | GET `/mail/postage` (`R:http/registration.ts:65`) | MISSING | grepped `postage` in `P:`: comment only | |
| 58 | Two-step send ("Send mail" → "Really send mail?") | `D:send-mail-dialog.tsx:579-625` | — | MISSING | `P:MailScreen.tsx:37-54` sends on first tap | Costs gold |
| 60 | decodeMailInbox (string-encoded `item` from older coordinator) | `D:decode-mail-inbox.tsx:5-13` | — | MISSING | `P:data/PartyDataProvider.tsx:200-203` stores raw | Low impact |

### Bestiary / monster reference / achievements

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 62 | Open Bestiary | `D:party-header.tsx:60-67` | `state.bestiaryCatalog` | PRESENT | `P:AccountMenu.tsx:14`, `P:App.tsx:48` | |
| 63 | Tracktrix bonuses popover (shared, newest active character) | `D:bestiary-dialog.tsx:100-107`, `D:tracktrix-bonuses.tsx:6-29` | `characters[*].tracktrix` (diagnostics) | MISSING | grepped `tracktrix`: none | |
| 64 | Map filter chips ("Show monsters in") | `D:bestiary-dialog.tsx:63, 71, 114-126` | `spawnRecords[].map` | MISSING | none (`spawnRecords` is modeled, `P:models/state.ts:108`) | |
| 65 | Search monsters by name/id | `D:bestiary-dialog.tsx:72-74, 128-133` | — | MISSING | none | |
| 66 | Sort (threat, HP, attack, XP, range, name, Tracktrix score, score to next) + asc/desc toggle | `D:bestiary-dialog.tsx:26-35, 76-90, 134-152` | — | MISSING | PWA uses server order | |
| 67 | "Tracktrix data unavailable…" notice | `D:bestiary-dialog.tsx:154-156` | — | MISSING | none | |
| 69 | Card: sprite, name, HP, XP, ATK, threat | `D:bestiary-dialog.tsx:174-185` | `hp, xp, attack, threat` | PARTIAL | `P:screens/account/BestiaryScreen.tsx:35-40` | No threat (field is modeled) |
| 70 | Card: score / final milestone, "High score: OWNER", "N / M achievements unlocked", "N score to next achievement" or "All achievements complete", "Tracktrix required" | `D:bestiary-dialog.tsx:161-212` | `monsterAchievements` + `definition.achievements` | MISSING | none | |
| 71 | Monster details dialog on tap | `D:monster-details-dialog.tsx:19-79`, `D:party-reference-panels.tsx:76-96` | — | PARTIAL | `P:BestiaryScreen.tsx:43-53` inline drop list only | |
| 72 | `G.monsters.ID` line | `D:monster-details-dialog.tsx:46-48` | — | MISSING | none | |
| 73 | Navigate to monster (MapPin; disabled for `tinyp` with tooltip) → FarmingAreaPicker override | `D:monster-details-dialog.tsx:50-61`, `D:party-workspace.tsx:115-143` | `/farming-mode` via picker | MISSING | `P:components/FarmingAreaPicker.tsx` exists, used only by FarmingSection | Reuse opportunity |
| 74 | Monster achievements panel (✓ Unlocked / ○ Locked · reward, required score, total unlocked, score, owner) | `D:monster-achievement-progress.tsx:5-60` | `definition.achievements`, `monsterAchievements` | MISSING | none | |
| 75 | Recorded spawn locations with restriction reasons | `D:monster-spawns.tsx:12-34` | `spawnRecords[].restrictions` | MISSING | Data is modeled (`P:models/state.ts:84-97`) but not rendered | |
| 76 | DefinitionGrid of every raw definition field (duration formatting) | `D:monster-details-dialog.tsx:66`, `D:definition-grid.tsx:5-36` | `monster.definition`, `range` | MISSING | `P:models/state.ts:101-110` has no `definition`/`range` | |
| 77 | Monster-specific drops formatted with `formatDropRate` (100% ×N + remainder) | `D:bestiary-drops.tsx:18-35, 53-56`, `D:drop-rate.ts:16-25` | `drops[]` | BROKEN | `P:BestiaryScreen.tsx:68`, `P:screens/itemdetail/ItemDetailBrowser.tsx:489` use `(rate*100).toFixed(4)%` | Wrong for `rate>1` (e.g. "250.0000%") and drops ×quantity semantics. `formatDropRate` is already ported (`P:lib/itemFormulas.ts:434-443`). |
| 78 | Zone & world drops (from catalog `meta.world.drops` where `monsterId` matches) | `D:indirect-bestiary-drops.tsx:6-31`, `D:bestiary-drops.tsx:57-63` | `merchantCatalog.allItems[].meta.world.drops` | MISSING | none | |
| 79 | Click a drop → item details "Dropped by MONSTER" | `D:bestiary-drops.tsx:26`, `D:party-reference-panels.tsx:67-74, 85-94` | — | PARTIAL | Not clickable in `P:BestiaryScreen.tsx:58-71`; clickable inside `P:ItemDetailBrowser.tsx:484-491` | |
| 80 | Item details → monster drill-down | (item-details slice) | — | PARTIAL | `P:ItemDetailBrowser.tsx:470-497` shows HP/ATK/XP + drops only | Same missing pieces as #72–#78 |
| 81 | Per-character `monsterAchievements` aggregated to account best score + owner | `D:monster-achievements.ts:7-19`, `D:use-party-console.tsx:796-797`; sent by `R:telemetry/public-state-characters.ts:51-52` | `characters[*].monsterAchievements` | MISSING | grepped `achievement` in `P:`: none | |
| 82 | Per-character `tracktrix` `{active, bonuses}` | `D:char.tsx:18`; `R:telemetry/public-state-characters.ts:53` | `characters[*].tracktrix` | MISSING | none | Also drives character-card `TracktrixBonuses` (out of slice) |

### Catalog (`D:equipment-catalog-dialog.tsx`, `D:party-equipment-catalog-dialog.tsx`, `D:catalog-comparison.tsx`)

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 83 | Open Catalog | `D:party-header.tsx:52-59` | `merchantCatalog.allItems` | PRESENT | `P:AccountMenu.tsx:13`, `P:App.tsx:47` | |
| 84 | Equipment-only scope (`EQUIPMENT_TYPES`) | `D:equipment-catalog-dialog.tsx:69-73` | — | PARTIAL | `P:screens/account/CatalogScreen.tsx:20` shows every item | A superset, but much noisier |
| 85 | Search by name, ID or set | `D:equipment-catalog-dialog.tsx:90-99, 172-177` | — | PARTIAL | `P:CatalogScreen.tsx:20` name only | |
| 86 | Sort (25 options: tier, name, set, value, attack … luck) | `D:equipment-catalog-dialog.tsx:110-122, 133-159, 178-189` | — | MISSING | none | |
| 87 | Type filter chips (multi-select, "All") | `D:equipment-catalog-dialog.tsx:51-54, 191-223` | — | MISSING | none | |
| 88 | Class filter chips + "Exclusive gear" checkbox | `D:equipment-catalog-dialog.tsx:78-88, 101-108, 224-270` | `meta.usage.classes` | MISSING | none | |
| 89 | Summary line "N items · sorted by X · usable by…" / "Showing N of M" | `D:equipment-catalog-dialog.tsx:271-282` | — | MISSING | none | |
| 90 | Card: sprite, name, `type · T{tier}`, set, sort-stat value | `D:equipment-catalog-dialog.tsx:303-319` | — | PARTIAL | `P:CatalogScreen.tsx:37-39` (sprite, name, max level) | |
| 91 | Click → item details "Equipment catalog" with WTB action | `D:party-equipment-catalog-dialog.tsx:40-47`, `D:party-item-details.tsx:44` | — | PARTIAL | `P:CatalogScreen.tsx:45-51` read-only ItemDetailBrowser | No WTB entry point from the catalog |
| 92 | Incremental rendering (120-row batches on scroll) | `D:equipment-catalog-dialog.tsx:25-29, 124-132, 283-288` | — | MISSING | renders all rows | Mobile performance risk |
| 93 | Catalog comparison mode: started from item details "compare with catalog" (A = selected item), Add to compare (≤3), selected chips, Compare selected, Cancel comparison | `D:party-equipment-catalog-dialog.tsx:20-72`, `D:equipment-catalog-dialog.tsx:170, 321-331`, `D:party-item-details.tsx:70-74` | `catalogComparison` | MISSING | grepped `compar` in `P:`: only the GearComparisonSheet (equipped-vs-item) | |
| 94 | Comparison table: preview-level slider, stat-scroll select, per-stat value and delta/% vs A, type/wtype/damage_type/ability rows, Remove | `D:catalog-comparison.tsx:17-99` | — | MISSING | none | |

### Reference panels (`D:party-reference-panels.tsx`) and cave map

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| 95 | "Couldn't complete action" error dialog | `D:party-reference-panels.tsx:128-148` | — | PRESENT | `P:components/ActionToastHost.tsx`, `P:api/partyApi.ts:160-192` | Toast instead of a modal |
| 96 | Donate gold dialog: explanation, amount, XP preview at `donationXpPerGold` (fallback 3.2), error | `D:party-reference-panels.tsx:149-193`, `D:use-party-console.tsx:522-534` | POST `/merchant/donate` `{amount}` | PARTIAL | `P:MerchantControlsSection.tsx:85, 140-152`, `P:api/partyApi.ts:483-485` | No XP preview, no explanation text, and errors only show as a toast |
| 97 | Skills dialog | `D:party-reference-panels.tsx:97-101` | `skillCatalog` | PRESENT | `P:screens/account/SkillsScreen.tsx`, `P:App.tsx:49` | Not deep-audited; belongs to another slice |
| 98 | Anniversary dialog (event status, cycle/failsafe, label grid, chat advertisement, activity log, auto-chat toggle) | `D:party-reference-panels.tsx:102-118`, `D:anniversary-dialog.tsx:68-180` | POST `/dashboard-preferences` `{anniversaryAutoChat}`, POST `/anniversary/chat-advertise` | PARTIAL | `P:SettingsScreen.tsx:75-94` (toggle + send only) | Status and activity body missing; flagged for the events auditor |
| 99 | Gear comparison dialog | `D:party-reference-panels.tsx:119-127` | — | PRESENT | `P:screens/itempanel/GearComparisonSheet.tsx` | Not deep-audited |
| 100 | Cave of Many Dreams full map: live map-stream per participant, pins (party/required/complete/events/waypoint), native-size toggle, add waypoint, set waypoint | `D:cave-map.tsx:19-175`, `D:dungeon-panel.tsx:114`, `D:dungeon-query.ts:21-34` | GET `/map-stream/:name` (SSE); POST `/daily-dungeons` `{run, action:"waypoint", map, x, y, operationId}` | MISSING | grepped `cave`, `dungeon`, `daily-dungeons` in `P:`: none | The whole dungeon panel looks absent (out of slice) |

(Game-client-only routes `/bank-complete`, `/bankboi/checkpoint`, `/bankboi/complete`, `/merchant/bank-sort/checkpoint`, `/stat-scroll-complete` and `/equip-delivery-complete` (`R:http/inventory-receipts.ts`, `R:http/bankboi-storage.ts`) are called by `characters/shared.js`, not the UI, so they're N/A for the PWA.)

## BROKEN details

### B1 (#8, #9). Withdrawal target character
Dashboard (`D:party-inventory-panels.tsx:108-111`, `D:bank-withdrawal.tsx:33-36`):
```ts
withdraw(state.merchantCharacter, pack, entry)          // configured merchant, online or not
void submit({ character, type: "withdraw", pack, slot: entry.slot, item: { ...entry.item }, markAll, ... })
```
PWA (`P:screens/account/BankScreen.tsx:30, 356-357`):
```ts
const merchant = Object.entries(characters).find(([, c]) => c.vitals?.ctype === 'merchant')?.[0] ?? null
<Button disabled={!merchant} onClick={() => void run(() => api.withdrawFromBank(merchant!, ...))}>
```
`characters` only holds live records; offline ones are deleted (`P:data/PartyDataProvider.tsx:299-302`). Consequences:
- Withdraw is disabled whenever the merchant is offline. The dashboard allows queueing, and the merchant collects later.
- If a bankboi (also ctype merchant) or a second merchant is live, the withdrawal can go to the wrong character. The server accepts withdrawals for any owned character (`R:inventory/transfer-commands.ts:155-166`).

The PWA doesn't model `merchantCharacter` anywhere (grepped `merchantCharacter` in `P:`: only comments and params in `partyApi.ts`). The same `withdrawals[merchant]` lookup (`P:BankScreen.tsx:84`) drives the "Withdrawal" badge, so the badge is also wrong in these cases.

### B2 (#12). "Mark all for stand" means something different
Dashboard: the stand dialog checkbox "Mark all for stand: List every identical copy held by the merchant or stored in the bank at this price" sets `markAll:true` (`D:party-management-panels.tsx:~393-410`, posted at `D:use-party-console.tsx:589-597`). The server calls `marks.markAll(item, price)` (`R:http/stand-marks.ts:35, 69`).
PWA (`P:BankScreen.tsx:336-341`):
```ts
api.markForStand(entry.item, entry.slot, Number(standPrice) || 0, { bankPack: pack, quantity: standForm === 'all' ? (entry.item.q ?? 1) : 1 })
```
The PWA never sends `markAll`. Its "all" variant only lists this slot's full stack, and its single variant lists one unit of a stack. The dashboard's single default is the whole stack (`D:party-inventory-panels.tsx:150`).

### B3 (#28). Gold-unlock offered on inaccessible floors
Dashboard shows gold buttons only when `accessible` (`D:bank-sheet.tsx:795`). Otherwise it shows "Vault purchases remain disabled until floor access is unlocked."
PWA (`P:BankScreen.tsx:157, 197-198`) lists every locked vault, and any vault that isn't `gold===0 && key` gets "Unlock · Ng". The server returns 409 `unlock the bank floor first` (`R:http/bank-unlock.ts:44-51`). The user gets a confusing error rather than a disabled control.

### B4 (#49). Mail attachment status
Dashboard (`D:send-mail-dialog.tsx:302-309`): `taken===true` → "Collected"; `"pending"` → "Game is processing collection"; otherwise `collection || "Unclaimed"`, plus `: collectionError`.
PWA (`P:MailScreen.tsx:73`):
```ts
const taken = typeof mail.taken === 'boolean' ? mail.taken : mail.taken === 'pending'
```
`"pending"` maps to `true` and renders "(collected)". `collection` and `collectionError` aren't modeled (`P:models/mail.ts:12-23`), so the Collect button stays enabled while collection is `queued`/`collecting` (the dashboard disables it, `D:send-mail-dialog.tsx:312-318`).

### B5 (#77). Drop-rate formatting
Dashboard always uses `formatDropRate` (`D:bestiary-drops.tsx:35`, `D:drop-rate.ts:16-25`). For a rate above 1, e.g. 2.5 with qty 1, that gives "100% ×2 + 50%".
PWA (`P:BestiaryScreen.tsx:68`, `P:ItemDetailBrowser.tsx:489`): `${(drop.rate * 100).toFixed(4)}%` gives "250.0000%". It also appends quantity as " x2" on the name instead of "×N" on the rate. The correct helper is already ported at `P:lib/itemFormulas.ts:434`, but not used here.

### B6. Withdrawal auto-bank confirmation dead end (#10, listed as MISSING because there's no UI at all)
The server reply `{code:"auto_bank_confirmation_required", error:"This item is automatically marked for bank. Allow withdrawal and remove mark?"}` (`R:inventory/withdrawal-bank-guard.ts:21-24`) reaches the PWA as an error string under the row (`P:BankScreen.tsx:307-312, 465`). No retry with `removeAutoBankMark:true` is possible (`P:api/partyApi.ts:238-242` has no such parameter). The dashboard handles it in `D:bank-withdrawal.tsx:25, 39-51`.

## Reuse opportunities

- **Pure logic to port verbatim:**
  - `D:drop-rate.ts` (already ported as `P:lib/itemFormulas.ts:427-443`; switch BestiaryScreen and ItemDetailBrowser over to it).
  - `D:indirect-bestiary-drops.tsx`: pure function over catalog `meta.world.drops`.
  - `D:monster-achievements.ts`: `aggregateMonsterAchievements`.
  - `achievementMilestones` and the sort comparator in `D:bestiary-dialog.tsx:36-40, 64-90`.
  - The `reward()` formatter in `D:monster-achievement-progress.tsx:16-25`.
  - `D:bank-sale-copies.ts` (needs bankbois).
  - `D:decode-mail-inbox.tsx`.
  - `D:same.tsx`, to replace the weaker `sameMarkedItem` (`P:models/state.ts:403`) for bank mark matching.
  - The `floorAccessible`, `keyQuantity`, `floorNames` and `locked` derivations in `D:bank-sheet.tsx:347-391, 723-727`.
  - The `marked`/`standMarked`/`npcMarked` predicates in `D:bank-sheet.tsx:313-345`.
  - The equipment catalog filter/sort pipeline (`D:equipment-catalog-dialog.tsx:69-123`, the `sorts` list at 133-159, plus `D:equipment-types` and `D:catalog-comparison.tsx:22-27` with `propertiesAtLevel`/`ITEM_DETAIL_PROPERTY_RANK`/`STAT_SCROLLS`). Check whether `P:lib/itemFormulas.ts` already has `propertiesAtLevel`.
  - `D:deconstruction.ts` `deconstructionRewards` for the confirmation sheet (`canDeconstruct` is already in `P:models/state.ts:386`).
  - `D:monster-spawns.tsx` `reasons` map.
  - The `attachmentLevel`/`stackable`/`validQuantity` logic in `D:send-mail-dialog.tsx:146-168`.
- **Existing PWA helpers to extend rather than duplicate:**
  - `P:components/FarmingAreaPicker.tsx`: reuse for bestiary "Navigate to monster" (dashboard passes `override` and the leader, `D:party-workspace.tsx:115-143`).
  - `P:screens/itemdetail/ItemDetailBrowser.tsx` `MonsterDetailContent` (470-497): grow it into the full monster detail (spawns, achievements, definition, zone/world drops, navigate), then use it from BestiaryScreen too, so there is one monster view.
  - `P:screens/itempanel/ItemActionPanel.tsx`: it already holds auto-stand, auto-upgrade-mark, clear-item-marks, auto-deconstruct and auto-NPC flows for carried items. Give it a "bank source" mode (`pack`, merchant as owner, `slot:-1` for auto rules) and open it from the bank row tap. That covers #7, #13–#15, #17, #19 and #20 without a second implementation.
  - `P:api/partyApi.ts:238`: `withdrawFromBank` needs `upgradeTiers?` and `removeAutoBankMark?` params. `sendMail` (734) needs `quantity` and `source`. Add `refreshMail`, `deleteMail`, `getPostage`, `createBankboi`, `deleteBankboi(name)`, and `saveRoutinePriorities({}, {withdrawals})` (the method already exists at 522).
  - `P:models/state.ts` `PartyStateDynamic`: add `merchantCharacter`, `bankbois`, `bankboiQueue`, and character `monsterAchievements`/`tracktrix` (the server already sends all of these, `R:telemetry/public-state.ts:152-153, 246`; `R:telemetry/public-state-characters.ts:51-53`). `BestiaryMonster` needs `range` and `definition`. `ReceivedMail` needs `collection`, `collectionError`, and `taken: boolean | 'pending'`. `MailSnapshot` needs `error` and `updatedAt`.
  - A stand-dialog component shared with the Stand screen (commerce slice) instead of BankScreen's inline price row, so bank marks get the same defaults, price helpers and `markAll`.

## Out-of-slice observations

1. **No `merchantCharacter` anywhere in the PWA.** Other screens that infer "the merchant" from `ctype==='merchant'` probably have the same offline/bankboi defect as B1. Grep for `ctype === 'merchant'` across `P:screens`.
2. **RoutinesScreen is missing routine keys.** `ROUTINE_LABELS` (`P:lib/routineLabels.ts:5-32`) has no `withdrawals` ("Marked withdrawals", `D:routine-labels.tsx:8`) and probably no `deliveries`. The dashboard also gives those two special enable semantics (`D:routine-priorities-dialog.tsx:61, 230-233`). Delivery-trip setting (`D:delivery-trip-setting.tsx`, `D:merchant-collection-settings.tsx:38`) is probably missing as well. Other Merchant settings items to check: `BuyUpgradeBatchSetting`, `MerchantStandLocationSetting`.
3. **The daily dungeon panel appears absent.** `/daily-dungeons` isn't referenced in `P:`; the cave map (#100) is only part of it.
4. **Anniversary dialog** status and activity log are missing (#98).
5. **ALData auth mail.** The dashboard sets `ALDataAuthPending(true)` after sending `earthiverse`/`aldata_auth` (`D:party-send-mail-dialog.tsx:30`). The PWA's direct send (`P:SettingsScreen.tsx:272`) doesn't appear to track a pending state.
6. **Character-card monster details and Tracktrix bonuses.** `D:connected-character-card.tsx:175-183` opens monster details with achievements; `D:tracktrix-bonuses.tsx:12-15` shows per-character Tracktrix bonuses. Both depend on #81/#82 state that the PWA doesn't model.
7. **Account settings roster grid** (`D:account-settings.tsx:10-21`): character portraits including bankbois, plus 8-slot empty placeholders. The PWA Settings roster has no bankbois.
8. **Mock server coverage.** `e2e/fixtures/mockPartyServer.ts` only knows `party-api/mail`, `mail/collect` and `command` in this domain (lines 346, 666-667). E2E tests can't cover bank unlock, bank sort, deconstruction, npc-sale, bankbois, mail refresh/delete/postage or send-mail.
