# 06 — Adversarial challenge: Bank / Bankbois / Mail / Bestiary / Catalog / Reference

Reviewer 06. Abbreviations as in the report: `D:` = `console-v1.2.0/dashboard/features/party/`, `R:` = `console-v1.2.0/runtime/coordinator/`, `P:` = `F:\CodingProjects\adventureland-party-mobile\web\src\`, `S:` = `console-v1.2.0/scripts/`.

## Headline finding the audit missed (CRITICAL, cross-cutting)

**The PWA never fetches the `config` state section. In v1.2.0, `core&dashboard=1` strips every config field, so a large part of the PWA's `dynamicState` stays at its empty defaults.**

- The PWA polls `state?section=core&dashboard=1`, `section=bank`, `section=market` and `section=logs` (`P:data/PartyDataProvider.tsx:140-143`). It never requests `section=config`. Grepping `section=config` in `P:` finds nothing. The only full `state` fetch (`P:data/PartyDataProvider.tsx:222`) parses `roster` and throws the rest away (`:225-227`).
- The server's `core` with `dashboard=1` returns `omitConfigFields({...})` (`R:telemetry/public-state.ts:255-260`). That deletes every key in `configFields` (`R:telemetry/public-state.ts:65-82`, deleted at `:101-105`). The list includes `standListings`, `npcSaleMarks`, `deconstructionMarks`, `deconstructionCatalog`, `autoStandMarks`, `standBids`, `autoNpcSales`, `autoDeconstruction`, `merchantAutomations`, `merchantRoutinePriorities`, `bankboiPrefix`, `merchantCharacter`, `marked`, `upgrades`, `autoItemMarks`, `leader`, `followers`, `farmingPolicy` and others. They are served only by `section=config` (`R:telemetry/public-state.ts:254`, `configPayload` at `:87-97`).
- The dashboard does fetch the `config` domain (`D:query-cache.tsx:19, 174`). The PWA defaults these keys to empty (`P:models/state.ts:751-779`).
- Effects inside this slice:
  - Bank Stand, NPC and Deconstruction badges never appear (`P:screens/account/BankScreen.tsx:297-305`).
  - "Unmark for stand" is never offered (`:370`).
  - **Deconstruction buttons never render.** `canDeconstruct` returns false against the empty catalog (`P:models/state.ts:386-388`, `P:BankScreen.tsx:298, 407`).
  - The bankboi-prefix setting always loads as blank (`P:screens/account/SettingsScreen.tsx:43`).
  - The withdrawals routine toggle state can't be read either.
- Outside this slice, the same gap empties item marks, upgrades, leader/followers, farming policy and more.
- `withdrawals`, `bankSortMode` and `bankSortRequest` are *not* config fields (`R:telemetry/public-state-types.ts:42, 75`), so those parts do work.
- **Confirm on device before acting:** fetch `/party-api/state?section=core&dashboard=1` and check that `standListings` and `merchantCharacter` are absent. The PWA's own comments say it was checked against v1.1.0 (`P:BankScreen.tsx:15`), so this probably arrived with the v1.2.0 section split.
- Fix: add `state?section=config` to the poll (as the dashboard does) and merge it before `core`.

## Refuted claims

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 60 | decodeMailInbox MISSING (string-encoded `item`) | **REFUTED → N/A** | The v1.2.0 server already JSON-parses string attachments before serving `/mail` (`S:mail-inbox.cjs:27-31`) and rejects malformed ones. The dashboard decoder only covers older coordinators. |
| — | Report's "UNREACHABLE: 0" | **REFUTED in spirit** | Bank deconstruction actions (#16), "Unmark for stand" (#11) and stand/NPC/decon badges (#5e) are effectively unreachable at runtime, because their data keys are never fetched (headline). |

No MISSING row turned out to exist in the PWA. I re-grepped `bankboi`, `bankbois/create`, `mail/refresh`, `mail/delete`, `postage`, `tracktrix`, `achievement`, `upgradeTiers`, `daily-dungeons`, `catalogComparison`/`compar`, `stat_type` (BankScreen), `mluck`/`item.m`, `withdrawals` (routine labels) and `maxLength` across `P:`. Only the comment and prefix hits the report already cites came back. `removeAutoBankMark` appears only at `P:api/partyApi.ts:376-378` (merchant/order). `map-stream` exists (`P:config/serverConfig.ts:34-38`), but only for the character map, not the cave map.

## Downgraded / upgraded claims

| # | Report | New | Reasoning |
|---|---|---|---|
| 16 | PARTIAL ("wiring matches") | **BROKEN (unreachable at runtime)** | Buttons are gated on `canDeconstruct(entry.item, dynamicState.deconstructionCatalog)` (`P:BankScreen.tsx:298, 407`). That catalog is a config field the PWA never receives (headline). |
| 5e | PARTIAL | **BROKEN** | Stand, NPC and decon marks read `standListings`, `npcSaleMarks` and `deconstructionMarks`, which are all config fields. Only the withdrawal badge can ever show. |
| 11 | PARTIAL | **BROKEN** | Three faults: (1) "Unmark for stand" can never show (`standListings` is empty). (2) The default price is `entry.item.price` (`P:BankScreen.tsx:389`), which is blank for bank items. `Number('') \|\| 0` then sends `price: 0` (`:337`), and the server rejects it with 400 "invalid stand price or quantity" (`R:http/stand-marks.ts:17-25, 66-68`). So the default flow fails unless the user types a price. (3) The single mark sends `quantity: 1`, but the dashboard default is the stack (`D:party-inventory-panels.tsx:150`). |
| 41 | PARTIAL | **BROKEN** | `bankboiPrefix` is a config field (`R:telemetry/public-state.ts:67`), so the PWA always shows `''` even when a prefix is saved. |
| 28 (B3) | BROKEN | **DOWNGRADE → PARTIAL** | Confirmed as described. The server rejects cleanly with 409 `unlock the bank floor first` (`R:http/bank-unlock.ts:43-51`), and the PWA shows that message inline (`P:BankScreen.tsx:213, 228`). Misleading control, no wrong outcome. Also missed: the dashboard disables unlock buttons when no merchant is configured (`D:bank-sheet.tsx:767, 807`); the PWA doesn't, and the server returns 409 "no merchant is configured" (`R:http/bank-unlock.ts:82-83`). |
| 49 (B4) | BROKEN (label + Collect enabled) | **Partly downgraded** | The "pending" → "(collected)" label is confirmed (`P:screens/account/MailScreen.tsx:73, 95-97`). The "Collect stays enabled while queued/collecting" part is harmless: the server dedupes (`S:mail-inbox.cjs:55-57`) and throws on pending (`:54`). While `taken === 'pending'` the PWA hides Collect, which is the correct effect. Overall severity: low. Still missed: the outcome status text and `collectionError` (`S:mail-inbox.cjs:10-12`). |
| 77 (B5) | BROKEN | **UPGRADE severity** | Live game data makes this worse than the report says. See the confirmed section below. |
| 45 | MISSING (Refresh) | **Lower severity** | The server re-pulls the inbox every 30s by itself (`R:commerce/mail-startup.ts:56-78`), so the PWA's 6s GET poll still converges. The button is a convenience. |

## Confirmed critical claims (one line each)

- **(a) B1 / #8 / #9. CONFIRMED.**
  - Merchant resolution: `P:BankScreen.tsx:30` picks the first live `ctype==='merchant'`; the dashboard uses `state.merchantCharacter` (`D:party-inventory-panels.tsx:108-111`, gating at `D:bank-sheet.tsx:590, 602`).
  - Offline merchant disables withdraw: the server sends `{[name]: null}` for inactive characters (`R:telemetry/dashboard-stream.ts:196-203`), and the PWA deletes them (`P:data/PartyDataProvider.tsx:299-300`), so `merchant` becomes null and the buttons disable (`P:BankScreen.tsx:356, 364`).
  - Extra failure mode: `ctype` comes *only* from the roster fetch (`P:data/PartyDataProvider.tsx:52-61`). If that fetch fails after its retries, `ctype` is `''` and withdraw is disabled even with the merchant online.
  - The wrong-character case (a live bankboi or second merchant chosen) is plausible but unverified; I didn't confirm that bankbois appear in the live stream or roster with `ctype` merchant.
  - The file header comment at `P:BankScreen.tsx:16-17` ("always to the configured merchant") is false.
  - Dependency: `merchantCharacter` is a config field (`R:telemetry/public-state.ts:81`), so the fix needs the config fetch first.
- **(b) B6 / #10. CONFIRMED.**
  - Server: `guardBankWithdrawal` returns 409 `{code:"auto_bank_confirmation_required", error:"This item is automatically marked for bank. Allow withdrawal and remove mark?"}` (`R:inventory/withdrawal-bank-guard.ts:18-24`). It is called for every non-removal withdraw (`R:inventory/transfer-commands.ts:160-164`).
  - PWA: `PartyApi.post` keeps only `parsed.error` and drops `code` (`P:api/partyApi.ts:176-180`). `withdrawFromBank` has no `removeAutoBankMark` param (`:238-242`). The question shows as red error text (`P:BankScreen.tsx:309, 465`) with no confirm button. Dead end.
  - Dashboard handles it at `D:bank-withdrawal.tsx:22-51`.
- **(c) B2 / #12. CONFIRMED.**
  - PWA "Mark all for stand" sends `quantity: entry.item.q`, never `markAll` (`P:BankScreen.tsx:337-340`; `markForStand` has no `markAll` option, `P:api/partyApi.ts:248-256`).
  - Server `markAll:true` lists every identical copy in merchant inventory and bank and reprices existing listings of that identity (`R:http/stand-marks.ts:69`, `R:merchant/stand-marks.ts:86-112`). Dashboard checkbox at `D:party-management-panels.tsx:393-409`.
  - Outcome: the user expects all copies listed but gets one slot listed at stack quantity.
- **(d) B3 / #28. CONFIRMED but low severity** (see Downgraded).
  - Dashboard shows gold buttons only when `accessible` (`D:bank-sheet.tsx:795`) and excludes `gold===0` vaults (`:723-727`).
  - The PWA offers `Unlock · Ng` for every locked non-key vault (`P:BankScreen.tsx:157, 197-198`).
  - Side case: a vault with `gold===0` and no `key` shows "Unlock · 0g", and the server rejects it with "this vault opens with floor access" (`R:http/bank-unlock.ts:55`).
- **(e) B4 / #49. CONFIRMED** (label part).
  - `P:MailScreen.tsx:73`: `typeof mail.taken === 'boolean' ? mail.taken : mail.taken === 'pending'` maps `"pending"` to `true`, which renders "(collected)".
  - The server emits `'pending'` for a truthy non-`true` `taken` (`S:mail-inbox.cjs:36`). The dashboard shows "Game is processing collection" (`D:send-mail-dialog.tsx:302-306`).
- **(f) B5 / #77. CONFIRMED and worse.**
  - PWA: `` `${(drop.rate * 100).toFixed(4)}%` `` (`P:screens/account/BestiaryScreen.tsx:68`, `P:screens/itemdetail/ItemDetailBrowser.tsx:489`). Dashboard: `formatDropRate` (`D:bestiary-drops.tsx:35`, `D:drop-rate.ts:16-25`). The bestiary sends the raw `G.drops.monsters` rate and quantity (`characters/shared.js:1773-1777`).
  - Live game data (`drops.monsters`) gives real wrong outputs:
    - crabxx `[10000,"cshell"]`: PWA "1000000.0000%", dashboard "100% ×10,000".
    - franky `[30,"cryptkey"]`: PWA "3000.0000%".
    - icegolem `[10,"essenceoffrost"]`: PWA "1000.0000%".
    - **Tiny rates collapse to "0.0000%"**: goo `[1.25e-7,"shells",50]` (dashboard "0.0000125% ×50"), bat `1e-8` cxjar, minimush `1.67e-8`, phoenix `1.56e-8`, bbpompom `5e-8`.
  - The PWA also moves quantity onto the name as " x50" (`BestiaryScreen.tsx:65`, `ItemDetailBrowser.tsx:488`).
  - A verbatim port already exists at `P:lib/itemFormulas.ts:434-443` and is used on the same screen for item→monster rows (`ItemDetailBrowser.tsx:358, 463`). The fix is two lines.
- **#18. CONFIRMED.** Unmodified items sell to NPC on one tap with no dialog (`P:BankScreen.tsx:430-434, 442-446`). The dashboard always opens the "Sell to NPC…" dialog (`D:bank-sheet.tsx:644-648`, `D:party-inventory-panels.tsx:153-164`).
- **#33–#40 (bankbois missing). CONFIRMED.**

## Missed gaps

| # | Feature | Dashboard evidence | Endpoint/state key | PWA status | PWA evidence | Notes |
|---|---|---|---|---|---|---|
| M1 | Config-section state (stand/NPC/decon marks, deconstructionCatalog, autoStandMarks, standBids, merchantCharacter, bankboiPrefix, merchantAutomations …) | `D:query-cache.tsx:19, 174` | GET `/state?section=config` (`R:telemetry/public-state.ts:254`) | MISSING | none — grepped `section=config`; fetch list at `P:data/PartyDataProvider.tsx:140-145` | **Critical, cross-slice.** See headline. |
| M2 | Full bankboi records with `items` | `D:query-cache.tsx:174` (bank fetched with `dashboard=1`) | `section=bank&dashboard=1` adds `bankbois` (`R:telemetry/public-state.ts:240-247`) | MISSING | `P:data/PartyDataProvider.tsx:141` fetches `section=bank` without `dashboard=1`; core only gives item-less `bankboiSummaries` (`R:telemetry/public-state.ts:152, 160-173`) | Prerequisite for #37–#39, the mail bankboi picker, and "sell all copies" counts |
| M3 | Withdrawal double-submit guard | `D:bank-withdrawal.tsx:15-17, 28-30` (`inFlight` ref, `pending` block at `:35`) | POST `/command` withdraw toggles (`R:inventory/transfer-commands.ts:47-50, 149-154`) | BROKEN | `P:BankScreen.tsx:357` has no busy or in-flight guard | Double-tapping "Mark for withdrawal" sends two requests. The second matches `removingWithdrawal` and **removes** the mark just added. |
| M4 | Stand price default and validation | `D:party-inventory-panels.tsx:142, 149` (`max(1, definition.g)`) | `/merchant/stand` `price ≥ 1` (`R:http/stand-marks.ts:17-25`) | BROKEN | `P:BankScreen.tsx:337, 389` | A blank price sends `0`, and the server returns 400 |
| M5 | Unlock buttons disabled without a configured merchant | `D:bank-sheet.tsx:767, 807` | `merchantCharacter` | MISSING | `P:BankScreen.tsx:192-231` has no gate | Server returns 409 "no merchant is configured" |
| M6 | Unlock dialog names the merchant ("NAME will spend… / retrieve and consume KEY to unlock FLOOR") | `D:bank-sheet.tsx` (~1050-1052 in the skim: `${merchant \|\| "The merchant"} will …`) | — | PARTIAL | `P:BankScreen.tsx:205` | Extends #30 |
| M7 | "Additional bank storage" section lists every floor, including accessible ones | `D:bank-sheet.tsx:701-869` | `bankVaults` | PARTIAL | PWA only renders when some vault is locked (`P:BankScreen.tsx:157-158`) | Complements #26 and #29 |
| M8 | Mail outcome status (`collection` = last job status, e.g. failed) and `collectionError` | `D:send-mail-dialog.tsx:245-247, 306-309` | `S:mail-inbox.cjs:10-12` | MISSING | `P:models/mail.ts:12-23` | The inbox row also shows "Attachment available"/"Attachment collected" |
| M9 | "Write message" / "Cancel" footer, "Remove attachment" | `D:send-mail-dialog.tsx:207-215, 377-386, 563-570` | — | PARTIAL | `P:MailScreen.tsx:29` toggles Compose/Cancel | Cosmetic |
| M10 | Bank search also matches the definition name | `D:bank-sheet.tsx:244-247` | — | MISSING | — | Extends #3 |
| M11 | Bestiary drops order (server order vs PWA rate-desc sort) | `D:bestiary-drops.tsx:56` | — | PARTIAL | `P:BestiaryScreen.tsx:49`, `P:ItemDetailBrowser.tsx:473` | Minor divergence |
| M12 | Bank-sort action error | `D:bank-sort-control.tsx:33` | `/merchant/bank-sort` | MISSING | `P:BankScreen.tsx:137-140` ignores the result (a toast still appears) | Minor |
| M13 | NPC-sale marks badge doesn't filter by `source` (dashboard) vs `source==='bank'` (PWA) | `D:bank-sheet.tsx:339-345` | `npcSaleMarks` | — | `P:BankScreen.tsx:299-301` | The PWA is stricter. Noted only. |

## Dependencies / ordering

1. **Config-section fetch (M1) before anything else.**
   - It unblocks: B1 (`merchantCharacter`), #5e, #11, #16, #41, the #24 toggle state (`merchantAutomations`), and anything that reads stand/NPC/decon/auto marks.
   - It also fixes out-of-slice screens: marks, upgrades, leader/followers, farming policy.
   - Merge order in `P:data/PartyDataProvider.tsx:186-195`: config should come before `core`, so live core fields win.
2. **Bank fetch with `dashboard=1` (M2) before any bankboi work** (#33–#40). It must merge after `core` so full records replace the summaries. The current spread order `...core, ...bank` already does that.
3. **B1 fix:** read `dynamicState.merchantCharacter` (after step 1) and stop deriving from `QK.characters`. Apply the same fix to `P:screens/account/OfferingsScreen.tsx:33` and `P:screens/itempanel/ItemActionPanel.tsx:71, 183`, which use the same ctype heuristic.
4. **B6 fix** needs `PartyApi.post` to return the parsed `code`. Today the failure keeps only the message (`P:api/partyApi.ts:176-180`). Add `removeAutoBankMark` (and `upgradeTiers` for #14) to `withdrawFromBank`.
5. **B2 / #11 / M4:** build a shared stand dialog (price default `max(1, definition.g)`, quantity default = stack, markAll checkbox, stand-full gate via `standIsFull(listings, bids)`). It needs `standBids` from config (step 1).
6. **B5:** swap in `formatDropRate` from `P:lib/itemFormulas.ts:434`. No dependencies; quick win.
7. **Mock server (confirmed):** `e2e/fixtures/mockPartyServer.ts:664` answers every non-logs `state` request with `{roster, ...dynamicState()}`, and that includes `standListings` and `deconstructionCatalog` (`:158, 183`). That is how M1 went unnoticed. Make the mock mirror `omitConfigFields`, or E2E will keep passing over this gap.

## Counts
- Refuted: 1 row (#60), plus 1 summary-level claim (UNREACHABLE: 0).
- Upgraded: 5 (#16, #5e, #11, #41 → BROKEN; #77 severity).
- Downgraded: 3 (#28 → PARTIAL; part of #49; #45 severity).
- Confirmed: all 6 priority items (a)–(f), plus #18 and #33–#40.
- Missed gaps: 13 (M1–M13). M1 critical; M2, M3, M4 high.
