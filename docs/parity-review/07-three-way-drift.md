# Three-way drift review: dashboard v1.3.0, PWA, APK (2026-10-04)

Source of truth: party-console **v1.3.0** (ecbf152, released 2026-10-02). The
PWA and APK were ported from v1.2.0, so this review also covers the
v1.2.0 → v1.3.0 delta.

## Method

Mechanical nets, then a read of every flagged item (scripts in the session
scratchpad: `drift.py`, `drift_ap.py`, `drift_api.py`).

| Check | Result |
|---|---|
| v1.2.0 → v1.3.0 diff (dashboard + HTTP routes) | 3 dashboard files changed (inventory); route set unchanged, only behavior (travel releases a held Cave visit, surfaced as 409 text) |
| Server route table × references in dashboard / PWA / APK | no route used by the dashboard is missing from either client; `merchant/stand-search` and `stand-order` exist in both clients but nothing calls them (the dashboard never renders that dialog) |
| Per-endpoint body keys, PWA `partyApi.ts` vs APK `PartyApiClient.kt` | identical, except `rare-hunting` (APK had no passive hunting) |
| Dashboard `PartyState` keys × client state models | every key the dashboard UI reads is modelled in both clients |
| Section polling cadences | PWA and APK identical; both differ from the dashboard on purpose (see Decisions) |
| UI text: dashboard → PWA, PWA → APK, APK → (PWA ∪ dashboard) | ~115 / ~170 / ~50 leads, each traced to its source below |

## Findings and status

| # | Sev | Area | Drift | Status |
|---|---|---|---|---|
| 1 | S1 | Inventory grid | v1.3.0 compact-inventory.tsx pins a tracker/supercomputer in the last usable slot and keeps overflow after it | **Fixed** both (`compactInventory(items, size)`) |
| 2 | S1 | Live inventory | v1.3.0 dashboard-live.tsx keeps occupied overflow cells beyond `inventorySize` | **Fixed** both (`displaySize`) |
| 3 | S2 | Inventory capacity | v1.3.0 clamps free slots at 0 | **Fixed** both |
| 4 | S1 | Hunt settings (APK) | no preferred hunt spawns, no passive hunting menu, no add-to-blacklist picker, raw blacklist reason instead of hunt-blacklist-label.ts, no monster details from the list | **Fixed** (ported HuntExtras.tsx → `HuntExtras.kt`, `domain/Hunting.kt`, `setRareHunting`) |
| 5 | S1 | Item details from Mail (APK) | opened without party context: no Compare / Add to WTB, old monster view with `%.4f` rates | **Fixed** |
| 6 | S2 | NPC sale confirmation | both clients paraphrased; dashboard shows the item name, the location line and one of two exact sentences | **Fixed** both |
| 7 | S2 | Merchant gold target | both clients invented a "Gold target" card, description and Save button (APK also "Gold to carry"); dashboard: current gold, field "Set target amount" saved on blur, bank button | **Fixed** both |
| 8 | S2 | Item-details caption | dashboard captions every view "{source} · slot {n}" (Equipment catalog, Dropped by X, Ponty's inventory, X's ALData listing, X's live WTB, Published trade intention, Your merchant stand, Your stand buy order, Your active WTB order, Merchant/Crafting/Exchange catalog, Mail attachment, cave shop) | **Fixed** both |
| 9 | S2 | Crafting description | "…held by the active party and in the latest bank snapshot." | **Fixed** both |
| 10 | S3 | Steam tooltip (PWA) | "Currently in Steam · click to go headless" | **Fixed** |
| 11 | S3 | Fallback error text | ~35 dashboard fallbacks are `error instanceof Error ? error.message : "…"`; the dashboard's request helper always throws an Error with the server's message, so users see the server text in all three. The one reachable case, "Generate an ALData key first" (Prepare mail with no stored key), opened an empty auth mail in both clients | **Fixed** (that case); the rest are unreachable |
| 12 | S3 | Labels and placeholders | "Clear all monster focus", "Search monsters…", "Search items…", WTB "Search every item…" | **Fixed** both; lucky-slot "Show item details" is the Item details option (ground rule); Android has no hover tooltips (platform) |
| 13 | S3 | Dead client code | `standSearch` / `buyFromStand` in both API clients | **Removed** (the `standSearch` state field stays: it is in the dashboard's state) |
| 14 | S2 | Donation | dashboard dialog title "Donate gold for merchant XP" | **Fixed** both (title on the inline form) |

Not drift (checked): Escape / "Escape — exit dungeon", sell-all-to-NPC (dead
in the dashboard too), stand-full guard, drop sort, Compare picker,
two-tap Clear all, WTB stand replacement, roster hosting, bank marks,
state import, realm Hop Sickness text, empty party text, farm-price info,
cadence tables PWA = APK. `DashboardHealth`, `DashboardModeControl`,
`PlayerStandMarketDialog` and the command palette are never rendered by the
dashboard. `set_bank_threshold` / `send_character_to_bank` are browser-agent
tools (document.modelContext), not UI.

## Decisions needed (deliberate differences)

- **Polling**: core every 2 s (dashboard 1 s, "mobile data" in
  PartyDataProvider); escape 1 s only while one runs (dashboard 1 s while
  the party view is open); logs/bank/mail poll slowly in the background
  and fast while a screen shows them.
- **Mobile adaptations**: options lists instead of right-click menus,
  inline sheets instead of dialogs, bank rows instead of tiles, "Tap"
  instead of "Click" in Phoenix help.
- **Client-only extras**: freshness / hang badges (including the live map),
  phone notifications, the PWA update banner, the APK's connection,
  pairing and crash screens.

## Verification

PWA: tsc, 44 unit, 209 e2e. APK: 111 Robolectric tests (new
DriftFixesTest), assembleDebug. Android UI still unverified on a device.
