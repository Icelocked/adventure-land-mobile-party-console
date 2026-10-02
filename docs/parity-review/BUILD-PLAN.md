# BUILD-PLAN: PWA ↔ party-console v1.2.0, 1:1 parity

## Progress (updated 2026-10-02)
- **Phase 0:** PR-0a `166727f`, PR-0b `df8d619`, PR-0c `b7238d4`, PR-0d `08dda78`, PR-0e `bf012c2` shipped. **PR-0f (P0-21) is waiting** on a live check that the debug banner shows `leader="<name>"`.
- **Phase 1:**
  - **Shipped:** F1 `f3a0d7e`, F2 + F3 `f080eb1`, F4 `9a232b4`, the item-options redesign `bcfcd1f`, F6 + F7 test setup `7cdcbbf`, F8 `873f4e9`.
  - **Built with their consumer packages:** the remaining F5 primitives and F7 ports.
- **Next:** Phase 2 (R1, R2, S1).

## Ground rules (set by the owner, binding on every package)
1. **No drifting or diverting.** Ryan's party-console is the base. Its behaviour, request bodies and semantics are the spec, even where they look like bugs. The PWA adapts to each of his releases and never proposes server-side changes as the fix.
2. **Keep the PWA's existing framework and layout.** The one sanctioned redesign: tapping an item opens the **options list**, and **"Item details" is one entry in that list**. Today the item details pane hosts all the other options. This applies to F5 `ItemActionPanel` and every package that opens an item.
3. **The PWA is a remote control that supplements the dashboard.** It does not replace it. Do not add PWA-only behaviour beyond the dashboard's, apart from mobile layout adaptations.

This plan combines six domain audits (`01`–`06`) and their six adversarial challenges. Where a challenge refuted, downgraded or upgraded an audit row, the challenge's verdict is used. I spot-checked code wherever two reports disagreed:

- **`merchantCharacter` and `merchantRules` are config fields, not core.** Report 03-challenge said they were in core. They are config: `console-v1.2.0/runtime/coordinator/telemetry/public-state.ts:65-82` lists both inside `configFields`, and `omitConfigFields` (`:101-105`) deletes them from `section=core&dashboard=1`. Every fix that needs the configured merchant therefore depends on P0-01.
- **The poll list is confirmed** in `web/src/data/PartyDataProvider.tsx:134-146`. The startup full `GET /state` (`:222`) keeps only `roster` (`:225-229`).
- **The e2e mock ignores `section`.** `web/e2e/fixtures/mockPartyServer.ts:660-664` answers every non-logs `state` request with the full state. It also rewrites `character === merchant` to `undefined` for auto-NPC rules (`:354-372`) and accepts price 0 for stand marks (`:491-505`).
- **Core `dashboard=1` carries a few extra fields.** It includes `characters: {name: {name, ctype, level, server}}`, `characterDetails`, `bankGold`, `serverNow` and `accountId` (`public-state.ts:258-276`). Bank adds full `bankbois` only with `dashboard=1` (`:245`).
- **The PWA has no unit-test runner.** `package.json` has `test:e2e` (Playwright) only. Tests below are Playwright specs against the mock, plus a proposed Vitest setup for pure-lib ports (F7).

Path conventions:
- **D** = `scratchpad/console-v1.2.0/dashboard/features/party/`
- **DL** = `console-v1.2.0/dashboard/lib/`
- **R** = `console-v1.2.0/runtime/coordinator/`
- **RT** = `console-v1.2.0/runtime/`
- **P** = `F:/CodingProjects/adventureland-party-mobile/web/src/`
- **E** = `web/e2e/`
- **A###** are row IDs in Appendix A.

---

## 1. Executive summary

### 1.1 Counts after challenge corrections

The six audits produced 553 classified rows. The challenges added 65 missed gaps, for 618 raw rows. Merging duplicates across reports leaves **510 unique features**. For example, the Follow toggle appears in 01-C12, 02-#18/#19 and 02-ch(d); the stand dialog appears in 01-F2, 03-#27, 05-J1–J5 and 06-#11/#12.

| Status | Rows | Share |
|---|---|---|
| BROKEN | **69** | 13.5 % |
| UNREACHABLE | **2** | 0.4 % |
| MISSING | **209** | 41.0 % |
| PARTIAL | **141** | 27.6 % |
| PRESENT | **76** | 14.9 % |
| EXTRA (PWA-only) | 5 | 1.0 % |
| N/A (dashboard dead code / desktop-only / internal) | 8 | 1.6 % |
| **Total** | **510** | |

So **421 rows (82.5 %) need work**: 69 BROKEN, 2 UNREACHABLE, 209 MISSING and 141 PARTIAL. Only 76 rows (15 %) are true 1:1 parity today. Per-domain counts are in §1.4.

The challenges changed the picture materially. The raw audits had 51 BROKEN rows; after challenge the count is 69. Most of the upgrades follow from one cross-cutting defect, RC1 below. Examples:
- PRESENT → BROKEN: the Leader chip, the farming-mode selector, the active farming zone, the anniversary auto-chat toggle.
- PARTIAL → BROKEN: Force stand, Restock, the stand price edit, the bankboi prefix, bank stand/NPC/decon badges, bank deconstruction.

Challenges refuted or downgraded only a handful of rows:
- `/merchant/aldata-order` is OK.
- Escape in a dungeon is cosmetic only.
- `decodeMailInbox` is N/A.
- Bank gold-unlock on locked floors is PARTIAL.
- Queue Retry gating is PARTIAL.
- Explore-results overlay is PARTIAL.

No MISSING row was refuted. Every challenger re-grepped endpoint paths, state keys and labels.

### 1.2 Root causes (cross-cutting defects that explain most rows)

| # | Root cause | Evidence | Rows it explains |
|---|---|---|---|
| **RC1** | **The PWA never fetches `GET /state?section=config`.** v1.2.0 moved ~55 settings and marks fields out of `core&dashboard=1` (`R/telemetry/public-state.ts:65-86, 101-105, 258-276`). PWA commit `1638165` (2026-10-01) switched the core poll to `dashboard=1` to get `characterDetails`, and with it silently lost every config field (05-ch §0). `leader`, `followers`, `farmingProfiles`, `huntSettings`, `monsterFocus*`, `standListings`, `standBids`, `merchantRoutinePriorities`, `merchantAutomations`, `threshold`, `restockPolicies`, `goldTargets`, `merchantForceStand`, `merchantCharacter`, every mark/rule map, `bankboiPrefix`, `anniversaryAutoChat` and `roster` stay at `emptyPartyStateDynamic()` defaults (`P/models/state.ts:740-790`). The shipped "TEMPORARY coreFetchDebug" banner (`P/screens/character-detail/CharacterDetailScreen.tsx:67-79`) is printing this symptom. | 01-B8, 02-ch §0, 04-B1, 05-BR-1, 06-ch headline | 13 rows fixed outright by P0-01. It is also the trigger for every destructive save in RC3 and blocks ~60 more rows (badges, lists, gating). |
| **RC2** | **The e2e mock diverges from the real server.** It serves config inside core for every section, normalises merchant auto-NPC rules, accepts price 0, has no `dashboard=1` bank shape, never redirects, and doesn't scope hunt routes. The golden-path and daily-use journeys pass only because of this (`E/golden-path.spec.ts:35-40`, `E/journey-daily-use.spec.ts:57-58`). | 01-O9, 02-ch M13, 03-ch B1/M15, 05-ch X10, 06-ch 7 | Every BROKEN row survived CI because of this. |
| **RC3** | **Forms are seeded from state that may not have arrived, and Save posts the full form.** There is no "loaded" guard, so Save writes defaults over real server data: Routines (all 50 and all enabled), Hunt settings (hard-coded defaults), Focus (empty → `['all']`, radius → 400), Restock (0/0/0/0), thresholds (0), bankboi prefix (`''`), Force stand and auto-chat (always send `true`). | 01-ch, 02-ch (b)(c), 04-ch (b), 05-ch §2, 06-ch | 12 destructive P0 items |
| **RC4** | **"The merchant" is inferred from `ctype === 'merchant'`** (13 call sites). The configured `merchantCharacter` and the shared-rule owner (`merchantRules ? merchantCharacter : name`) are not modelled. Consequences: withdrawals go to the first live merchant-class character (bankbois are merchants), withdraw is disabled when the merchant is offline, auto-NPC rules are written under the wrong key, and rule lists read the wrong owner. | 03-oos, 03-ch M13, 04-ch M6, 06-B1 | F1 (5 rows) plus gating in I2/U2/B1 |
| **RC5** | **Request bodies drift from the dashboard's.** Examples: `leader` added to follow toggles, `character` omitted on hunt routes, `priorityOverride` dropped when null, `id`/`bankPack` omitted on stand remove/edit, quantity defaulted to 1, `[]` replaced with `['all']`, `character-travel` sent instead of `go-home`, legacy routine key `exchange`, missing `markAll`, `monsterPriorities`, `label` and `eventSelections`. | all reports | ~25 BROKEN/PARTIAL rows |
| **RC6** | **`post()` discards the response body** except `ok`/`error`, and failures lose the HTTP status (`P/api/partyApi.ts:106-113, 178-183`). No 409 follow-up flow can be built: WTB `occupants`, order `missing[]`, `auto_bank_confirmation_required`, stale-order counts. | 05-oos4, 05-ch (f), 06-ch (b) | F3 + M7/M10/B1/M1 rows |
| **RC7** | **`characterDetails` is reduced to `monsterHunt`** (`P/data/PartyDataProvider.tsx:161-175`). Stats, doll, tracktrix, ping, presence, achievements and anniversary ticket state are all on the wire and then thrown away. | 02-top4, 03-ch (e) | ~15 rows (C1, I7, X1, C4) |
| **RC8** | **Navigation shell.** Every account tool is reachable only from the hamburger on a character detail screen. The home gear opens the server-address override. With zero characters online, Settings/Logs/Bank/Mail are unreachable in the installed PWA, which has no URL bar. | 01-A7, 01-ch #2 | F4 |
| **RC9** | **Hand-ports drifted instead of verbatim ports.** `routineLabels.ts` predates v1.2.0 routine keys. `markBadge.ts` diverged from `item-action-banner.ts`. `formatDropRate` was ported but isn't used on the Bestiary. `resolveFarmingContext` lacks `settings`. Comments assert "verified against v1.1.0". | 04-B3, 03-#10, 06-B5 | many PARTIAL rows |
| **RC10** | **Action results are discarded.** `void api.x()` / `await` without a check is used for town, return-leader, go-home, travel, AutoMarks remove, market buy and bank sort. Failures (409 leader offline, etc.) are invisible beyond a transient toast. | 02-ch, 03-ch M4, 04-oos7, 05-ch X9 | C7, I8, M6 rows |

### 1.3 Why parity has been hard

1. **The server contract changed underneath the PWA without a type-level signal.** The v1.2.0 core/config split is a pure payload-shape change behind the same URL. The PWA merges `Partial<PartyStateDynamic>` spreads, so missing keys silently become defaults instead of errors.
2. **Green tests on a mock that is not the server (RC2).** The mock was written from the PWA's understanding. Wherever the PWA was wrong, the mock agreed with it. It also has no `section` semantics, so the single most damaging regression was invisible.
3. **No live verification loop.** The PWA author worked from source reading and an older comparison doc (`PARTY-CONSOLE-COMPARISON.md`, pre-v1.2.0). The only live signal was a debug banner that nobody had decoded.
4. **Surface size and shape mismatch.** The dashboard is a desktop app with context menus, hover tooltips, nested submenus and ~150 `/party-api` routes. Mobile needs sheets and tap equivalents for each, which invites "close enough" ports. The stand dialog alone has 13 price presets, and the market sheet is ~3,700 lines (`D/stand-sheet.tsx`).
5. **Logic duplicated by hand rather than lifted.** Many dashboard modules are pure (`routine-labels`, `item-action-banner`, `stand-inspection`, `game-log-filters`, `farming-context`, `drop-rate`). Re-implementing them introduced semantic drift (RC9).
6. **Semantics hidden in the server.** Several behaviours are only visible in handlers, not in the dashboard UI:
   - toggling endpoints (`auto-exchange`, withdraw);
   - scope fallbacks (`createScopedFarmingRoute` → leader);
   - `undefined` vs `null` (`priorityOverride`);
   - identity matching (`stand-marks.ts` find without id);
   - side effects (job cancel disables automations).

   A port that copies only the UI misses them.

### 1.4 Counts by domain (final status)

(Generated from Appendix A.)

| Domain | BROKEN | UNREACHABLE | MISSING | PARTIAL | PRESENT | EXTRA | N/A | Rows |
|---|---|---|---|---|---|---|---|---|
| Shell & navigation | 2 | 1 | 6 | 5 | 3 | 0 | 2 | 19 |
| Live data layer | 5 | 0 | 2 | 3 | 3 | 0 | 3 | 16 |
| Roster & sessions | 0 | 0 | 11 | 2 | 0 | 0 | 0 | 13 |
| Realm | 0 | 0 | 3 | 3 | 1 | 0 | 0 | 7 |
| Settings & console | 1 | 0 | 8 | 2 | 4 | 1 | 0 | 16 |
| Logs | 0 | 0 | 5 | 3 | 0 | 0 | 1 | 9 |
| Character card | 0 | 1 | 6 | 3 | 6 | 0 | 0 | 16 |
| Formation | 2 | 0 | 0 | 0 | 1 | 0 | 0 | 3 |
| Events & anniversary | 1 | 0 | 9 | 1 | 0 | 0 | 0 | 11 |
| Daily dungeons | 0 | 0 | 16 | 1 | 0 | 0 | 0 | 17 |
| Farming & hunt | 8 | 0 | 6 | 2 | 1 | 0 | 1 | 18 |
| Focus & routing | 5 | 0 | 3 | 4 | 0 | 0 | 0 | 12 |
| Map | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Travel & party actions | 2 | 0 | 1 | 3 | 0 | 1 | 0 | 7 |
| Skills | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| Combat log | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 2 |
| Inventory grid | 3 | 0 | 10 | 5 | 4 | 0 | 0 | 22 |
| Item menu | 3 | 0 | 4 | 15 | 5 | 0 | 0 | 27 |
| Deconstruction | 1 | 0 | 2 | 2 | 0 | 0 | 0 | 5 |
| NPC sale | 3 | 0 | 1 | 3 | 0 | 0 | 0 | 7 |
| Equipment | 2 | 0 | 2 | 7 | 2 | 1 | 0 | 14 |
| Auto-rule lists | 4 | 0 | 5 | 3 | 4 | 0 | 0 | 16 |
| Item details | 0 | 0 | 2 | 7 | 8 | 0 | 0 | 17 |
| Gear comparison | 0 | 0 | 2 | 1 | 3 | 0 | 0 | 6 |
| Catalog | 0 | 0 | 7 | 4 | 1 | 0 | 0 | 12 |
| Upgrades & offerings | 0 | 0 | 5 | 1 | 3 | 0 | 0 | 9 |
| Lucky slot | 0 | 0 | 1 | 2 | 2 | 0 | 0 | 5 |
| Exchange | 2 | 0 | 5 | 4 | 6 | 0 | 0 | 17 |
| Commerce | 0 | 0 | 3 | 1 | 5 | 0 | 0 | 9 |
| Merchant card & queue | 3 | 0 | 4 | 12 | 5 | 1 | 0 | 25 |
| Routines | 3 | 0 | 1 | 4 | 1 | 0 | 0 | 9 |
| Merchant settings | 2 | 0 | 4 | 3 | 2 | 0 | 0 | 11 |
| Restock | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Stand | 2 | 0 | 5 | 1 | 0 | 0 | 0 | 8 |
| Stand dialog | 1 | 0 | 4 | 2 | 0 | 0 | 0 | 7 |
| Market | 1 | 0 | 7 | 5 | 0 | 1 | 0 | 14 |
| WTB | 1 | 0 | 2 | 8 | 2 | 0 | 0 | 13 |
| Marketplace settings | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 5 |
| Shared rules | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 3 |
| Bank | 5 | 0 | 14 | 1 | 2 | 0 | 0 | 22 |
| Bank floors & vaults | 0 | 0 | 3 | 5 | 2 | 0 | 0 | 10 |
| Bankbois | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 8 |
| Mail | 1 | 0 | 9 | 7 | 0 | 0 | 1 | 18 |
| Bestiary | 1 | 0 | 14 | 4 | 0 | 0 | 0 | 19 |
| Infrastructure | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| **Total** | **69** | **2** | **209** | **141** | **76** | **5** | **8** | **510** |

---

## 2. Phase 0: Stop destructive behaviour (ship first, small PRs)

**Scope rule.** Phase 0 covers every row that writes wrong data to the live coordinator, loses user state, silently kills polling, or performs an irreversible action the user did not intend. Each item lists:
- what is wrong;
- the exact PWA file:line;
- the dashboard or server reference that defines correct behaviour;
- the exact fix;
- the test to add.

Tests are Playwright specs using the fidelity-fixed mock from P0-03 and asserting captured request bodies via `page.on('request')`.

**PR grouping and order:**

| PR | Items | Why grouped | Ship order |
|---|---|---|---|
| PR-0a | P0-04 | One-line body split. It is destructive on *every* Follow tap and independent of everything else. | 1st (today) |
| PR-0b | P0-02, P0-03, P0-01, P0-05 | Data plumbing. Config fetch must land with error hardening (it adds a new unguarded `JSON.parse` site otherwise) and with the mock fix (otherwise tests can't see it). The "config loaded" gate depends on the fetch. | 2nd |
| PR-0c | P0-06, P0-07, P0-08, P0-09, P0-10, P0-11, P0-12 | Config-seeded forms: seed after load, save only real values | 3rd |
| PR-0d | P0-13, P0-14, P0-15, P0-16, P0-17, P0-25 | Item / stand / NPC write paths | 4th |
| PR-0e | P0-18, P0-19, P0-20, P0-22, P0-23, P0-24 | Merchant / market / bank / travel / realm write paths | 5th |
| PR-0f | P0-21 | Delete debug leftovers. Only after PR-0b is verified live, because the banner should read `leader="Name"` once config arrives. | 6th |

**Interim mitigation** (if PR-0b cannot ship within a day): hide the Save buttons on Routines, Hunt settings, Restock and Focus, plus the Force-stand and auto-chat toggles. All of them are destructive until config arrives.

---

### P0-01 — Fetch `section=config` on its own slower timer, merge into state; fetch bank with `dashboard=1`; roster from config
- **Rows:** A026–A029, A128, A131, A156, A185–A187, A235, A250, A255 (13 BROKEN). Also unblocks ~60 rows across all domains.
- **Broken today:**
  - `P/data/PartyDataProvider.tsx:134-146` polls only `core&dashboard=1`, `bank`, `market`, `logs`, `mail` and `escape`.
  - `:141` fetches `section=bank` without `dashboard=1`, so bankbois come back without items (`R/telemetry/public-state.ts:245`).
  - `:216-256` fetches the full `state` once, solely to read `roster`, and discards everything else.
- **Correct behaviour:**
  - The dashboard polls `config` as its own domain every 15 s (`D/query-cache.tsx:122-136, 172-174`).
  - It invalidates `['core','config']` together after actions (`D/query-actions.ts:10-18`).
- **Fix:**
  1. Add a `refreshConfigNow()` in `PartyDataProvider` that GETs `state?catalog=0&dashboard=1&section=config`:
     - it runs on its own loop (`CONFIG_POLL_MS = 15_000`), **outside** the 6 s `Promise.all`;
     - the payload includes `farmingProfiles` and can be 1–2 MB (`P/api/partyApi.ts:26-41`), so a slow config response must never delay or clobber core;
     - give it its own `configGeneration` ref (mirroring `dynamicStateGeneration`, `:100`).
  2. On success:
     - merge into `QK.dynamicState` (`{...current, ...config}`; config keys never overlap core keys after `omitConfigFields`);
     - set a new `QK.configLoadedAt = Date.now()`;
     - write `roster` into `QK.roster` and `rosterRef`, then patch `QK.characters` ctype/level exactly as `:235-243` does today.
  3. Delete the one-shot roster fetch (`:216-256`). If a first-paint fallback is wanted, read `characters` (name/ctype/level/server) from the core payload instead.
  4. Make `refreshDynamicStateNow()` also kick `refreshConfigNow()` (coalesce: if a config request is in flight, mark "again" instead of starting a second one). That makes post-mutation refreshes behave like the dashboard's `['core','config']` invalidation.
  5. Change `:141` to `api.get('state?section=bank&dashboard=1')`. The existing `...core, ...bank` spread order (`:190-192`) lets the full `bankbois` replace core's item-less summaries.
  6. Add `merchantCharacter`, `merchantRules`, `bankbois` (with `items`), `bankboiQueue`, `huntSettings`, `buyUpgradeBatchSize` and `upgradeOfferingStock` to `PartyStateDynamic` with safe defaults. These are the minimum types later P0 items need; the full typing is F6.
- **Rows that must flip with no other code change** (verify each): A128 farming mode selector; A131 active zone; A156 leader convoy; A185–A187 and A235 banners; A250 and A255 clear-all buttons.
- **Test (`E/config-section.spec.ts`):**
  1. With the P0-03 mock, set `merchantForceStand:true`, `leader:'A'`, non-default `merchantRoutinePriorities`, and two `standListings`. Assert that the Force stand chip shows On, A's Leader chip is selected, Routines shows the server priorities, and Stand shows 2/16.
  2. Delay the config response by 20 s in the mock. Assert that core-driven UI (merchant queue) still updates every 6 s.
  3. Assert that `section=config` is requested ≤ 1×/15 s plus once per mutation.
  4. Assert that bank requests carry `dashboard=1`.

### P0-02 — Poll-loop, JSON and redirect hardening; session-lost UX; live envelope validation
- **Rows:** A013, A021, A032.
- **Broken today:**
  - **`getText` follows redirects.** `P/api/partyApi.ts:64-71` follows the gateway's `302 → /setup` (`console-v1.2.0/tools/hosting/authorize.ts:74-76, 101-103`) and returns the HTML as `ok`.
  - **Every `JSON.parse` in the poll is unguarded:** `P/data/PartyDataProvider.tsx:111, 161, 176-181, 201, 205, 209`.
  - **The poll loops die permanently** on the first throw (`:262-266`, catalog `:278-282`).
  - **The live envelope check is weaker than the dashboard's.** `P/api/liveProtocol.ts:53` checks only `sequence < 0`; the dashboard checks `Number.isSafeInteger(sequence)` and `typeof epoch === 'string'` (`D/live-protocol.ts:24-29`).
- **Fix:**
  1. In `getText`, treat `response.redirected` as failure. Also treat it as failure when a `party-api` JSON GET returns a non-JSON `content-type`. Return `fail('Session expired', 401)`.
  2. Add `PartyApiClient.getJson<T>(path)` that wraps the parse in try/catch and returns `failure` on `SyntaxError`. Use it at every site listed above.
  3. Wrap the body of each `while (!cancelled)` loop (dynamic state, catalog, the new config loop) in try/catch, so a failure logs and continues.
  4. When a 401, a 403 or a redirect is seen on any party-api request, set `QK.sessionLost = true`. `App.tsx` then renders a "Session expired — Reconnect" screen that reuses `PairingGate`. This ports the dashboard semantics in `D/query-cache.tsx:50-101`.
  5. Copy the envelope check verbatim into `P/api/liveProtocol.ts:53`.
- **Test (`E/error-paths.spec.ts`, extend):**
  1. Mock answers `state?section=core` once with `302 Location:/setup` plus HTML, then recovers. Assert that the "Session expired" screen appears.
  2. Mock answers garbage JSON once. Assert that the next poll still updates the UI (merchant queue count changes).
  3. SSE frame `{type:'delta', sequence:'x'}` is ignored.

### P0-03 — e2e mock must mirror the real server
- **Sequencing (as built):** items 1, 2, 6 and 11 shipped in PR-0b. Each remaining handler rule (3, 4, 5, 7, 8, 9, 10) lands in the same PR as the PWA fix for that endpoint (P0-16, P0-14, P0-07, P0-06, P0-17/P0-20, P0-20, P0-19), so every rule ships with the test that exercises it.
- **Rows:** A509. This is the precondition for every other P0 test.
- **Broken today:**
  - `E/fixtures/mockPartyServer.ts:660-664` ignores `section`.
  - `:354-372` maps the merchant to `undefined` and keys auto-NPC rules `name@+level`.
  - `:491-505` accepts price 0 and pushes duplicate listings.
  - Hunt routes are unscoped.
  - Formation always applies `leader`.
  - Routine-priorities accept any key.
- **Fix** (mirror `R/telemetry/public-state.ts:236-277` and the `R/http/*` handlers):
  1. **`CONFIG_FIELDS` constant.** Copy `configFields` and `configExtraKeys` verbatim from `public-state.ts:65-86` into a mock constant. Include a header comment with the console version and line numbers, so a version bump forces a re-sync.
  2. **`section` semantics.**
     - `core&dashboard=1` returns state minus `CONFIG_FIELDS`, plus `characterDetails`, `bankGold`, `serverNow`, `accountId` and the summary `characters`.
     - `config` returns only `CONFIG_FIELDS` plus `roster`, `classChoices`, `eventStrategy`, `giveawayRealms` and `autoUpgradeMarks`.
     - `bank` returns `bank`, `bankVaults`, `bankCurrent` and `bankQueue`, plus `bankbois` only with `dashboard=1`.
     - `market` returns `aldata`, `ponty` and `standPriceHistory`.
     - With no section, it returns the full state.
  3. **`/merchant/auto-npc-sale`.** Keep `character` as sent unless `merchantRules`. Key per-player rules as `JSON.stringify([character, key])` (`R/merchant/player-npc-sales.ts:11-14`).
  4. **`/merchant/stand`.**
     - Reject price < 1 or quantity < 1 with 400 "invalid stand price or quantity" (`R/http/stand-marks.ts:17-26`).
     - Without an id, find only non-live, non-trade, non-bank entries by slot plus item (`R/merchant/stand-marks.ts:113-127`).
     - Re-marking updates the entry in place, overwriting `quantity` (`:153-154`).
     - Honour `markAll`.
  5. **`/hunt-settings`, `/hunt-blacklist`.** Without `character`, write to the leader's profile (`R/http/farming-scope.ts:17-18`).
  6. **`/formation`.** Apply `leader` only when the key is present (`R/http/formation.ts:57-61`).
  7. **`/merchant/routine-priorities`.** Drop unknown keys (`R/http/routine-priorities.ts:28-41`). `fishing`/`mining` toggle `gatheringModes`.
  8. **Toggle endpoints.** `auto-exchange` and `withdraw` toggle (delete when present).
  9. **Withdraw guard.** Withdraw returns 409 `{code:'auto_bank_confirmation_required'}` when the item is auto-bank-marked and `removeAutoBankMark` is absent.
  10. **Ponty listings** have no `source` field.
  11. **Redirect.** Add an option to answer with a `302 → /setup` redirect.
- **Test:**
  - `E/mock-contract.spec.ts` asserts the section split: no config key in core; every config key in config.
  - Re-run the full suite. `golden-path.spec.ts:35-40` and `journey-daily-use.spec.ts:57-58` are **expected to fail** until P0-16 lands. That failure proves the mock now catches RC2.

### P0-04 — Split formation: Leader sends `{leader}`, Follow sends `{character, follow}`
- **Rows:** A097, A098.
- **Broken today:**
  - `P/api/partyApi.ts:221-223` always posts `{character, follow, leader}`.
  - `P/screens/character-detail/sections/LeaderFollowerSection.tsx:32` sends `leader: dynamicState.leader ?? null` (always `null` under RC1). The server's `if (body.leader !== undefined) state.leader = …` (`R/http/formation.ts:57-61`) therefore **clears the party leader on every Follow tap**.
  - `:23` (the Leader chip) sends `follow: isFollowing` (always false), which un-follows the tapped character.
- **Correct behaviour:**
  - Leader: `formation({ leader: value })` (`D/party-workspace.tsx:44-47`).
  - Follow: `formation({ character, follow })` (`D/connected-character-card.tsx:127-130`).
- **Fix:** replace `setFormation` with:
  - `setLeader(leader: string)`, which posts `{leader}`;
  - `setFollow(character, follow)`, which posts `{character, follow}`.

  Call sites:
  - `LeaderFollowerSection.tsx:23` → `setLeader(characterName)`. Drop the "tap current leader to clear" behaviour, which the dashboard doesn't offer.
  - `:32` → `setFollow(characterName, !isFollowing)`.
  - After PR-0b, disable both chips until `configLoadedAt`.
- **Test:** `E/formation.spec.ts`:
  - tap Follow → captured body has exactly the keys `character, follow` (no `leader`);
  - tap Leader → body is exactly `{leader}`;
  - mock state: the leader is unchanged after a Follow tap.

### P0-05 — "Config loaded" gate for every config-seeded control
- **Rows:** cross-cutting enabler for P0-06 to P0-12, P0-17 and P0-18. No own rows.
- **Fix:** add a `useConfigLoaded()` hook (reads `QK.configLoadedAt`). Every control seeded from a config field shows "Loading settings…" and disables Save/toggle until it is true. It seeds **once** on first load and never overwrites a dirty draft. Port the seed-on-open semantics from `D/routine-priorities-dialog.tsx:46-56`.

  Consumers:
  - `RoutinesScreen`, `HuntSettingsScreen`, `FarmingSection` (MonsterFocusForm and farming-mode chips), `RestockSection`, `GoldTargetSection`
  - `MerchantControlsSection` (Force stand, thresholds), `SettingsScreen` (bankboi prefix, anniversary auto-chat), `LeaderFollowerSection`
  - `ItemActionPanel` (auto-exchange, auto-stand price prefill), `StandScreen`, `WtbScreen`
- **Test:** mock with `section=config` returning 503 forever. Visit each screen above and assert that its Save/toggle is disabled and that **zero** POSTs are made.

### P0-06 — Routines save: dashboard routine keys verbatim, gathering seeds, deliveries/withdrawals/upgrade preview, manual/automatic exchange
- **Rows:** A360–A365.
- **Broken today:**
  - `P/lib/routineLabels.ts:5-33, 37-49`:
    - has the legacy `exchange` key, which the server ignores (`R/http/routine-priorities.ts:28-29, 37-41`);
    - lacks `deliveries`, `withdrawals`, `upgrade preview`, `manual exchange` and `automatic exchange`.
  - `P/screens/account/RoutinesScreen.tsx:21-22` seeds from `merchantRoutinePriorities` and `merchantAutomations`. Both are `{}` under RC1, and `merchantAutomations` never contains fishing or mining.
  - `:30-36`: the seed fires only when priorities are non-empty, and can overwrite edits later.
  - `:112` posts `draft[key] ?? 50` for every key. The server defaults are not 50 (`R/merchant/initial-settings.ts:30-74`).
  - `:113` posts `enabledDraft[key] !== false`. That is `true` for every automation, re-enabling everything the user disabled, plus `fishing:true, mining:true`. The server then calls `setGathering`, which turns both on (`R/http/merchant-configuration.ts:66-82`).
- **Fix:**
  1. Replace `P/lib/routineLabels.ts` with verbatim ports of `D/routine-labels.tsx` and `D/automatic-routine-keys.tsx`.
  2. Seed on open, gated by P0-05:
     - `draft = {...merchantRoutinePriorities}`;
     - `enabledDraft = {...merchantAutomations, fishing: gatheringModes.includes('fishing'), mining: gatheringModes.includes('mining')}` (`D/party-management-panels.tsx:617-621`).
  3. Save body:
     - `priorities` = the server map with the user's edits applied (never synthesised 50s);
     - `enabled` = `automaticRoutineKeys` plus fishing/mining from the draft;
     - delete `enabled.deliveries` and `enabled.withdrawals`;
     - drop the deliveries/withdrawals priority when its trip setting is off (`D/routine-priorities-dialog.tsx:61-62, 133-134, 152-159, 222-247`).
  4. Render the deliveries/withdrawals rows disabled, with "Enable in Merchant settings" (`:228-233`).
- **Test:**
  - Mock state: `merchant luck:100`, `stand maintenance:40`, `auto upgrade:false`, `gatheringModes:[]`.
  - Open Routines and press Save without edits. The captured body must equal the server state: identical priorities, `automatic exchange` present, no `exchange`, `auto upgrade:false`, `fishing:false`, `mining:false`, and no `deliveries`/`withdrawals` in `enabled`.
  - Then reorder one row: only that priority changes.

### P0-07 — Hunt settings and blacklist: send `character`, read the owner's profile, no save before load
- **As built:** follows `hunt-settings-control.tsx` exactly: each control saves its own field immediately (thresholds on blur when changed), so there is no Save button.
- **Rows:** A136–A139.
- **Broken today:**
  - **Requests are unscoped.** `P/api/partyApi.ts:617-627` sends no `character`, so the server falls back to `mainOwner() = party.leader` (`R/http/farming-scope.ts:17-18`, `R/application.ts:1878-1880, 2139-2140`).
  - **The screen reads the wrong fields.** `P/screens/account/HuntSettingsScreen.tsx:22, 45` reads the top-level `huntSettings`/`huntBlacklist` (never fetched).
  - **Save overwrites real settings.** The form seeds hard-coded defaults (`:23-27`), and Save (`:88-94`) writes them over the real settings.
  - **The route has no character.** `App.tsx:55` is `/hunt-settings`; the link is at `FarmingSection.tsx:247`.
- **Correct behaviour:**
  - `{...patch, character: name}` (`D/connected-character-card.tsx:156-161`) and `{action, monsterId?, character}` (`:194-208`).
  - The dialog is titled with the owner and disabled when inherited (`D/farming-mode-control.tsx:143-156`).
  - Data comes from `farmingContext(state, name).settings/blacklist` (`D/farming-context.ts:16-17`).
- **Fix:**
  1. `updateHuntBlacklist(character, action, monsterId?)` and `saveHuntSettings(character, patch)`.
  2. Route `/characters/:name/hunt-settings`. Update the `FarmingSection.tsx:247` link.
  3. Port `D/farming-context.ts` into `resolveFarmingContext` (`P/models/state.ts:723-737`), adding `settings`.
  4. Read `settings`, `blacklist`, `owner` and `followingLeader` from it.
  5. Title "Hunt settings — {owner}". Disable everything when `followingLeader`.
  6. Save only the changed fields. Disable Save until loaded and dirty.
- **Test:**
  - Open Hunt settings for independent character B (leader = A). Change the death threshold and Save. The body is `{deathThreshold:N, character:'B'}` and the mock's A profile is unchanged.
  - Clear all → `{action:'clear', character:'B'}`.
  - A follower's screen shows all controls disabled.

### P0-08 — Monster focus: empty means `[]`, "All" toggle, Clear, `monsterChoices` source, Fairy disabled, radius not reset
- **Rows:** A146–A150.
- **Broken today:**
  - `P/screens/character-detail/sections/FarmingSection.tsx:384`: `setFocus(name, selected.length ? selected : ['all'], Number(radius) || 400)`.
  - The list is `bestiaryCatalog` (`:354`). It includes `tinyp`, which the server rejects with "invalid monster focus" (`R/http/focus.ts:21`).
  - There is no "All" row, so `['all', x]` collapses back to `['all']` (`focus.ts:71`).
  - `CharacterDetailScreen.tsx:132-133` seeds from never-fetched fields, so every save replaces the real focus and resets the radius to 400.
- **Correct behaviour:**
  - `D/monster-focus-picker.tsx:98-105, 172-176, 216-229`: an "All monsters" toggle, Clear sends `[]`, `tinyp` is disabled.
  - `D/connected-character-card.tsx:105`: `byCharacter?.[name] || selectedFocus`, where `[]` is kept.
  - `D/monster-radius-control.tsx:5-17`: validation 1–10000.
- **Fix:**
  - Use `monsterChoices`, which is already passed at `CharacterDetailScreen.tsx:135`.
  - Add an "All monsters" row: selecting a monster removes `all`.
  - Empty selection sends `[]`. Add a "Clear all" button.
  - Render `tinyp` disabled with the dashboard explanation.
  - Send `monsterSearchRadius` only when the user changed it, validated as an integer 1–10000 with an inline error.
  - Seed `monsterFocusByCharacter[name] ?? monsterFocus ?? []` (`??`, not `?.length ?`).
  - Gate on P0-05.
- **Test:**
  - Untick everything and Save → `monsterFocus: []`.
  - From `['all']`, tick `bat` → `['bat']`.
  - `tinyp` is disabled.
  - A radius-only change sends `{character, monsterFocus:<seeded>, monsterSearchRadius:N}`.
  - Radius 0 shows an error and no POST.

### P0-09 — Restock: real defaults, no zeroing of untouched fields
- **As built (ground rule 1):** no extra validation. `restock-controls.tsx` strips non-digits, so a cleared field saves 0 there too. The destructive bug (untouched fields zeroed) was the never-loaded seed, fixed by P0-01/P0-05 plus the 5/20/0/0 defaults. The whole policy, including each potion `item`, is sent as on the dashboard.
- **Rows:** A380.
- **Broken today:**
  - `P/screens/character-detail/CharacterDetailScreen.tsx:198` defaults the policy to 0/0/0/0.
  - `P/screens/character-detail/sections/RestockSection.tsx:69` sends `Number(x) || 0` for all four values, so editing one zeroes the others on the server.
- **Correct behaviour:**
  - Defaults are 5/20/0/0, the same as the server default (`D/restock-controls.tsx:7-10`).
  - There is a dirty guard (`:12-72`).
- **Fix:**
  - Default to the dashboard constants.
  - Seed from `restockPolicies[name]` after load (P0-05).
  - Validate non-negative integers with an inline error, never coercing to 0.
  - Disable Save until dirty.
  - Surface the result error.
- **Test:**
  - Mock `restockPolicies.X = {hp:{min:100,max:300}, mp:{min:50,max:200}}`. Edit `hp.max` to 400 → body `{character:'X', hp:{min:100,max:400}, mp:{min:50,max:200}}`.
  - A blank field shows an error and no POST.

### P0-10 — Force stand and anniversary auto-chat toggles derived from server state
- **Rows:** A108, A351.
- **Broken today:**
  - `P/screens/character-detail/sections/MerchantControlsSection.tsx:63`: `setForceStand(!forceStand)`, where `forceStand` is always false. **Force stand can never be turned off**, and it pauses all merchant work.
  - `P/screens/account/SettingsScreen.tsx:80-84`: the auto-chat checkbox is bound to the never-fetched `anniversaryAutoChat`, so every tap sends `true`.
- **Fix:**
  - Read both from config. Disable them until loaded (P0-05).
  - After a POST, `await refreshConfigNow()` and render from the server value. No optimistic flip.
- **Test:**
  - Mock `merchantForceStand:true` → the chip shows On; tap → body `{enabled:false}`.
  - Mock `anniversaryAutoChat:true` → checked; untick → body `{anniversaryAutoChat:false}`.

### P0-11 — Bankboi prefix: no blank wipe, trim, validate
- **As built (ground rule 1):** an empty prefix is still sendable, because the dashboard and server allow it. The accidental wipe came from seeding before config loaded, which is now fixed.
- **Rows:** A060.
- **Broken today:**
  - The field seeds from the never-fetched `bankboiPrefix` (`P/screens/account/SettingsScreen.tsx:22, 43-45`).
  - Save posts the untrimmed value (`:71`; `P/api/partyApi.ts:680-682`).
  - The server accepts `""` (`console-v1.2.0/runtime/coordinator/http/dashboard-import.ts:89`), so **Save without typing erases the real prefix**.
- **Correct behaviour:** `prefix.trim()`, maxLength 11, help "3–11 letters… e.g. MyBank0", Saved/error feedback (`D/account-settings.tsx:9, 22-25`).
- **Fix:**
  - Seed after load.
  - Enforce `maxLength={11}` and validate 3–11 characters.
  - Disable Save when invalid or unchanged.
  - Send `trim()`.
  - Show "Saved" or the inline error.
- **Test:**
  - Mock prefix `MyBank` → the field shows `MyBank`.
  - Clearing the field disables Save.
  - `'  Foo  '` posts `Foo`.

### P0-12 — Gold and item-collection thresholds: seed from server, validate, never write 0 by default
- **Rows:** A377, A378.
- **Broken today:**
  - **Wrong seed, never re-synced.** `P/screens/character-detail/sections/MerchantControlsSection.tsx:168-169` uses `useState(String(threshold))`. Under RC1 that is `threshold = 0` (`P/models/state.ts:780`), and it never re-syncs.
  - **Gold threshold Apply writes 0.** `:189` posts `Number(x) || 0`, i.e. **`threshold: 0`, which triggers constant bank runs**.
  - **Item threshold is silently clamped.** `:198` clamps it to 1–42 without telling the user.
- **Correct behaviour:**
  - `Number.isSafeInteger(n) && n >= 0`, otherwise an error message.
  - 1–42, with "Use an item-slot threshold from 1 to 42" (`D/use-party-console.tsx:367-392`).
  - The dashboard's own fallback default is 100000 (`:155`).
- **Fix:**
  - Re-sync from the server when not dirty (`useEffect`), gated on P0-05.
  - Validate with an inline error. Never coerce.
  - Disable Apply when unchanged.
- **Test:**
  - Mock `threshold: 250000` → the input shows it.
  - Typing `abc` shows an error and sends no POST.
  - Typing `50` in the item-slot field shows the 1–42 message and sends no POST.

### P0-13 — Equipment: filter `trade*` stand slots
- **Rows:** A230.
- **Broken today:**
  - `P/screens/character-detail/sections/EquipmentSection.tsx:22` renders `Object.entries(slots)` unfiltered, so the merchant's `trade1..N` stand slots appear as equipment.
  - Tapping one offers Unequip (`P/screens/itempanel/ItemActionPanel.tsx:345`). That sends `unequip {slot:'tradeN'}`, which the server accepts (`R/inventory/transfer-commands.ts:57, 67`). The script then closes the stand and pulls the listing (`console-v1.2.0/characters/shared.js:9803-9808`).
- **Correct behaviour:** `!slot.startsWith('trade')` (`D/equipment.tsx:45-47, 51`).
- **Fix:**
  - Apply the filter at `:22` and in set counts.
  - As defence in depth, `ItemActionPanel` refuses equipment actions for `trade*` slot names.
- **Test:** a merchant live record with `slots.trade1` → no `trade1` tile, and no `unequip` POST is possible.

### P0-14 — Stand marks: remove/edit pass `id` + `bankPack`; price default `max(1, def.g)`; quantity default = stack; `markAll` semantics
- **Rows:** A202, A203, A385, A386, A391, A392, A444.
- **Broken today:**
  - **Stand remove.** `P/screens/account/StandScreen.tsx:60` removes with no `id`/`bankPack`. The server finds only non-live, non-bank entries without an id (`R/merchant/stand-marks.ts:113-127`), so **removing a live or bank listing returns ok and does nothing**.
  - **Stand price edit.** `:77` edits price with no `bankPack`. The server rebuilds the entry as a merchant-inventory listing at `slot = bankSlot` (`:152-156, 53-64`), so **the bank linkage is lost**.
  - **Item panel stand form.** `P/screens/itempanel/ItemActionPanel.tsx:478-489` StandForm:
    - the price defaults to `item.price || ''`, and `Number('') || 0` → 400 (`R/http/stand-marks.ts:17-26`);
    - `P/api/partyApi.ts:254` defaults `quantity = 1`. Re-marking an existing stack listing **overwrites its quantity to 1** (`R/merchant/stand-marks.ts:153-154`).
  - **Auto-stand form.** `:465-476` has the same price-0 issue.
  - **Bank stand form.** `P/screens/account/BankScreen.tsx:337, 389` uses the same defaults. Its "Mark all" sends `quantity: q` for one slot instead of `markAll:true`, which lists every identical copy (`R/http/stand-marks.ts:69`, `R/merchant/stand-marks.ts:86-112`).
- **Correct behaviour:**
  - Price `existing?.price || max(1, def.g)` and quantity `existing?.quantity || item.q || 1` (`D/connected-inventory.tsx:76-93`, `D/party-inventory-panels.tsx:142-150`).
  - Remove sends `{...listing, remove:true}` (`D/use-party-console.tsx:698-700`).
  - `markAll` checkbox (`D/party-management-panels.tsx:380-400`).
- **Fix:**
  1. **`markForStand`.** Make `quantity` required, add `markAll?: boolean`, and keep `id`/`bankPack` pass-through.
  2. **StandScreen.**
     - Remove sends `{id, bankPack, item, slot, price, quantity, remove:true}`, behind a two-step "Really remove?".
     - Price edit includes `bankPack` and validates ≥ 1.
  3. **StandForm (inventory) and the bank stand row.**
     - Defaults as above.
     - Add a quantity input for stacks (1..q).
     - Reject a price < 1 client-side.
     - Rename the bank "Mark all" to the dashboard's checkbox semantics ("List every identical copy held by the merchant or stored in the bank at this price") and send `markAll:true`.
  4. **Auto-stand.** Prefill `existingRule?.price || max(1, def.g)`.
- **Test:**
  - Listing a 200-stack → body `quantity: 200`, price = `def.g`.
  - Removing a live listing → body has `id`, and the mock removes it.
  - Editing the price of a bank listing → `bankPack` is preserved.
  - Bank "Mark all" → `markAll: true`.
  - A blank price → client error and no POST.

### P0-15 — Sell to NPC: quantity sheet defaulting to the stack, proceeds, confirmation (character, merchant and bank)
- **Rows:** A223, A224.
- **Broken today:**
  - **Character and merchant items.** `P/screens/itempanel/ItemActionPanel.tsx:222-235` sells immediately, and `P/api/partyApi.ts:273` defaults `quantity = 1`. A 200-stack sells 1, and the server de-duplicates (`R/http/npc-sale.ts:167-170`), so re-tapping can't raise the quantity.
  - **Bank items.** `P/screens/account/BankScreen.tsx:426-464` sells unmodified items on one tap, with a fixed quantity of 1 or q.
- **Correct behaviour:** `D/party-management-panels.tsx:497-613` and `D/connected-inventory.tsx:94-102`:
  - a quantity input, default `item.q`, validated 1..available;
  - "You will receive: total (each)";
  - modified-gear acknowledgement;
  - a Sell / Sell all button;
  - a confirmation is always shown.
- **Fix:** add a `NpcSaleSheet` (this becomes the shared primitive in F5):
  - reuse `npcSaleValue` (`P/lib/itemFormulas.ts:244-286`) and `ModifiedItemWarning`;
  - make `quantity` required in `markForNpcSale` and `sellBankItemToNpc` (`partyApi.ts:267-293`);
  - open it from both call sites;
  - **do not** change the default to the stack without the sheet, because a one-tap whole-stack sale would be worse.
- **Test:**
  - Tapping Sell on a 200-stack opens the sheet with 200 and the proceeds shown. Cancel sends no POST. Confirm → `quantity:200`.
  - In the bank, "Sell" also opens the sheet.

### P0-16 — Auto NPC-sale on the merchant: omit `character`
- **Rows:** A225, A226.
- **Broken today:**
  - **Wrong rule key.** `P/api/partyApi.ts:327-329` always sends `character` (called from `P/screens/itempanel/ItemActionPanel.tsx:236` and `P/screens/character-detail/sections/AutoMarksSection.tsx:39`). The server keys a per-player rule (`R/http/automatic-sales.ts:47-55, 70`; `R/merchant/player-npc-sales.ts:11-14`).
  - **The rule never fires** for the merchant (`R/merchant/automatic-sales.ts:209-212`).
  - **It wipes the merchant's other auto rules** for that item via `selectAction` (`R/inventory/automatic-action.ts:120-128`).
  - **It is invisible** in both UIs.
  - **Remove deletes the wrong key** (silent no-op).
- **Correct behaviour:**
  - Set: `character: name === state.merchantCharacter ? undefined : name` (`D/connected-inventory.tsx:105-109`).
  - Remove on the merchant list: `{action:'remove', item}` (`D/use-party-console.tsx:673-677`).
- **Fix:** `autoNpcSale(item, {character?, remove?})` omits the key when it is undefined. The callers compute `character` using `dynamicState.merchantCharacter` (typed in P0-01; F1 generalises this).
- **Test:**
  - On the merchant, auto-sell → the body has no `character`; the rule appears in the merchant list; Remove deletes it.
  - On a non-merchant → `character` is present.

### P0-17 — Auto exchange: never toggle off by accident
- **Rows:** A199.
- **Broken today:**
  - The server *toggles*: if the key exists, the rule is deleted (`R/inventory/merchant-item-commands.ts:57-61`).
  - The PWA guard `autoExchangeMarked` reads the never-fetched `autoExchanges` (`P/screens/itempanel/ItemActionPanel.tsx:192, 284`), so tapping an already-marked item **silently removes the rule**.
- **Correct behaviour:** the dashboard disables the row when it is marked (`D/automatic-item-actions.tsx:39`).
- **Fix:**
  - Disable the row until config is loaded.
  - When marked, render it disabled as "Auto exchange · already marked".
  - Show the row only when `characterName === merchantCharacter` (server requirement, `merchant-item-commands.ts:65`).
- **Test:**
  - Config delayed → row disabled.
  - Mock with the key present → row disabled, no POST.

### P0-18 — WTB: always send `priorityOverride` (null clears)
- **Rows:** A419.
- **Broken today:** `P/api/partyApi.ts:646` omits the key when it is null. The server keeps the previous value when the key is undefined (`R/http/merchant-bid.ts:37-40`).
- **Fix:** always include `priorityOverride` (null allowed). A blank field in WtbScreen means null.
- **Test:** edit a bid with override 80 and blank the field → body `priorityOverride: null`, and the mock clears it.

### P0-19 — Market: route Ponty buys to `/merchant/ponty-order`
- **Rows:** A406.
- **Broken today:**
  - `P/screens/account/MarketScreen.tsx:94-95` branches on `listing.source === 'ponty'`.
  - Ponty listings have no `source` (`console-v1.2.0/characters/shared.js:1134-1136`, `R/status/ponty.ts:38-45`), so every Ponty buy calls `aldata-order`, which returns 409 (`R/http/manual-market-orders.ts:74-85`).
- **Fix:** tag the origin when merging at `:20`, e.g. `[...aldata.map(l => ({...l, origin:'aldata'})), ...ponty.map(l => ({...l, origin:'ponty'}))]`, and branch on `origin`. A purchase confirmation is part of M6. Optionally add a minimal "Buy N for Xg?" confirm here, because the action spends gold.
- **Test:** a mock Ponty listing without `source` → buying POSTs `/merchant/ponty-order {keys:[k], quantity, unitPrice}`.

### P0-20 — Bank withdraw double-tap guard
- **Rows:** A442.
- **Broken today:** `P/screens/account/BankScreen.tsx:357, 365` has no in-flight guard. Withdraw is a server toggle (`R/inventory/transfer-commands.ts:47-50, 149-154`), so **the second tap removes the mark just added**.
- **Correct behaviour:** an `inFlight` ref and a pending block (`D/bank-withdrawal.tsx:15-17, 28-35`).
- **Fix:** add a per-slot in-flight ref and disable the buttons while pending (both "Mark" and "Mark all").
- **Test:** double-click "Mark for withdrawal" → exactly one POST.

### P0-21 — Delete the hardcoded Patinder production recovery and the `coreFetchDebug` banner
- **Rows:** A359, A510.
- **Broken today:**
  - **Patinder button.** `P/screens/character-detail/sections/MerchantQueueSection.tsx:8-47, 86-96` posts `merchant/production {character:'Patinder', action:'complete', id:'Patinder:1790863565429:zq4qk8ap6o', success:false}` whenever the current job mentions upgrade or compound. It guesses an outcome, which v1.2.0 deliberately avoids (`R/inventory/production.ts:122-126, 146-159` `resolve-unknown`).
  - **Debug banner.** `P/screens/character-detail/CharacterDetailScreen.tsx:66-79`, `P/data/PartyDataProvider.tsx:166-172` and `P/data/queryKeys.ts:16-21` ship a TEMPORARY diagnostic banner.
- **Fix:**
  - Delete the Patinder block and `completeProductionAttempt` (`P/api/partyApi.ts:437-452`; it has no other caller).
  - Delete the banner, the setter and the query key.
  - If recovery UI is wanted later, build a generic `action:'pending'` listing plus `resolve-unknown` with a required reason, behind a confirm. That is beyond parity and not planned.
- **Test:**
  - Repo check: `grep -r "Patinder\|coreFetchDebug" web/src` returns nothing.
  - e2e: an upgrade job in the queue shows no "Clear stuck" button.

### P0-22 — Merchant job cancel: confirmation for automatic routines; hidden for fishing/mining/current; "undo intent" hint
- **Rows:** A341.
- **Broken today:**
  - `P/screens/character-detail/sections/MerchantQueueSection.tsx:123-133` cancels any queued job on one tap and sends `{id: job.id ?? ''}`.
  - Server side effects (`R/http/merchant-control.ts:45-82`):
    - automatic jobs set `merchantAutomations[routine] = false`;
    - auto-exchange deletes its `autoExchanges` keys;
    - auto-upgrade/compound wipe their auto marks;
    - manual upgrade/compound/stat-scroll cancels wipe the `upgrades`/`compounds`/`statScrolls` marks.

  None of this is warned.
- **Correct behaviour:**
  - Cancel shows only for `status === 'queued'` with a reason other than fishing/mining (`D/merchant-card-controls.tsx:120-122`).
  - It is disabled without an id.
  - Automatic routines show "Cancel {label}? Canceling this job will also disable this routine until you re-enable it in Routines." (`D/merchant-cancel-job-control.tsx:20, 38-63`).
  - Manual jobs show the tooltip "Cancel and undo pending intent" (`:40`).
- **Fix:**
  - Port `routineFor`/`routineEnabled` (`R/merchant/routines.ts:8-24`) and `automaticRoutineKeys` (shared with P0-06).
  - Apply the visibility and disable rules above.
  - Show a ConfirmDialog for automatic routines and the hint text for manual ones.
  - Surface the result error.
- **Test:**
  - An auto-exchange job → tapping Cancel shows the dialog. Dismiss → no POST. Confirm → POST.
  - A fishing job has no Cancel.
  - The current job has no Cancel.

### P0-23 — "Go home" sends `go-home`
- **Rows:** A161.
- **Broken today:**
  - `P/screens/character-detail/sections/TravelSection.tsx:32` calls `sendCharacterTo(name,'main',0,0,'home')`, which sends `character-travel`.
  - `travel()` calls `authorize()`, which **overwrites `characterLocations`**, and never resets the realm (`R/navigation/manual-commands.ts:71-84`).
  - The real `go-home` sets `block.realm = activeRealm` and restarts the block (`:112-130`).
- **Fix:**
  - Add `PartyApiClient.goHome(character)` → `sendCommand(character, {type:'go-home'})`.
  - Use it at `:32` and show the result error.
- **Test:** tap Go home → body `{character, type:'go-home'}`.

### P0-24 — Realm switch confirmation with Fatigue/Hop Sickness warnings
- **Rows:** A054.
- **Broken today:**
  - `P/screens/account/SettingsScreen.tsx:125-139`: tapping a realm name switches every character immediately.
  - That can apply Realm Fatigue (~30 min) and Hop Sickness (−80 Luck/Gold/XP, −20 % output) with no warning.
  - The set-home checkbox is always shown.
- **Correct behaviour:** `D/party-inventory-panels.tsx:533-601`:
  - the confirmation dialog shows the warnings, or "already home";
  - "Set as home realm" is shown only when the destination is not home, with the Bean explanation;
  - Cancel / "Switch all characters" with a busy state and error;
  - the action is disabled while `realmControl.operation` is running.
- **Fix:**
  - Port the dialog verbatim and open it on tap.
  - Add `operation`/`currentRealm`/`split` to `RealmControl` (`P/models/state.ts:474-478`). The full realm UI is R2.
- **Test:** tap a realm → dialog; Cancel → no POST; confirm → `{realm, setHome}`.

### P0-25 — Auto-compound target capped at 7
- **Rows:** A209.
- **Broken today:**
  - `P/screens/itempanel/ItemActionPanel.tsx:393-410` offers tiers up to `itemMaximumLevel` (`P/lib/itemFormulas.ts:152-156`).
  - The server's `validTier` caps at 7 (`R/inventory/compound-commands.ts:58-60`). When it fails, `automatic()` returns `undefined` and **the command falls through to other handlers** (`:103`).
- **Correct behaviour:** `Math.min(7, max)`; the row is hidden when `level >= cap` (`D/automatic-item-actions.tsx:31, 44`).
- **Fix:** apply the cap and the hide rule.
- **Test:** an item with maxLevel 10 at +2 → the options are +3..+7.

**Destructive items considered and placed elsewhere (not Phase 0):**
- **Withdrawals target the first live merchant-class character** (A440/A441). The withdrawal is still queued for the merchant role, so it isn't wrong data, but it can be routed to a bankboi. This is first in **F1** because it needs `merchantCharacter` (typed in P0-01).
- **Gold target input shows 0** (A357). Saving is user-initiated, with a dirty guard (`P/screens/character-detail/sections/GoldTargetSection.tsx:15-21`). P0-05 gates it.
- **Mail send has no two-step confirm** (A484, spends postage). The send is explicit, so it goes to B4.
- **Market WTS buys have no confirm** (A402). These go to M6. A minimal confirm can ride with P0-19.
- **Deconstruction marks have no confirmation** (A219/A222). The marks are queued and removable by id, so this goes to I3.


---

## 3. Phase 1: Foundations (these unblock many rows)

### F1 — Configured merchant and shared-rule owner; replace every class-based merchant detection
- **Rows:** A244, A257, A428, A440, A441. It also gates rows in I2, U2, B1, M1 and P0-16/17.
- **Dependency:** P0-01 (`merchantCharacter` and `merchantRules` are config fields: `R/telemetry/public-state.ts:66, 81`).
- **Scope:**
  1. **Hooks.** Add `useMerchantCharacter(): string | null` (from `dynamicState.merchantCharacter`) and `useRuleOwner(name)`, which returns `merchantRules ? merchantCharacter : name` (`D/connected-inventory.tsx:47, 186-187, 195, 214`).
  2. **Replace all 13 `ctype === 'merchant'` sites:**
     - `P/screens/account/BankScreen.tsx:30`
     - `P/screens/account/MerchantCommerceScreen.tsx:501`
     - `P/screens/account/OfferingsScreen.tsx:33`
     - `P/screens/character-detail/CharacterDetailScreen.tsx:111, 146, 147, 156, 183, 191, 200, 209`
     - `P/screens/itempanel/ItemActionPanel.tsx:71, 183`
  3. **Bank withdraw** (`BankScreen.tsx:356-365`) targets `merchantCharacter` and is **enabled while the merchant is offline** (`D/party-inventory-panels.tsx:108-111`). The withdrawal badge reads `withdrawals[merchantCharacter]`.
  4. **AutoMarksSection** reads `autoItemMarks[ruleOwner]` and `autoDeconstruction[ruleOwner]` (`P/screens/character-detail/sections/AutoMarksSection.tsx:42, 52`). In shared mode, the non-merchant NPC list honours `character` being forced to undefined (`R/http/automatic-sales.ts:70`).
  5. **Bankbois excluded** from the character list, Deliver-to targets and "merchant" inference. Use `bankbois[].name` (`D/use-party-console.tsx:771-788`).
  6. **NPC-sale source.** `source:'merchant'` only when `characterName === merchantCharacter` (`R/http/npc-sale.ts:144-146`).
- **Size:** S–M.

### F2 — Keep the full `characterDetails` (diagnostics + presence)
- **Rows:** A030, A031, A506, A507. Also unblocks C1, I7, X1 and C4 rows.
- **Scope:**
  - **Store the whole record.** Replace `P/data/PartyDataProvider.tsx:161-175` with a typed `QK.characterDiagnostics: Record<string, CharacterDiagnostics>`. The fields are the allow-list in `R/telemetry/public-state-characters.ts:4-57`:
    - stats: `characterDollHtml, characterSprite, skin, primaryStat, attack, frequency, range, speed, unrestrictedSpeed, armor, resistance, str, int, dex, vit, fortitude, luck, goldBonus, xpBonus, combatStats`;
    - extras: `tracktrix, monsterAchievements, anniversaryVisit, anniversaryState, ping, seenAt, monsterHunt`.
  - **Clock offset.** Store `serverNow` and compute `offset = serverNow - Date.now()`.
  - **Presence.** `online = now + offset - seenAt < 10_000` (`D/query-cache.tsx:206-222`).
  - **Compatibility.** Keep `characterHunt` derived for existing callers.
  - **Caveat.** `dashboardCharacters` is limited to active slots (`public-state.ts:181-187`), so inactive characters have no diagnostics. Render "—", never 0.
- **Size:** S.

### F3 — `post()` returns parsed body + status + error code
- **Rows:** A508. Unblocks WTB replacement (A417), missing-materials (A313), stale-order counts (A345), the auto-bank confirm (A443) and the hunt-backup pre-check.
- **Scope:**
  - Extend `ApiResult` failure to `{kind:'failure', message, status?, code?, body?}`.
  - In `P/api/partyApi.ts:160-192`:
    - parse JSON on both success and failure;
    - on success return `ok({ok, error, data: parsed})`;
    - on failure return `fail(message, response.status)` with `code: parsed.code` and `body: parsed`.
  - Keep the action toast unchanged.
  - Add typed accessors: `occupants`, `missing`, `deliveriesRemoved`/`bankMarksRemoved`, `code === 'auto_bank_confirmation_required'`, `backup_required`.
- **Size:** S.

### F4 — Navigation shell: account hub reachable from home; error boundary
- **Rows:** A003, A007, A008, A009, A015.
- **Scope:**
  1. **Account hub reachable from home.** Mount `AccountMenu` (`P/screens/character-detail/AccountMenu.tsx`) from the `CharacterListScreen` header as well, or promote it to an `/account` hub screen. Today the home gear opens the server override (`P/screens/CharacterListScreen.tsx:37`).
  2. **Home gear → `/settings`.** Move the server-address override into Settings; a button already exists at `SettingsScreen.tsx:98-104`.
  3. **Menu entries and badges.**
     - Add Routines, WTB, Offerings, Logs, Hunt settings (per character, from the character screen) and Daily dungeon (after C5).
     - Mail shows its unread count (`GET /mail .count`, `D/mail-count.tsx:2-5`).
     - Stand shows `occupied/16` (after M4).
  4. **Error boundary.** Wrap the routes in an `ErrorBoundary` with "Retry now" / "Reload now", porting the state machine in `DL/dashboard-recovery.ts:30-102`. Swap its probe for `GET /setup/state`.
  5. **Settings gear seeding.** Seed the realm destination as `activeRealm || currentRealm` (`D/party-header.tsx:101-116`). Auto-reveal the ALData key when `aldata.hasKey`.
- **Size:** M.

### F5 — Shared UI primitives
- **Rows:** none of their own. Consumed by ~150 rows.
- **Scope:**
  - **`ConfirmDialog`:** two-step "Really?" inline, plus a modal variant. Replaces ad-hoc confirms in HuntSettingsScreen, BankScreen and AutoMarksSection.
  - **`StandDialog`:** the single stand listing dialog. It serves:
    - modes: manual, auto, edit;
    - sources: inventory, bank, bankboi, market "List", stand edit;
    - contents: quantity, `markAll` and the 16-slot guard. The presets come in M5.
  - **`NpcSaleSheet`** (from P0-15) and **`AutoNpcSaleConfirm`** (I4).
  - **`ItemActionPanel` source modes.** Generalise `P/screens/itempanel/ItemActionPanel.tsx` to accept:
    - `source: {kind:'inventory', character, slot} | {kind:'equipped', character, slotName} | {kind:'bank', pack, slot} | {kind:'bankboi', pack:'bankboi:NAME', slot} | {kind:'exchangeReward', item} | {kind:'catalog', item}`;
    - an `owner` (merchant for bank and bankboi);
    - `slot:-1` for auto rules (`D/party-inventory-panels.tsx:167-182`).

    Each menu row is gated exactly as `D/inventory-panel.tsx:770-1068` and `D/equip-slot.tsx:117-138`.
  - **`WtbDialog`:** lift `WtbScreen.WtbForm` so item details, stand buy-orders and market rows can open it (M7).
  - **`MonsterDetail`:** grow `ItemDetailBrowser`'s `MonsterDetailContent` (`P/screens/itemdetail/ItemDetailBrowser.tsx:470-497`) into the one monster view (X1).
  - **`ItemTile`:** sprite + `+level` (only when > 0) + stat badge + mluck clover + quantity + banner strip + operation overlay. Shared by inventory, bank, bankboi, equipment, stand, mail and the exchange reward tiles.
  - **`ResultText`:** inline success/error line for results the dashboard shows inline (cleanup counts, Saved, errors).
- **Size:** M.

### F6 — State model typing (`P/models/state.ts`)
- **Rows:** none of their own. Required by most packages.
- **Scope.** Add to `PartyStateDynamic`:
  - **Roster and slots:** `activeSlots`, `characterConnections`, `steamSwitch`, `bankboiTransaction`, `gameVersion`, `classChoices`, `appearanceChoices`, `characterAppearances`
  - **Giveaway and realm:** `giveawayRealms`, `giveawayPlayers`, `realmControl` (full: `currentRealm, split, characters, operation, merchantRealm`)
  - **Merchant and stand:** `merchantWeapon`, `merchantRules`, `merchantBlacklist`, `autoStandBuys`, `autoBlacklistMerchants`, `merchantStandLocation`, `buyUpgradeBatchSize`, `standPriceHistory`, `nativeStand`, `mluckSchedule`, `gatheringCooldowns`, `gatheringNoTool`
  - **Events and hunting:** `eventSchedules`, `eventSelectionsByCharacter`, `eventsByCharacter`, `monsterPrioritiesByCharacter`, `passiveHunting`, `passiveRareHunts`, `scatterMonsterTypes`, `anniversary`, `characterLocations`, `partyLocation`
  - **Upgrades and storage:** `upgradeOfferingStock`, `bankbois` (with `items`), `bankboiQueue`, `aldata.buyOrders`, `aldata.trades`, `ponty.listings[].seenAt/groupKey/serverRegion`
  - **Session:** `serverNow`, `accountId`

  Extend these types:
  - `MerchantJob`: `operationStage, order, listings, seller, expectedItem, bidItemId, priority, retryAt, pauseReason, realmRetryExhausted, autoExchangeKeys, commandReport, phase`
  - `StandListing`: `state, tradeSlot, bankSlot`
  - `Condition`: `definition, live, sprite, stacks, source`
  - `InventoryEntry`: `operation, meta`
  - `ReceivedMail`: `taken: boolean | 'pending', collection, collectionError, to`
  - `MailSnapshot`: `error, updatedAt`
  - `BestiaryMonster`: `range, definition`
  - `HuntSettings`: `preferredSpawns`
- **Size:** M (mechanical).

### F7 — Verbatim ports of pure dashboard and runtime libraries
- **Rows:** none of their own; each port is consumed by the package in the last column.
- **Rule:** copy the file unchanged except for imports. Add a header comment with source path, console version and line range. Add **Vitest** (`npm i -D vitest`, script `test:unit`) and a golden test per module that runs the dashboard's own examples or fixtures.

| # | Source (console-v1.2.0/…) | PWA target (web/src/…) | Consumer packages |
|---|---|---|---|
| 1 | `runtime/game-log-filters.ts` | `lib/gameLogFilters.ts` | S3 |
| 2 | `runtime/roster/character-order.ts` | `lib/characterOrder.ts` | R1 |
| 3 | `dashboard/features/party/party-gold.tsx:9-39` (`partyGoldNames`, `goldTotals`) | `lib/partyGold.ts` | S1 |
| 4 | `dashboard/features/party/abbreviated-gold.tsx` | `lib/abbreviatedGold.ts` | S1, M4, M6 |
| 5 | `dashboard/features/party/pending-character-cards.tsx:3-39` | `lib/pendingCharacters.ts` | R1 |
| 6 | `dashboard/features/party/live-protocol.ts:24-29` | `api/liveProtocol.ts` (in place) | P0-02 |
| 7 | `dashboard/features/party/settings-export.ts` + `dashboard-state-import.tsx:41-77` | `lib/dashboardState.ts` | S2 |
| 8 | `dashboard/features/party/console-updates.tsx:8-32` | `hooks/useConsoleUpdates.ts` | S1, S2 |
| 9 | `dashboard/features/party/stand-inspection.ts`, `stand-capacity.ts`, `stand-count.tsx` | `lib/standInspection.ts` | M4, M5 |
| 10 | `level-price-history.ts`, `exact-level-price.tsx`, `suggested-item-value.tsx`, `ponty-price.tsx`, `npc-sale-value.tsx`, `stand-price-button.tsx` (logic) | `lib/pricing.ts` (reconcile with `lib/itemFormulas.ts` `npcSaleValue`) | M4, M5, M7, I1 |
| 11 | `dashboard/features/party/display-character.ts` | `lib/displayCharacter.ts` | C1 |
| 12 | `dashboard/features/party/query-actions.ts:16-95` | `data/queryActions.ts` | F8 |
| 13 | `dashboard/lib/dashboard-recovery.ts` | `lib/recovery.ts` | F4 |
| 14 | `dashboard/features/party/character-stats-dialog.tsx:26-151` | `lib/characterStats.ts` | C1, I7 |
| 15 | `status-duration.ts`, `duration-label.tsx`, `format-duration.ts` | `lib/statusDuration.ts` | C1, C5 |
| 16 | `dashboard/lib/event-policy.ts` + `event-selection-control.tsx:14-19` | `lib/eventPolicy.ts` | C4 |
| 17 | `hunt-blacklist-label.ts` | `lib/huntBlacklistLabel.ts` | C2 |
| 18 | `skill-range-label.tsx` | `lib/skillRange.ts` | C9 |
| 19 | `dungeon-query.ts:38-51`, `dungeon-settings.tsx:77-88`, `dungeon-panel.tsx:45-57` | `lib/dungeon.ts` | C5 |
| 20 | `runtime/hunt/spawn-preferences.ts` | `lib/huntSpawn.ts` | C2 |
| 21 | `runtime/coordinator/navigation/passive-settings.ts` | `lib/passiveHunting.ts` | C2 |
| 22 | `monster-spawns.tsx` (reason map) | `lib/monsterSpawns.ts` | X1, C3 |
| 23 | `farming-context.ts` | `models/state.ts` `resolveFarmingContext` | P0-07, C2 |
| 24 | `item-action-banner.ts` | `lib/itemActionBanner.ts` (replaces `lib/markBadge.ts`) | I1, B1 |
| 25 | `deconstruction.ts` (`deconstructionRewards`) | `lib/deconstruction.ts` | I3 |
| 26 | `item-operation-overlay.tsx` (logic), `stat-badge-class.tsx`, `mluck-clover.tsx`, `comparison-slot-label.tsx`, `equipment-slots.tsx`, `equipment.tsx:42-57` | `lib/equipment.ts`, `components/ItemTile.tsx` | I1, I5, I2 |
| 27 | `gear-comparison-dialog.tsx:124-226` (`project`, `setState`) | `lib/gearProjection.ts` | I7 |
| 28 | `catalog-comparison.tsx`, `equipment-catalog-dialog.tsx:69-159`, `equipment-types` | `lib/equipmentCatalog.ts` | I9 |
| 29 | `properties-at-level.tsx` | `lib/itemFormulas.ts` `propertiesAtLevel` (replace `previewProperties`) | I6, I9 |
| 30 | `item-exchange-details.tsx` (box / cosmo / sixcake notes, reward target) | `lib/exchangeDetails.ts` | M11 |
| 31 | `upgrade-estimate.tsx`, `upgrade-estimate-cache.tsx` (+ `UPGRADE_CHANCES`) | `lib/upgradeEstimate.ts` | M10, M5 |
| 32 | `upgrade-rule-tiers.tsx`, `upgrade-rule-quantity.tsx` | `lib/upgradeRules.ts` | I8 |
| 33 | `runtime/upgrade-offerings.ts` (`offeringOverlap`, `offeringRule`), `runtime/upgrade-preview.ts` (`previewOptions`) | `lib/offerings.ts` | U1 |
| 34 | `runtime/coordinator/merchant/routines.ts:1-25` (`routineFor`, `routineEnabled`) | `lib/routines.ts` | P0-22, M1 |
| 35 | `routine-labels.tsx`, `automatic-routine-keys.tsx` | `lib/routineLabels.ts` (replace) | P0-06 |
| 36 | `dashboard/lib/account-inventory.ts` | `lib/inventoryCounts.ts` (replace) | M10 |
| 37 | `lucky-upgrade-slot.tsx` (`physicalInventory`, `validLuckySlot`), `runtime/lucky-slot-tracking.ts:48-62` | `lib/luckySlot.ts` (extend) | U3 |
| 38 | `merchant-job-label.ts` | `lib/merchantJobLabel.ts` | M1 |
| 39 | `runtime/party-groups` (`merchantPartyGroups`) | `lib/partyGroups.ts` | M1 |
| 40 | `automatic-commerce-rule-key.tsx` | `lib/commerceRuleKey.ts` | I1, M11 |
| 41 | `wtb-preferences.tsx` (explanation strings, replacement flow logic) | `lib/wtbPreferences.ts` | M7 |
| 42 | `stand-sheet.tsx` helpers: `dealValuesByItem`, ALData grouping `:505-549`, Ponty grouping `:788-840`, blacklist matching `:593-619`, `ownedKey`/`bankOwned` `:659-719` | `lib/market.ts` (extract) | M6 |
| 43 | `shared-rule-conflicts.tsx` (`describe`) + `runtime/coordinator/inventory/shared-rules.ts` `itemRuleConflicts` | `lib/ruleConflicts.ts` | M9 |
| 44 | `drop-rate.ts` (already at `lib/itemFormulas.ts:427-443`): **use it** | — | X1 |
| 45 | `indirect-bestiary-drops.tsx`, `monster-achievements.ts`, `bestiary-dialog.tsx:26-40, 64-90` (sorts, milestones), `monster-achievement-progress.tsx:16-25` | `lib/bestiary.ts` | X1 |
| 46 | `bank-sale-copies.ts`, `same.tsx`, `bank-sheet.tsx:313-391, 723-727` (marks, floors, keys) | `lib/bank.ts` | B1, B2 |
| 47 | `send-mail-dialog.tsx:146-168` (`attachmentLevel`, `stackable`, `validQuantity`) | `lib/mail.ts` | B4 |
| 48 | `definition-grid.tsx` (formatting) | `components/DefinitionGrid.tsx` | X1, C9, C1 |
| 49 | `compact-inventory.tsx` | `lib/compactInventory.ts` (optional; layout difference is accepted) | I1 |

- **Size:** M overall. Split per consumer package; each port is S.

### F8 — Live data-layer parity
- **Rows:** A014, A024, A025. Also helps C7 (escape cadence) and S3 (logs cadence).
- **Scope:**
  1. **Per-domain cadences** (`D/query-cache.tsx:122-150`):
     - core 1–2 s (configurable; the dashboard uses 1 s);
     - config 15 s (P0-01);
     - logs 1 s **only while Logs or a combat log is visible**;
     - bank 2 s while a bank-reading screen is open, otherwise 15 s;
     - mail count 10 s, plus mail 2 s while Mail is open;
     - market 10 s;
     - catalog refetched when `referenceRevision` changes (not on the 10-minute timer);
     - escape 1 s while an escape is active.
  2. **SSE fallback.** While SSE is unhealthy, poll `section=fast` (250 ms) and `section=inventory` (2 s) (`D/dashboard-live.tsx:47-52`).
  3. **Account switch.** Track `accountId` and clear all query caches when it changes (`D/query-cache.tsx:181-198`).
  4. **Targeted refresh.** Use `queryActions.affectedDomains` (F7 #12) to refetch only the sections an action touches.
- **Size:** M.


---

## 4. Phases 2–10: Feature parity by domain

Phases are ordered by user impact:
1. Account control (start, stop or move characters)
2. Merchant operations
3. Bank, bankbois and mail
4. Inventory
5. Market, stand and WTB
6. Character and farming
7. Upgrades and exchange
8. Dungeons, events and map
9. Reference, settings and logs

Every remaining PARTIAL, MISSING, UNREACHABLE or BROKEN row appears in exactly one package (Appendix A, "Package" column). Each package lists its rows by Appendix A ID.

Size key: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks.

### Package index

| Phase | ID | Title | Size | Rows | Depends on |
|---|---|---|---|---|---|
| 2 | R1 | Roster, slots and session controls | L | 13 | P0-01, F6, F7#2/#5, F5 |
| 2 | R2 | Realm control panel | M | 5 | P0-24, F6 |
| 2 | S1 | Header and status (versions, gold, load states) | S | 5 | F4, F7#3/#4/#8 |
| 3 | M1 | Merchant card, queue, activity and actions | M | 16 | P0-01, P0-22, F1, F3, F7#34/#38/#39 |
| 3 | M2 | Merchant settings | M | 7 | P0-01, P0-05, P0-06 |
| 3 | M3 | Routines dialog polish | S | 2 | P0-06 |
| 3 | M9 | Shared rule conflicts | S | 2 | F1, F7#43 |
| 4 | B1 | Bank item actions (bank-source ItemActionPanel) | L | 16 | F1, F3, F5, P0-14, P0-15 |
| 4 | B2 | Bank floors and vaults | S | 8 | F1, F7#46 |
| 4 | B3 | Bankbois | L | 8 | P0-01 (bank `dashboard=1`), B1, P0-11 |
| 4 | B4 | Mail | M | 17 | F3, F5, B3 (bankboi picker) |
| 5 | I1 | Inventory tiles and action banners | M | 15 | P0-01, F5 ItemTile, F7#24/#26/#40 |
| 5 | I2 | Item context-menu gating, labels and targets | M | 14 | F1, F2 (presence), F5 |
| 5 | I3 | Deconstruction (confirm, pending marks, retry) | M | 5 | P0-01, F5, F7#25 |
| 5 | I4 | NPC-sale management | S | 3 | P0-15, P0-16, F5 |
| 5 | I5 | Equipment panel | S | 6 | P0-13, F5, F7#26 |
| 5 | I6 | Item details completeness | M | 9 | F2, F5, M5, M7 |
| 5 | I7 | Gear comparison projection | M | 3 | F2, F7#14/#27 |
| 5 | I8 | Auto-rule list editing | M | 8 | P0-01, F1, F3, F7#32 |
| 6 | M4 | Stand sheet | L | 7 | P0-01, P0-14, F6, F7#9/#10 |
| 6 | M5 | Stand listing dialog (presets, context) | M | 5 | F5 StandDialog, F7#10/#31 |
| 6 | M6 | Market (ALData WTS/WTB/Classifieds, Ponty) | L | 12 | P0-19, F3, F5, F7#42, M7 |
| 6 | M7 | WTB orders | M | 10 | P0-18, F3, F5 WtbDialog, F7#41 |
| 6 | M8 | Marketplace settings (auto-fill, blacklist) | M | 5 | P0-01, F6 |
| 7 | C1 | Character card, stats and statuses | M | 10 | F2, F7#11/#14/#15/#48 |
| 7 | C2 | Farming and Hunt completeness | L | 10 | P0-01, P0-07, F7#17/#20/#21/#23 |
| 7 | C3 | Focus priorities and farming-area routing | M | 6 | P0-08, F7#22 |
| 7 | C7 | Travel and party-action results | S | 5 | F3 |
| 7 | C8 | Per-character combat log | S | 2 | F8 |
| 8 | U1 | Offerings and server upgrade preview | M | 6 | F1, F5, F7#33 |
| 8 | U2 | Upgrade/compound/stat-scroll mark labels | S | 7 | P0-01, F1 |
| 8 | U3 | Lucky slot | S | 3 | F7#37, I1 |
| 8 | M10 | Commerce dialog completion | M | 6 | P0-01 (bank `dashboard=1`), F3, F7#31/#36 |
| 8 | M11 | Exchange workflow | L | 9 | F5 (exchangeReward mode), I1 banners, F7#30/#40 |
| 9 | C4 | Events and anniversary | M | 10 | P0-01, F2, F7#16 |
| 9 | C5 | Daily dungeons (Cave of Many Dreams) | L | 17 | F5, F7#15/#19, C6 (cave map) |
| 9 | C6 | Live map | L | 1 | F6 |
| 10 | X1 | Bestiary and monster details | M | 17 | F2, F5 MonsterDetail, F7#44/#45/#48, C3 picker |
| 10 | I9 | Equipment catalog and catalog comparison | M | 11 | F7#28/#29, M7 |
| 10 | C9 | Skills reference | S | 1 | F7#18/#48 |
| 10 | S2 | Settings and console management | L | 11 | F3, F4, F7#7/#8, B4 |
| 10 | S3 | Logs | M | 8 | F7#1, F8 |

---

### Phase 2 — Account control

#### R1 — Roster, slots and session controls (L)
- **Rows:** A036–A048.
- **Scope:**
  - **Character list** in `activeSlots` order: excludes bankbois, sorted primary → Steam → headless → merchant (`orderCharacters`). Offline cards stay instead of disappearing.
  - **Empty slots:** "Load character slot N" buttons, disabled while `steamSwitch.phase` is active.
  - **Roster picker:**
    - Headless/Steam hosting toggle;
    - hides active and online members;
    - shows "Lv N class" per member, and "No available roster members" when empty;
    - entry to Create character.
  - **Slot actions:**
    - spawn headless;
    - Steam login (with `clientSetup`);
    - slot 0 "Switch Steam character".
  - **Per-character session controls:**
    - Steam: become primary / join background / join as primary;
    - Headless;
    - Log out (native characters use `/steam/action logout`);
    - each action has a per-action confirmation text, a stale-state guard ("session or Steam primary changed"), and busy/error states.
  - **Pending character cards:**
    - portrait, class, hosting kind;
    - status labels: Loading in Steam / CODE active / CODE stopped / Waiting / Connection lost;
    - delayed-help text and error.
  - **Create character dialog:**
    - name A–Z 0–9 _, 4–12 characters;
    - class from `classChoices`;
    - four `appearanceChoices` previews;
    - "Create and spawn" with busy/error.
  - **"Bankboi Active" card** (`bankboiTransaction` mode · phase).
  - **"Recover Steam handoff"** when `steamSwitch.phase === 'failed'`.
- **Dashboard sources:** `D/roster-controls.tsx`, `roster-picker.tsx`, `party-roster-picker.tsx`, `character-session-controls.tsx`, `pending-character-cards.tsx`, `create-character.tsx`, `party-create-character.tsx`, `party-workspace.tsx:34-68`, `use-party-console.tsx:301-367`, `party-inventory-panels.tsx:319-324, 427-446`, `RT/roster/character-order.ts`, `steam-client-setup.ts`.
- **PWA files:**
  - `P/screens/CharacterListScreen.tsx` (list, slots, pending, bankboi card)
  - new `P/screens/roster/RosterPickerSheet.tsx`, `CreateCharacterSheet.tsx`
  - `P/screens/character-detail/CharacterDetailScreen.tsx` (session controls in header)
  - `P/api/partyApi.ts` (`spawnSlot`, `logoutSlot`, `steamAction`, `steamRecover`, `createCharacter`)
  - `P/models/state.ts`
- **Endpoints:**
  - `POST /party-api/slots/:slot/spawn {character}`
  - `POST /slots/:slot/logout {}`
  - `POST /steam/action {character, action: login|logout|primary|headless, clientSetup?}`
  - `POST /steam/recover {}`
  - `POST /roster/create {name, class, look}`
  - state `activeSlots`, `characterConnections`, `steamSwitch`, `bankboiTransaction`, `roster`, `classChoices`, `appearanceChoices`, `characterAppearances`
- **Dependencies:** P0-01 (roster/classChoices/characterAppearances), F6, F7 #2/#5, F5 ConfirmDialog, F2 (presence for offline cards).

#### R2 — Realm control panel (M)
- **Rows:** A049–A053. A054 (confirmation) ships in P0-24.
- **Scope:**
  - Realm header: "Current: label" / "Mixed realms" (red) / "Home: label".
  - Split per-character list ("name: realm | offline").
  - Every realm shown with "(N players)"; PVP realms shown but disabled ("— disabled").
  - "Change realm" disabled when there is no destination, when the destination is current (unless split), or while an operation runs; spinner while running.
  - Operation progress panel: phase, error, per-character realm or "waiting", coloured by state.
- **Dashboard sources:** `D/party-inventory-panels.tsx:326-426`.
- **PWA files:** `P/screens/account/SettingsScreen.tsx:106-146` (extract a `RealmSection`), `P/models/state.ts:474-478`.
- **Endpoints:** state `realmControl.{currentRealm, split, homeRealm, realms[].label/players/pvp, characters, operation}`; `POST /realm/switch` (already correct).
- **Dependencies:** P0-24, F6.

#### S1 — Header and status (S)
- **Rows:** A001, A002, A010, A011, A017.
- **Scope:**
  - "Game vX · Console vY" line.
  - Console-update "!" indicator that deep-links to Settings → Updates.
  - Party gold: bank (abbreviated) + "(X total)", active non-bankboi slots only, "—" when any balance is unknown, tap for exact bank/carried/combined.
  - `abbreviatedGold` used across the app.
  - Load states: "loading" vs "reconnecting" vs "No characters connected yet… open setup", with a link to `${baseUrl}/setup`.
- **Dashboard sources:** `D/party-header.tsx:40-117`, `party-gold.tsx`, `abbreviated-gold.tsx`, `console-updates.tsx:8-44`, `party-workspace.tsx:39-42`.
- **PWA files:** `P/screens/CharacterListScreen.tsx`, `P/screens/character-detail/CharacterDetailScreen.tsx:46`, new `P/components/PartyGold.tsx`.
- **Endpoints:** `GET /console-update` (root, via `getRoot`); state `gameVersion`, `bankGold`, `activeSlots`, `bankbois`.
- **Dependencies:** F4, F7 #3/#4/#8.

---

### Phase 3 — Merchant operations

#### M1 — Merchant card: queue, activity and actions (M)
- **Rows:** A335–A340, A342, A344, A345, A347–A350, A354, A356, A357.
- **Queue:**
  - "Merchant logistics · N queued" stays visible, with "No queued work" when empty.
  - Human job labels via `merchantJobLabel` + `routineFor` + `routineLabels`.
  - Priority prefix `P{job.priority ?? routinePriorities[routineFor(job)] ?? 50}`.
  - Target suffix, suppressed for giveaway jobs.
  - Status column: deferred "Waiting: reason" / "finishing collection" / phase / queued, then realmBlockedReason or "Retry at" or pauseReason.
  - Retry only when `realmRetryExhausted`.
  - Merchant's Luck upkeep row ("dispatch in X").
- **Activity log** on the merchant screen: newest first, time with full-date detail, `— details` suffix, error/success colouring.
- **Clear stale orders:** "Removed N deliveries, M bank marks". Inline result text for cleanup and clear-history.
- **Donate:** XP preview (`donationXpPerGold`, fallback 3.2) + description + inline validation.
- **Join giveaway:** realm Select from `giveawayRealms` + searchable online-player picker from `giveawayPlayers[realm]` ("N online players loaded").
- **Send to party:** group picker (`merchantPartyGroups`) when there is more than one group.
- **Mining/Fishing readiness:** Ready ✓ / m:ss cooldown / "No tool".
- **"Send merchant to…":** online non-merchant characters → `/command {character: target, type:'bank'}`, "Merchant visit queued for X". The PWA's map-travel list (EXTRA) is renamed "Travel to place…".
- **Gold target:** "Exchange gold and items with bank" button (save target, then `/command {character: merchant, type:'bank'}`).
- **Dashboard sources:** `D/merchant-card-controls.tsx`, `merchant-cancel-job-control.tsx`, `merchant-job-label.ts`, `components/merchant-activity.tsx`, `party-reference-panels.tsx:149-193`, `party-management-panels.tsx:92-211`, `send-to-party-control.tsx`, `merchant-visit-control.tsx`, `gold-target-control.tsx`, `RT/coordinator/merchant/routines.ts`, `RT/party-groups`.
- **PWA files:** `P/screens/character-detail/sections/MerchantQueueSection.tsx`, `MerchantControlsSection.tsx`, `GoldTargetSection.tsx`, `TravelSection.tsx`, `P/screens/account/LogsScreen.tsx` (activity moved/duplicated), `P/api/partyApi.ts` (`requestMerchantVisit`, `bankExchange`).
- **Endpoints:**
  - `POST /merchant/job/retry {id}`
  - `/merchant/stale-orders/clear` (read the counts via F3)
  - `/merchant/donate {amount}`
  - `/merchant/join-giveaway {realm, seller}`
  - `/bank-party {group}`
  - `/command {character, type:'bank'}`
  - state `mluckSchedule`, `gatheringCooldowns`, `gatheringNoTool`, `giveawayRealms`, `giveawayPlayers`, `merchantActivity[].details/level`
- **Dependencies:** P0-01, P0-22 (`routineFor`), F1, F3, F7 #34/#38/#39.

#### M2 — Merchant settings (M)
- **Rows:** A369, A372–A376, A379.
- **Scope:** a "Merchant settings" sheet replacing the "Collection settings" expander, with:
  - bank sort mode + "Sort on next visit", each with help text and error display;
  - "Maximum number to buy at once for upgrading" (1–42, Apply, error);
  - merchant stand location X/Y (validated server-side against obstacles);
  - "Marked deliveries create merchant jobs";
  - "Marked withdrawals create merchant jobs" (optimistic pending state);
  - gold threshold and item threshold with the dashboard's explanatory text (validation itself ships in P0-12).
- **Dashboard sources:** `D/merchant-collection-settings.tsx`, `bank-sort-control.tsx`, `buy-upgrade-batch-setting.tsx`, `merchant-stand-location-setting.tsx`, `delivery-trip-setting.tsx`, `withdrawal-trip-setting.tsx`.
- **PWA files:** `P/screens/character-detail/sections/MerchantControlsSection.tsx:92-201` → new `P/screens/merchant/MerchantSettingsSheet.tsx`, `P/api/partyApi.ts` (`setThresholds` + `buyUpgradeBatchSize`, `setStandLocation`, `setTripSetting`).
- **Endpoints:**
  - `POST /config {buyUpgradeBatchSize}`
  - `POST /merchant/stand-location {map:'main', x, y}`
  - `POST /merchant/routine-priorities {priorities:{}, enabled:{deliveries|withdrawals}}`
  - `POST /merchant/bank-sort {mode}|{enabled}`
  - state `buyUpgradeBatchSize`, `merchantStandLocation`, `merchantAutomations.deliveries/withdrawals`, `bankSortMode`, `bankSortRequest`
- **Dependencies:** P0-01, P0-05, P0-06.

#### M3 — Routines dialog polish (S)
- **Rows:** A366, A368.
- **Scope:**
  - Header "Merchant routines · N/M enabled", excluding disabled deliveries/withdrawals.
  - `move()` skips disabled routines (`D/routine-priorities-dialog.tsx:63-64`).
  - Explicit Cancel.
- **PWA files:** `P/screens/account/RoutinesScreen.tsx`.
- **Dependencies:** P0-06.

#### M9 — Shared rule conflicts (S)
- **Rows:** A429, A430.
- **Scope:**
  - "Automatic rules awaiting a choice" panel on the merchant screen: per conflict family/key, a "Paused" label plus "Use {owner}: {describe(value)}" buttons.
  - Incompatible-rules notice: npc vs stand vs deconstruct for the same item.
- **Dashboard sources:** `D/shared-rule-conflicts.tsx`, `connected-inventory.tsx:223`, `RT/coordinator/inventory/shared-rules.ts`.
- **PWA files:** new `P/screens/character-detail/sections/RuleConflictsSection.tsx`, `P/api/partyApi.ts` (`resolveRuleConflict(id, owner)`).
- **Endpoints:** `POST /merchant/rule-conflict {id, owner}`; state `merchantRules.conflicts`, `autoNpcSales`, `autoStandMarks`, `autoDeconstruction`.
- **Dependencies:** F1, F7 #43.

---

### Phase 4 — Bank, bankbois, mail

#### B1 — Bank item actions (L)
- **Rows:** A432, A434–A439, A443, A445–A452.
- **Search:** name/id/definition name; non-matches dimmed.
- **Tiles** (shared `ItemTile`): stat badge, mluck clover, auto-stand banner, RESERVED overlay on items1 slots 35–41.
- **Mark indicators:** co-existing withdraw/$/NPC marks using `same()` identity.
- **Tap a tile** to open item details with bank-source actions.
- **Auto-bank confirmation:** a 409 `auto_bank_confirmation_required` shows "Remove automatic bank mark?" and retries with `removeAutoBankMark:true`.
- **Bank-source ItemActionPanel**, all owned by `merchantCharacter`:
  - Mark/auto stand;
  - Mark for upgrade (withdraw `upgradeTiers`) and Auto mark for upgrade (`slot:-1`);
  - Add upgrade rule;
  - Mark/auto deconstruct (confirmation from I3);
  - Sell to NPC (P0-15 sheet) / auto NPC;
  - Clear all marks (`pack`).
- **Disabled states:** no merchant, `item.l` locked, stand full.
- **Dashboard sources:** `D/bank-sheet.tsx:242-700`, `bank-withdrawal.tsx`, `bank-upgrade-actions.tsx`, `bank-deconstruction-actions.tsx`, `party-inventory-panels.tsx:102-187`, `clear-item-marks.tsx`, `auto-stand-banner.tsx`, `same.tsx`.
- **PWA files:** `P/screens/account/BankScreen.tsx` (replace the inline action strip with ItemActionPanel bank mode), `P/screens/itempanel/ItemActionPanel.tsx`, `P/api/partyApi.ts` (`withdrawFromBank` + `upgradeTiers`, `removeAutoBankMark`).
- **Endpoints:**
  - `POST /command {character: merchant, type:'withdraw', pack, slot, item, markAll, upgradeTiers?, removeAutoBankMark?}`
  - `/command auto-upgrade-mark {slot:-1}`
  - `/command clear-item-marks {pack}`
  - `/merchant/stand`, `/merchant/auto-stand`, `/merchant/npc-sale {source:'bank'}`, `/merchant/auto-npc-sale`
  - `/deconstruction/mark {pack, slot, item, all}`, `/deconstruction/auto`
- **Dependencies:** F1, F3, F5 (ItemActionPanel bank mode, StandDialog, NpcSaleSheet, ConfirmDialog), P0-14, P0-15, I3.

#### B2 — Bank floors and vaults (S)
- **Rows:** A453–A458, A461, A462.
- **Scope:**
  - Floor names (Main bank / Bank basement / Bank underground).
  - "Accessible" / "Locked · requires KEY".
  - Key unlock shows "Owned: N" (merchant inventory + bank) and is disabled at 0.
  - Gold unlock only on accessible floors.
  - Notices: "No purchasable locked vaults…" and "Vault purchases remain disabled until floor access is unlocked."
  - Unlock confirmation names the merchant and states the key is consumed.
  - Unlock disabled without a configured merchant.
  - "Additional bank storage" lists every floor.
- **Dashboard sources:** `D/bank-sheet.tsx:347-391, 701-869, 1190-1270`.
- **PWA files:** `P/screens/account/BankScreen.tsx:150-231`.
- **Endpoints:** `POST /bank/unlock {pack, kind}`; state `bankVaults`, `bank.packs`.
- **Dependencies:** F1, F7 #46.

#### B3 — Bankbois (L)
- **Rows:** A463–A470.
- **Scope:**
  - Section header "Transparent overflow storage · N staged or waiting".
  - Create bankboi:
    - busy state and "NAME created · provisioning queued";
    - first-bankboi confirm "This will reserve 7 slots from bank pane 1";
    - disabled with "Set bankboi name in settings first" when no prefix is set.
  - Bankboi card: name, `transaction.mode · phase` or state, occupied/42, error.
  - Delete: only when empty, two-step "Really? ×", error surfaced (180-minute cooldown).
  - 42-slot grid per bankboi, with the full B1 context menu on pack `bankboi:NAME`.
  - Empty text.
- **Dashboard sources:** `D/bank-sheet.tsx:871-1184`, `bankboi.tsx`, `party-inventory-panels.tsx:112-122`.
- **PWA files:** `P/screens/account/BankScreen.tsx` (new `BankboisSection`), `P/api/partyApi.ts` (`createBankboi`, `deleteBankboi(name)`), `P/models/state.ts`.
- **Endpoints:** `POST /bankbois/create {}`, `POST /bankbois/:name/delete`; state `bankbois` (full, from `section=bank&dashboard=1`), `bankboiQueue`, `bankboiPrefix`.
- **Dependencies:** P0-01 (bank `dashboard=1`), B1, P0-11.

#### B4 — Mail (M)
- **Rows:** A471–A487.
- **Inbox:**
  - Row: subject or "(No subject)", "From X", localized date, attachment status line.
  - Refresh (`/mail/refresh`).
  - "Mail may be out of date: ERR" / "Loading mail…" / "No received mail.".
- **Message detail:**
  - `from → to · date` and a pre-wrapped body.
  - Attachment tile: sprite, `+level`, `× q`, tap to inspect.
  - Status labels: Collected / "Game is processing collection" (`taken:'pending'`) / `collection` text / `collectionError`.
  - Collect disabled while queued or collecting.
  - Delete: two-step, disabled while an attachment is uncollected.
  - Reply.
- **Compose:**
  - Subject max 74, message max 1000; Send disabled until recipient and subject are set.
  - Attachment picker: merchant inventory, every bank pack and every bankboi, with search, select, remove and clear.
  - Attachment quantity validated (1–N).
  - Postage estimate + attachment warning.
  - Two-step "Send mail" → "Really send mail?".
  - "Write message" / Cancel / "Remove attachment" footer.
- **ALData "Prepare mail":** routes through this composer (earthiverse / aldata_auth / key) so postage is shown, then sets auth-pending.
- **Dashboard sources:** `D/send-mail-dialog.tsx`, `party-send-mail-dialog.tsx`, `mail-count.tsx`, `received-mail.tsx`, `mail-query.ts`.
- **PWA files:** `P/screens/account/MailScreen.tsx`, `P/models/mail.ts`, `P/api/partyApi.ts` (`sendMail` + `quantity`/`source`, `refreshMail`, `deleteMail`, `getPostage`), `P/screens/account/SettingsScreen.tsx:245-284`.
- **Endpoints:** `GET /mail`, `POST /mail/collect|delete|refresh {id}`, `GET /mail/postage`, `POST /merchant/send-mail {recipient, subject, message, quantity, source?{pack, slot, item}}`.
- **Dependencies:** F3, F5, B3 (bankboi items for the picker), S2 (auth-pending poll).

---

### Phase 5 — Inventory and items

#### I1 — Inventory tiles and action banners (M)
- **Rows:** A170, A171, A173, A174, A176–A182, A184, A188–A190.
- **Scope:**
  - Capacity counter `occupied/total` (coloured: < 5 free rose, ≤ 10 orange) with a "N slots free" hint.
  - Collapsible header and a "Loading inventory…" state.
  - `+level` only when > 0. Stat badge, mluck clover, sprite fallback to name, live `meta.sprite`.
  - In-progress upgrade/compound overlay (from → to, success %, pulsing result).
  - Port `item-action-banner.ts` in full, covering:
    - its 13 candidates and Rule conflict, in dashboard priority order;
    - tooltip/long-press detail (NPC sale state, error, retry; conflict families);
    - tile border colour;
    - the missing variants: stand sale, auto stand, auto exchange, auto-compound pending, auto deconstruction, auto-NPC rule, rule-based auto bank/merchant, merchant weapon.
  - Merchant long-press: suggested-price details, deconstruction state, NPC-sale state.
- **Dashboard sources:** `D/inventory-panel.tsx:215-760`, `item-action-banner.ts`, `item-operation-overlay.tsx`, `stat-badge-class.tsx`, `mluck-clover.tsx`, `inventory-entry.tsx`, `auto-stand-banner.tsx`, `suggested-price-details.tsx`.
- **PWA files:** `P/screens/character-detail/sections/InventorySection.tsx`, `P/lib/markBadge.ts` (delete in favour of `lib/itemActionBanner.ts`), `P/components/ItemTile.tsx`, `P/models/item.ts`.
- **Endpoints:** state only (`items[i].operation/meta`, every mark/rule map, `standPriceHistory`, `merchantWeapon`).
- **Dependencies:** P0-01, F5, F7 #10/#24/#26/#40.

#### I2 — Item context-menu gating, labels and targets (M)
- **Rows:** A191, A192, A194, A195, A200, A201, A210–A212, A214–A217, A241.
- **Scope:**
  - Equip only for equipment; Use / "Use elixir" only when usable.
  - Compare-slot submenu: Main/Off hand, Ring 1/2, Earring 1/2, with the equipped item name or "Empty".
  - Deliver-to targets: online (`seenAt`), not self, no bankbois.
  - Disabled states:
    - Mark for bank / Mark for merchant once marked;
    - Auto mark for bank shown only with a configured merchant, disabled once set;
    - Auto deconstruct disabled when the rule exists.
  - "Mark for merchant" / "Auto mark for merchant" only for non-merchant holders.
  - Hide auto-bank, Sell NPC, auto NPC, compound, exchange and stand when no merchant is configured.
  - Labels: "Update auto sell to NPC…" / "Update auto mark for stand…".
  - "Clear all marks" only when something matches, with its tooltip: "Clear this item's manual marks and matching shared automatic rules". Applies to inventory and equipped items.
  - "Merchant weapon" banner.
- **Dashboard sources:** `D/inventory-panel.tsx:770-1068`, `item-actions.ts`, `automatic-item-actions.tsx`, `comparison-slot-label.tsx`, `clear-item-marks.tsx`, `equip-slot.tsx:117-138`.
- **PWA files:** `P/screens/itempanel/ItemActionPanel.tsx`, `P/screens/itempanel/GearComparisonSheet.tsx:36-37`.
- **Dependencies:** F1, F2 (presence), F5.

#### I3 — Deconstruction (M)
- **Rows:** A218–A222.
- **Scope:**
  - Gate on `canDeconstruct(item, deconstructionCatalog)`, which already exists at `P/models/state.ts:386`.
  - Confirmation dialog for manual, auto and bank marks: reward rows with sprite, quantity and chance %, a "separate roll" note, cost per item, an error line, and distinct titles for auto and all.
  - Pending deconstruction marks list (owner · qty · state · error) with Retry when blocked and remove by id.
- **Dashboard sources:** `D/deconstruction.ts`, `deconstruction-confirmation.tsx`, `bank-deconstruction-actions.tsx`, `connected-inventory.tsx:59-71, 224-228`, `inventory-panel.tsx:1103-1115`.
- **PWA files:** `P/screens/itempanel/ItemActionPanel.tsx`, `P/screens/account/BankScreen.tsx:407-424`, `P/screens/character-detail/sections/AutoMarksSection.tsx`, `P/api/partyApi.ts` (`markForDeconstruction` + `id`/`retry`/`remove`).
- **Endpoints:** `POST /deconstruction/mark {character, slot, item}` / `{character, id, retry:true}` / `{character, id, remove:true}` / `{pack, slot, item, all}`; `POST /deconstruction/auto`.
- **Dependencies:** P0-01, F5, F7 #25.

#### I4 — NPC-sale management (S)
- **Rows:** A227–A229.
- **Scope:**
  - Automatic NPC-sale confirmation dialog: item name +level, "You will receive Xg per sale", rule-scope text, Enable/Cancel.
  - Merchant NPC list includes manual `npcSaleMarks` (owner · qty · state · error; Remove disabled while running).
  - Remove a manual mark by id.
- **Dashboard sources:** `D/party-management-panels.tsx:436-496`, `inventory-panel.tsx:1089-1102`, `connected-inventory.tsx:72-75`.
- **PWA files:** `P/screens/character-detail/sections/AutoMarksSection.tsx`, `P/api/partyApi.ts` (`removeNpcSaleMark(character, id)`).
- **Endpoints:** `POST /merchant/npc-sale {character, id, remove:true}`, `POST /merchant/auto-npc-sale`.
- **Dependencies:** P0-15, P0-16, F5.

#### I5 — Equipment panel (S)
- **Rows:** A231–A234, A236, A238.
- **Scope:**
  - All 15 fixed slots in dashboard order, with "Empty" tiles. The script sends only occupied slots, so the order must come from `equipment-slots.tsx`.
  - Slot labels ("Earring 1").
  - Level, stat and clover badges.
  - Set-progress badge `current/total`.
  - Equipped stat-scroll banner (pass `statScrolls`).
  - Elixir shows a disabled "Active elixir effect".
- **Dashboard sources:** `D/equipment.tsx`, `equipment-slots.tsx`, `equip-slot.tsx`.
- **PWA files:** `P/screens/character-detail/sections/EquipmentSection.tsx`, `CharacterDetailScreen.tsx:161`.
- **Dependencies:** P0-13, F5, F7 #26.

#### I6 — Item details completeness (M)
- **Rows:** A261–A263, A266, A268–A270, A274, A276.
- **Scope:**
  - "Add to stand", with the stand-full guard.
  - "Add to WTB" at the preview level, opening the shared WtbDialog.
  - Tracktrix bonuses for tracker/supercomputer.
  - Hands-required line.
  - Compare popover: any party character → slot.
  - Stats grid: ranked order, derived `equip_slot`, `type` hidden, stackable/max stack.
  - `propertiesAtLevel` semantics.
  - Monster drops Sort select.
  - Live-instance meta merged over catalog meta.
- **Dashboard sources:** `D/item-details.tsx`, `party-item-details.tsx`, `properties-at-level.tsx`.
- **PWA files:** `P/screens/itemdetail/ItemDetailBrowser.tsx`, `P/screens/itempanel/ItemActionPanel.tsx:57`, `P/lib/itemFormulas.ts:134-147, 324-356`.
- **Dependencies:** F2, F5, M5, M7.

#### I7 — Gear comparison projection (M)
- **Rows:** A278–A280.
- **Scope:**
  - Full character projection with deltas and %: HP, MP, Attack, Attack speed, Range, Run speed, Armor, Resistance, STR/INT/DEX/VIT, Fortitude, Luck, Gold, XP, Evasion, Reflection, Lifesteal, Manasteal, piercings, Crit, Dmg return, MP cost, Output.
  - Character doll.
  - Set changes (before → after, GAINED/LOST).
- **Dashboard sources:** `D/gear-comparison-dialog.tsx`.
- **PWA files:** `P/screens/itempanel/GearComparisonSheet.tsx`. Its comment at lines 9-16 claims the data is unavailable; that is false per 03-ch (e).
- **Dependencies:** F2, F7 #14/#27.

#### I8 — Auto-rule list editing (M)
- **Rows:** A246–A249, A251–A253, A259.
- **Scope:**
  - Auto upgrades list: every owner's rules, "+a → +b" strip, owner detail, count.
  - Inline edit of target tiers (1..13−L), with Enter/Escape/blur and validation.
  - Inline edit of remaining quantity (−1 = ∞, 0 = Completed).
  - Auto compounds list: owner, target, quantity; inline target (1–7) and quantity edits.
  - Per-entry two-tap "Really?" remove.
  - Every remove, clear and edit surfaces its error.
- **Dashboard sources:** `D/inventory-panel.tsx:232-542, 1130-1237`, `upgrade-rule-tiers.tsx`, `upgrade-rule-quantity.tsx`.
- **PWA files:** `P/screens/character-detail/sections/AutoMarksSection.tsx` (`RuleEntry` gains `edits`/`retry`/`disabled`/`upgradeTarget`), `P/api/partyApi.ts` (`updateAutoUpgradeRule(owner, item, ruleKey, {tiers|quantity})`, `setAutoCompound(owner, name, targetTier, quantity)`).
- **Endpoints:** `/command update-auto-upgrade-rule {ruleKey, tiers|quantity|remove}`, `/command auto-compound-mark {item:{name}, targetTier, quantity|remove}`.
- **Dependencies:** P0-01, F1, F3, F7 #32.

---

### Phase 6 — Market, stand, WTB

#### M4 — Stand sheet (L)
- **Rows:** A005, A381–A384, A387, A388.
- **Header:** "Inspect stand · N/16" via `occupiedStandSlots` (live trade slots + native buy offers + live listings).
- **Sale section:**
  - "Items for sale · N/16 slots" + "Stand open / closed / unknown".
  - Sale rows reconciled against live trade slots (`standSaleRows`): Live/Paused badges, live-only unmanaged rows (read-only), and a separate "Queued sales for stand" group.
  - Tiles via `ItemTile`.
  - Suggested-price detail on long-press.
  - Price → StandDialog edit.
- **"Buy orders · N/16 slots":** native offers with item +level, "N wanted", price (opens the WTB dialog), "Native batch", a Priority input (blur/Enter saves with `editField:'priorityOverride'` + `bidRevision`, Esc reverts), "Auto" badge, Use-stand toggle, and Cancel / "Really cancel?".
- **Inspect** any row.
- **Dashboard sources:** `D/stand-sheet.tsx:1800-2111`, `stand-inspection.ts`, `stand-count.tsx`, `suggested-price-details.tsx`, `party-inventory-panels.tsx:189-205`.
- **PWA files:** `P/screens/account/StandScreen.tsx` (rewrite), `P/screens/character-detail/AccountMenu.tsx` (count).
- **Endpoints:** `POST /merchant/stand`, `POST /merchant/bid {…editField, value, bidRevision}`; state `standListings[].state/tradeSlot`, `nativeStand.offers/problems`, `standBids`, `characters[merchant].slots/standOpen`, `standPriceHistory`.
- **Dependencies:** P0-01, P0-14, F6, F7 #9/#10, M7.

#### M5 — Stand listing dialog presets and context (M)
- **Rows:** A389, A390, A393–A395.
- **Scope:**
  - "Buy from NPC: Xg / unavailable" and "Current number on market: N".
  - 13 price presets: NPC sale +10 %, Ponty, Default −10 %, Default, Default +10 %, Market low −5 % (disabled below the NPC price), Market price, Highest WTB, Recent +5 %, Recent, Recent −5 %, Input −5 %, Input +5 %.
  - Inline error.
  - Automatic variant ("Set one fixed price…"): presets, existing-rule prefill, "Update" label.
  - 16-slot guard when not editing.
- **Dashboard sources:** `D/party-management-panels.tsx:212-435`, `stand-price-button.tsx`, `use-panel-model.ts:88-111`, `use-party-console.tsx:578-603, 829-849`.
- **PWA files:** `P/components/StandDialog.tsx` (from F5).
- **Endpoints:** `POST /merchant/stand`, `/merchant/auto-stand`; state `standPriceHistory`, `aldata.listings`, `ponty`.
- **Dependencies:** F5, F7 #10/#31.

#### M6 — Market (L)
- **Rows:** A396–A405, A407, A408.
- **Status banner:** unavailable / loading / "ALData publishing is not configured" + "Go to setup".
- **Tabs with counts:** Live WTS / Live WTB / Classifieds / Ponty.
- **Search:** item, seller, server, map.
- **WTS tab:**
  - Filters: Show deals only, Hide bad deals, Hide unaffordable (bank gold), Hide blacklisted (default on).
  - Grouping (same seller/realm/map/price/identity, quantity summed), sorted fresh-first, then price.
  - Rows: sprite, name +lvl, seller · region · map · "seen Ns ago" · "N available"; price coloured by deal ("X % off"); stale rows dimmed.
  - Buy: quantity + "All" + confirmation "Really buy N X for Yg?", split across grouped listings. Stale rows show "Make WTB" instead.
- **Live WTB tab:**
  - "N offers match exact items held by merchant or bank", "You have N".
  - Sell with confirmation → `/merchant/aldata-sale`.
  - Stale + owned rows show "List" (StandDialog at the WTB price). "Hide unowned".
- **Classifieds tab:** WTS/WTB prices, note, "Add to WTB", "Add to stand".
- **Ponty tab:** grouped item + fresh/stale, "Mixed realms", "Observed Ns ago", "Matches WTB", min-lot quantity, "Up to Xg", Buy disabled when stale, confirmation, last error.
- **Every row:** inspect item; busy, inline error and double-tap protection.
- **Dashboard sources:** `D/stand-sheet.tsx:419-3697`, `party-inventory-panels.tsx:229`, `aldata-listing.tsx`, `use-party-console.tsx:565-577`.
- **PWA files:** `P/screens/account/MarketScreen.tsx` (tabs), `P/lib/market.ts`, `P/api/partyApi.ts` (`sellAlData(order, sellQuantity)`).
- **Endpoints:** `POST /merchant/aldata-order {listing, buyQuantity}`, `/merchant/aldata-sale {order, sellQuantity}`, `/merchant/ponty-order {keys, quantity, unitPrice}`; state `aldata.listings/buyOrders/trades/error/merchantsUpdatedAt/auth`, `ponty`, `merchantBlacklist`, `autoBlacklistMerchants`, `bankGold`.
- **Dependencies:** P0-19, F3, F5, F7 #42, M7 (Make/Add to WTB), M5 ("List").

#### M7 — WTB orders (M)
- **Rows:** A410, A412–A417, A420–A422.
- **Scope:**
  - Active WTB panel inside Market.
  - List filter + "visible / total" + Clear filter + empty texts.
  - Row: inspect, "· +N minimum".
  - Inline field edits (×qty, price, "P n/Default") sending `{editField, value, bidRevision}` (stale-edit 409 protection).
  - Per-row Use-stand / Accept-higher toggles with info explanations, "Auto" badge and native-stand problem text.
  - Cancel with "Really cancel?".
  - "Make room for a buy order" replacement dialog on 409 `occupants`, retrying with `replaceStandEntry`.
  - 15 price presets at the exact level, including "Farm price" with info.
  - Existing price prefilled only when `minimumQuality` matches.
  - Entry points: item details "Add to WTB", stand buy-order price, market "Make WTB"/"Add to WTB".
  - Priority clamp 0–100.
- **Dashboard sources:** `D/wtborder-dialog.tsx`, `wtbpriority-input.tsx`, `wtb-preferences.tsx`, `active-wtb-fields.tsx`, `stand-sheet.tsx:1104-1228, 2245-2593`.
- **PWA files:** `P/screens/account/WtbScreen.tsx`, `P/components/WtbDialog.tsx`, `P/api/partyApi.ts` (`saveBid` + `editField`/`value`/`bidRevision`).
- **Endpoints:** `POST /merchant/bid {itemId, price, quantity, minimumQuality, clear, priorityOverride, useStandSlot, acceptHigherLevels, replaceStandEntry, preferencesOnly, editField, value, bidRevision}`.
- **Dependencies:** P0-18, F3, F5, F7 #41.

#### M8 — Marketplace settings (M)
- **Rows:** A423–A427.
- **Scope:**
  - "Automatically fill empty stand slots with highest priority buy order".
  - "Enable blacklisting unavailable merchants".
  - Manual blacklist add (name + minutes, −1 = forever).
  - Strike records list (seller, region/server, reason, strikes, blocked/until/eligible) with per-record Clear.
  - Clear all (two-step).
- **Dashboard sources:** `D/stand-sheet.tsx:3067-3333`.
- **PWA files:** new `P/screens/account/MarketplaceSettingsScreen.tsx`, `P/api/partyApi.ts`.
- **Endpoints:**
  - `POST /merchant/native-stand {action:'configure', enabled}`
  - `POST /merchant/blacklist {action:'configure', enabled} | {action:'add', seller, minutes} | {action:'clear', key?}`
  - state `autoStandBuys`, `autoBlacklistMerchants`, `merchantBlacklist`
- **Dependencies:** P0-01, F6.

---

### Phase 7 — Character and farming

#### C1 — Character card, stats and statuses (M)
- **Rows:** A081–A084, A086, A091, A093–A096.
- **Header:**
  - Portrait (doll HTML / sprite / skin fallback) with a Tracktrix badge.
  - Tap the portrait for the Character Stats dialog: level, HP, MP, attack, attack speed, range, run speed, armor/resistance with % reduction, STR/INT/DEX/VIT/FOR effects, luck, 18 combat stats.
  - Presence dot.
  - Ping ("—ms" when offline).
  - Map line relabels `zone_*` to "Cave of Many Dreams".
- **Statuses:**
  - Collapsible "Active status (N)" section, shown **for merchants too**. Today `FarmingSection` is the only renderer, and it is gated off merchants at `CharacterDetailScreen.tsx:115`.
  - Per-status sprite, ticking countdown, depleting bar, stacks, Active/Expiring.
  - Tap a status for the Condition Details dialog.
- **Dashboard sources:** `D/character-portrait.tsx`, `character-stats-trigger.tsx`, `character-stats-dialog.tsx`, `connected-character-card.tsx:233-351`, `active-statuses.tsx`, `status-duration.ts`, `duration-label.tsx`, `condition-details.tsx`, `party-condition-details.tsx`, `character-map-section.tsx:24-25`.
- **PWA files:** `P/screens/character-detail/VitalsHeader.tsx`, new `StatusesSection.tsx`, `CharacterStatsSheet.tsx`, `ConditionDetailsSheet.tsx`, `P/models/item.ts:39-46`.
- **Dependencies:** F2, F7 #11/#14/#15/#48.

#### C2 — Farming and Hunt completeness (L)
- **Rows:** A129, A132–A135, A140–A144.
- **Scope:**
  - Badge: "Copy leader" / policy · **live** effective mode, "Used when Follow is off". Remove the "Account-wide" copy (`FarmingSection.tsx:153`) and the stale comments (`models/state.ts`, `FarmingSection.tsx:40-46`).
  - Hunt status block: "Hunt status" / "Last Hunt status", stage, message, "Preparing Monster Hunt cycle".
  - Backup batch countdown with per-member target/ready/fresh.
  - Quest owner + turnIn notice.
  - "Blacklisted — skipped" on my quest.
  - Blacklist labels (`huntBlacklistLabel`), sprites and dates; tap to open monster details.
  - "Add to Hunt blacklist" searchable picker.
  - Preferred hunt spawns per monster (Automatic or a specific spawn, with map preview).
  - Passive hunting: the "Use field generators when passively hunting fairy" toggle, plus a per-monster table (enabled, keep moving, max level −1 = any, priority 0–1000, search, info).
- **Dashboard sources:** `D/farming-mode-control.tsx`, `hunt-settings-control.tsx`, `hunt-spawn-settings.tsx`, `hunt-blacklist-picker.tsx`, `hunt-blacklist-label.ts`, `passive-hunting-menu.tsx`, `connected-character-card.tsx:156-208`, `RT/hunt/spawn-preferences.ts`, `RT/coordinator/navigation/passive-settings.ts`.
- **PWA files:** `P/screens/character-detail/sections/FarmingSection.tsx`, `P/screens/account/HuntSettingsScreen.tsx` (now per character), new `PassiveHuntingScreen.tsx`, `P/api/partyApi.ts` (`setRareHunting`, hunt-settings `preferredSpawns`).
- **Endpoints:** `POST /hunt-settings {…, preferredSpawns, character}`, `POST /hunt-blacklist {action:'add', monsterId, character}`, `POST /rare-hunting {useFieldGenerators} | {rules}`; state `passiveHunting`, `passiveRareHunts`, `monsterHunt.backup/turnIn`.
- **Dependencies:** P0-01, P0-07, F7 #17/#20/#21/#23, X1 (monster details).

#### C3 — Focus priorities and farming-area routing (M)
- **Rows:** A151–A155, A157.
- **Focus:**
  - Per-monster target priority 0–1000 (default 50, "higher wins"), always sent with the current focus.
  - An explicitly empty per-character focus shows "No monsters selected".
  - The focus header shows the effective radius (`leader || char`).
  - Radius context text: "Following X: effective radius N…", "Clearing monster focus resets this to 400".
  - "Find selected monster" disabled for followers, with a tooltip.
- **Farming-area picker:**
  - Saved-waypoint preference (`characterLocations[char] || partyLocation`).
  - Map preview + "Enlarge map", legend.
  - `MonsterSpawns` fallback when there are no routes.
  - Sends `label: "the selected farming area in {mapName}"`.
  - Uses the `monsterChoices` list.
- **Dashboard sources:** `D/monster-focus-picker.tsx:106-124, 191-206`, `monster-radius-control.tsx`, `monster-route-button.tsx`, `farming-area-picker.tsx`, `party-workspace.tsx:80-144`, `use-party-console.tsx:737-781`.
- **PWA files:** `P/screens/character-detail/sections/FarmingSection.tsx`, `P/components/FarmingAreaPicker.tsx`, `P/api/partyApi.ts` (`setFocus` + `monsterPriorities`, `routeToFarmingArea` + `label`).
- **Endpoints:** `POST /focus {character, monsterFocus, monsterPriorities, monsterSearchRadius?}`, `/command party-monster-travel|character-travel {location, farmingMonsterIds, label}`, `POST /navigate-to-monster`.
- **Dependencies:** P0-08, F7 #22, C6 (map preview can use static map images first).

#### C7 — Travel and party-action results (S)
- **Rows:** A159, A160, A162–A164.
- **Scope:**
  - "Send character to…": known areas **or** exact map/X/Y with validation and error.
  - Return to leader: hidden on the leader, disabled when the leader is offline, error surfaced.
  - Send party to town: error surfaced.
  - Escape: 1 s status polling while active, spinner, failed/success labels.
  - Results of travel, go-home and return-leader shown inline.
- **Dashboard sources:** `D/character-travel-dialog.tsx`, `inventory-panel.tsx:1278-1297`, `escape-control.tsx`, `use-party-console.tsx:426-446, 720-736`.
- **PWA files:** `P/screens/character-detail/sections/TravelSection.tsx`, `P/screens/CharacterListScreen.tsx:67-102`.
- **Dependencies:** F3, F8 (escape cadence), F2 (leader presence).

#### C8 — Per-character combat log (S)
- **Rows:** A167, A168.
- **Scope:** on the character screen, a collapsible combat log with count, the last 50 events, colours by type (skill/kill/loot/death/item), "No combat events yet", and "Clear history".
- **Dashboard sources:** `D/connected-combat-log.tsx`, `combat-log.tsx`.
- **PWA files:** new `P/screens/character-detail/sections/CombatLogSection.tsx`, `P/api/partyApi.ts` (`clearCombatLog(character)`).
- **Endpoints:** `GET /state?section=logs` (`combatLogs[name]`), `POST /combat-log/:character/clear {}`.
- **Dependencies:** F8 (logs fetched while visible).

---

### Phase 8 — Upgrades and exchange

#### U1 — Offerings and server upgrade preview (M)
- **Rows:** A295–A298, A302, A303.
- **Scope:**
  - "Upgrade with Primling / Primordial Essence / Primordial X" rows inside Mark for upgrade (inventory and equipped). They are stock-gated by `upgradeOfferingStock`, open a "Confirm upgrade" dialog, and send `{…source, tiers:1, offering}`.
  - Embedded server upgrade preview panel:
    - "Next attempt +L→+L+1", executor, status (queued/running/unavailable/partial/complete/invalidated);
    - per-option % with observed time;
    - "Refresh chances" and a 2 s poll;
    - lucky-slot disclaimer.
  - "Add upgrade rule" from an item's auto submenu, prefilled.
  - Clear all offering rules (two-click).
  - Add-rule dialog: client overlap and `ceiling > max` validation.
- **Dashboard sources:** `D/upgrade-actions.tsx:52-107`, `upgrade-offering-controls.tsx`, `upgrade-preview-panel.tsx`, `connected-inventory.tsx:173`, `RT/upgrade-offerings.ts`, `RT/upgrade-preview.ts`.
- **PWA files:** `P/screens/itempanel/ItemActionPanel.tsx` (UpgradeTierPicker), new `P/components/UpgradePreviewPanel.tsx`, `P/screens/account/OfferingsScreen.tsx`.
- **Endpoints:** `/command upgrade-mark {slot|equipped, tiers:1, offering}`, `POST /upgrade-preview {character, slot, item, refresh}`, `/command upgrade-offering-rule {rule}|{rule:{id}, remove:true}`; state `upgradeOfferingStock`, `upgradeOfferingRules`.
- **Dependencies:** F1 (executor = merchant), F5, F7 #33.

#### U2 — Upgrade/compound/stat-scroll mark labels (S)
- **Rows:** A198, A204, A205, A207, A208, A239, A240.
- **Scope:**
  - Trigger labels "· N tiers" on Mark/Auto mark for upgrade, for inventory and equipped items; the current auto tier is disabled.
  - Stat scroll trigger: "Stat scroll: X" (pending) / "Change stat scroll · X" / "Add stat scroll".
  - "Mark for compounding" hidden once grouped.
  - "Auto compound to +N" label, hidden when level ≥ min(7, max).
  - All gated on `merchantCharacter`.
- **Dashboard sources:** `D/upgrade-actions.tsx`, `automatic-item-actions.tsx:31-54`, `inventory-panel.tsx:875-1012`, `equip-slot.tsx:123-136`.
- **PWA files:** `P/screens/itempanel/ItemActionPanel.tsx:240-278, 346-361, 372-410`.
- **Dependencies:** P0-01, F1.

#### U3 — Lucky slot (S)
- **Rows:** A305–A307.
- **Scope:**
  - Statistics dialog: counts as well as percentages, plus the full explanatory text.
  - Lucky-slot outline in the merchant's physical grid. Tapping it opens "Show lucky slot data" / "Show item details"; empty lucky slots are tappable too.
  - Merge the live local evidence stream (`char.luckySlotTracking`).
- **Dashboard sources:** `D/lucky-slot-tracker.tsx`, `lucky-slot-menu.tsx`, `lucky-upgrade-slot.tsx`, `connected-inventory.tsx:51-54`, `RT/lucky-slot-tracking.ts:48-62`.
- **PWA files:** `P/screens/character-detail/sections/LuckySlotSection.tsx`, `InventorySection.tsx`, `P/lib/luckySlot.ts`.
- **Dependencies:** F7 #37, I1.

#### M10 — Commerce dialog completion (M)
- **Rows:** A310, A313, A328, A330, A333, A334.
- **Scope:**
  - Owned counts include bankboi inventories, excluding stale online copies (`inventoryCounts` with bankbois). Requires bank `dashboard=1` (P0-01).
  - 409 `missing` detail appended: " · id +L: R required, A available".
  - Buy quantity capped at 9999.
  - "90 % budget: N base items · k scroll G" and "Gold (est)" via `upgradeEstimate`.
  - Craft gold total, including ingredient purchases.
  - Recipe preview (per-material owned/missing/buy N; "Next craft: Xg total").
- **Dashboard sources:** `D/merchant-commerce-dialog.tsx:126-601`, `upgrade-estimate.tsx`, `DL/account-inventory.ts`.
- **PWA files:** `P/screens/account/MerchantCommerceScreen.tsx`, `P/lib/inventoryCounts.ts`.
- **Dependencies:** P0-01, F3, F7 #31/#36.

#### M11 — Exchange workflow (L)
- **Rows:** A314–A319, A321, A324, A325.
- **Scope:**
  - Rules overlay (gear on every tile): header, "N required per exchange", "Potential results" grid with %.
  - Nested exchange drill-down.
  - Tap a tile → item details with an "Add" button.
  - "Mark multiple" bulk staging: Bank / Stand / Upgrade (target +1..+13) / NPC modes. It shows staged "Pending", "N pending changes. Done saves; closing discards.", a stand-price note and errors.
  - Reward-tile banners: Auto exchange / Auto sell to NPC / Auto stand / Auto upgrade → +N / Auto compound → +N / Auto deconstruction / "Auto bank (default)".
  - Reward-tile context menu of automatic actions; also used in item details.
  - Item details:
    - the fixed reward opens the **reward** (`exchangeTarget(entry.reward)`) and shows "qty × name" (one-line fix: `P/screens/itemdetail/ItemDetailBrowser.tsx:418`);
    - "Rewards" heading for boxes, cosmo/sixcake notes, NPC name;
    - sections follow the preview-level slider;
    - non-inspectable results rendered disabled.
- **Dashboard sources:** `D/merchant-commerce-dialog.tsx:76-99, 361-425, 602-711`, `exchange-reward-tile.tsx`, `exchange-mark-controls.tsx`, `party-merchant-commerce-dialog.tsx:26-64`, `item-exchange-details.tsx`.
- **PWA files:** `P/screens/account/MerchantCommerceScreen.tsx:438-644`, `P/screens/itemdetail/ItemDetailBrowser.tsx:388-454`, `P/screens/itempanel/ItemActionPanel.tsx` (`exchangeReward` mode).
- **Endpoints:** `/command auto-item-mark {mode:'bank', action:'set'}`, `/command auto-upgrade-mark {slot:-1, tiers}`, `/command auto-exchange {slot:-1}`, `/merchant/auto-npc-sale {item}`, `/merchant/auto-stand {item, price}`.
- **Dependencies:** F5, I1 (banner port), F7 #30/#40, P0-01.

---

### Phase 9 — Events, dungeons, map

#### C4 — Events and anniversary (M)
- **Rows:** A100–A107, A109, A110.
- **Events:**
  - Per-character "Events (n)": a sorted checkbox per supported event, each with a schedule label (LIVE / next time with countdown / "Next chance" slot / "Time not announced" / "timing stale" / "Unsupported").
  - "Using {leader}'s events" inheritance, with checkboxes disabled for followers. The server 409s for followers.
- **Anniversary:**
  - Settings cog opens the Anniversary dialog:
    - live target, map, coords and expiry countdown; next round and depart times;
    - farming-return failsafe and return-dispatched status;
    - per-character ticket stage;
    - cake slices grid, complete sets, tradable native surplus;
    - auto-chat toggle (moved here from Settings);
    - chat advertisement: message preview, disabled when there is no message or one is already queued, "Queued for {merchant}";
    - colour-coded activity log.
- **Dashboard sources:** `D/event-selection-control.tsx`, `DL/event-policy.ts`, `anniversary-dialog.tsx`, `party-reference-panels.tsx:102-118`.
- **PWA files:** new `P/screens/character-detail/sections/EventsSection.tsx`, new `P/screens/account/AnniversaryScreen.tsx`, `P/screens/account/SettingsScreen.tsx:75-94` (move out), `P/api/partyApi.ts` (`setEventSelections(character, ids)` → `/formation {character, eventSelections}`).
- **Endpoints:** `POST /formation {character, eventSelections}`, `POST /dashboard-preferences {anniversaryAutoChat}`, `POST /anniversary/chat-advertise`; state `eventSchedules`, `eventSelectionsByCharacter`, `eventsByCharacter`, `anniversary`, diagnostics `anniversaryVisit/anniversaryState`.
- **Dependencies:** P0-01, P0-04, F2, F7 #16. The Cave row depends on C5.

#### C5 — Daily dungeons, Cave of Many Dreams (L)
- **Rows:** A111–A127.
- **Client and state:**
  - `GET /daily-dungeons` polled every 1 s while relevant.
  - `POST /daily-dungeons {action, …, operationId: crypto.randomUUID()}`. Every POST needs a unique `operationId` (`R/../dungeons/service.ts:278-280`).
- **Events popover Cave row:** Available now / Next entry countdown / unknown / checking.
- **Settings dialog:**
  - resume-server note, participants (offline marks), per-member eligibility errors, rule text;
  - "Don't leave the Cave for other events";
  - Enter now / Resume visit;
  - "Resume ordinary activity" (release).
- **Run panel:**
  - Exit with confirmation; Retry failed preparation; Return missing participants.
  - Floor, time remaining (with paused reason), shared gold, Amber, members.
  - Start/stop automatic exploration, with progress.
  - Priest recovery label and "Call Nera — revival choices".
  - Room/point move buttons (required / done / locked / different floor).
  - Encounter dialog: text, vote deadline, options with cost/Amber/unavailable, voter names, **paid-vote confirmation** (`confirmed:true`), result view.
  - Cave shop: inspect and buy with confirmation.
  - Full cave map with party pins, waypoint placement and a native-size toggle.
- **Party controls:** Escape becomes "Escape — exit dungeon" with `dungeon.actionError`.
- **Dashboard sources:** `D/dungeon-query.ts`, `dungeon-settings.tsx`, `dungeon-panel.tsx`, `cave-map.tsx`, `escape-control.tsx:10-64`, `RT/dungeons/service.ts`, `RT/dungeons/contracts.ts`.
- **PWA files:** new `P/screens/dungeon/DungeonScreen.tsx`, `DungeonSettingsSheet.tsx`, `EncounterSheet.tsx`, `CaveShopSheet.tsx`, `CaveMap.tsx`, `P/data/useDailyDungeon.ts`, `P/api/partyApi.ts` (`dailyDungeon(action, body)`), `P/screens/CharacterListScreen.tsx` (Escape label).
- **Dependencies:** F5, F7 #15/#19, C6 (map rendering for the cave map), C4 (Cave row host).

#### C6 — Live map (L)
- **Rows:** A158.
- **Scope:**
  - Generalise `P/data/useTargetMonsterType.ts` into a `useMapFrames(name)` hook.
  - Collapsible per-character canvas map at 20 fps: entities, HP bars, target-queue markers, "reconnecting" state.
  - Native-size dialog with names and hit/heal floaters.
  - Static map images via `GET /maps/:map?revision=` with a cache.
- **Dashboard sources:** `D/character-map-section.tsx`, `map-canvas.tsx` (504 lines), `map-render-buffer.ts`, `dreams-gate.ts`, `cached-map-image.tsx`, `doll-layers.tsx`, `query-cache.tsx:302-330`.
- **PWA files:** new `P/components/map/*`, `P/screens/character-detail/sections/MapSection.tsx`.
- **Endpoints:** `GET /party-api/map-stream/:character` (SSE), `GET /party-api/maps/:map`.
- **Dependencies:** F6. Mind mobile battery: render only while visible.

---

### Phase 10 — Reference, settings, logs

#### X1 — Bestiary and monster details (M)
- **Rows:** A489–A505.
- **Bestiary list:**
  - Tracktrix bonuses popover (newest active character), map filter chips, search, sort (threat, HP, attack, XP, range, name, Tracktrix score, score to next; asc/desc).
  - "Tracktrix data unavailable…" notice.
  - Card: threat, score/milestone, "High score: OWNER", "N / M achievements", "N score to next" / "All complete" / "Tracktrix required".
- **Unified MonsterDetail**, used from Bestiary, item drops, hunt blacklist and the character card:
  - `G.monsters.ID`;
  - Navigate to monster (opens FarmingAreaPicker with override; `tinyp` disabled);
  - achievements panel, recorded spawns with restriction reasons, definition grid;
  - drops via **`formatDropRate`**, which is already ported at `P/lib/itemFormulas.ts:434-443`; today's output is wrong, e.g. "1000000.0000%" for crabxx and "0.0000%" for goo. Drops keep server order and are tappable to item details;
  - zone and world drops.
- **Dashboard sources:** `D/bestiary-dialog.tsx`, `tracktrix-bonuses.tsx`, `monster-details-dialog.tsx`, `monster-achievement-progress.tsx`, `monster-spawns.tsx`, `definition-grid.tsx`, `bestiary-drops.tsx`, `indirect-bestiary-drops.tsx`, `drop-rate.ts`, `monster-achievements.ts`, `party-reference-panels.tsx:58-96`.
- **PWA files:** `P/screens/account/BestiaryScreen.tsx`, `P/screens/itemdetail/ItemDetailBrowser.tsx:456-497`, new `P/components/MonsterDetail.tsx`.
- **Endpoints:** `POST /navigate-to-monster {monsterId, location}`; state `bestiaryCatalog` (+`definition`, `range`), diagnostics `monsterAchievements`, `tracktrix`.
- **Dependencies:** F2, F5, F7 #44/#45/#48, C3 (picker override).
- **Quick win:** swap in `formatDropRate` at `BestiaryScreen.tsx:68` and `ItemDetailBrowser.tsx:489`. It can ship any time.

#### I9 — Equipment catalog and catalog comparison (M)
- **Rows:** A284–A294.
- **Catalog list:**
  - Equipment-only scope (`EQUIPMENT_TYPES`).
  - Search by name/id/set.
  - 25 sorts with the sorted stat shown on the tile.
  - Type chips; class chips + "Exclusive gear".
  - "N items · sorted by X · usable by…" / "Showing N of M".
  - Tile: type · T{tier} · set.
  - Inspect opens details with WTB.
  - Incremental rendering in 120-row batches.
- **Catalog comparison:**
  - Started from item details "From catalog" (A = selected item).
  - Add up to 3 items, selected chips, Compare selected / Cancel / Back to catalog.
  - Table: per-column level slider and stat-scroll select, delta and %, type/wtype/damage_type/ability rows, Remove.
- **Dashboard sources:** `D/equipment-catalog-dialog.tsx`, `party-equipment-catalog-dialog.tsx`, `catalog-comparison.tsx`.
- **PWA files:** `P/screens/account/CatalogScreen.tsx`, new `P/screens/account/CatalogComparisonScreen.tsx`.
- **Dependencies:** F7 #28/#29, M7 (WTB entry).

#### C9 — Skills reference (S)
- **Rows:** A166.
- **Scope:**
  - Search across class and skill, a sprite grid and the skill id.
  - Range label: Global / multiplier × attack range ± bonus / "+ character level" / Not specified.
  - Detail pane: "G.skills.id", explanation, range explainer, full definition grid.
- **Dashboard sources:** `D/skills-dialog.tsx`, `skill-range-label.tsx`.
- **PWA files:** `P/screens/account/SkillsScreen.tsx`.
- **Dependencies:** F7 #18/#48.

#### S2 — Settings and console management (L)
- **Rows:** A012, A056–A059, A062, A066–A070.
- **Dashboard state:**
  - Info block: canonical/local/Docker paths and help text.
  - Export (save picker, or download fallback).
  - Import: `.json`/`.jsonl` with a 128 MB guard; preview (characters, skipped characters with labelled fields, field list, backup notice); Import/Cancel with the `X-State-Preview` digest; success shows the backup path.
- **Account member grid:** live sprite/doll or saved `characterAppearances` ("Appearance saved after first connection"), name, class, live level, bankbois, padded to 8 dotted empty slots.
- **ALData:** auth-pending banner ("Waiting for mail delivery…") with a 15 s `/aldata/auth` poll until CORRECT.
- **Hosting:**
  - Require-pairing checkbox: disabled while busy or unknown, warning text, "This browser is authorized…" note, inline error.
  - "Load setup" link to `/setup`.
- **Console updates:** installed version, "New release available: X" + release notes, phase status, Check now, Download and install, Restart now, "Automatically download and install", development-checkout notice, error.
- **Debug instance:**
  - Cave of Many Dreams debug instance: Start / Stop / Open debug console, plus the inside-debug notice.
  - Debug-instance banner + "Open game client" (`/debug-game/vnc.html`).
  - On a debug instance, a debug-browser link replaces the session controls.
- **Dashboard sources:** `D/dashboard-state-import.tsx`, `settings-export.ts`, `state-export-button.tsx`, `account-settings.tsx`, `hosting-settings.tsx`, `console-updates.tsx`, `debug-instance.tsx`, `debug-browser.tsx`, `party-inventory-panels.tsx:449-528`, `use-party-console.tsx:181-229`.
- **PWA files:** `P/screens/account/SettingsScreen.tsx` (split into sections), `P/api/partyApi.ts` (`dashboardState*`, `consoleUpdate*`, `consoleDebug*` via `getRoot`/`postRoot`).
- **Endpoints:**
  - `GET /party-api/dashboard-state`, `/dashboard-state/export`; `POST /dashboard-state/preview` (text/plain), `/dashboard-state/import` (+`X-State-Preview`)
  - root `GET /console-update`, `POST /console-update/{check, download, restart, preferences}`
  - `GET /console-debug`, `POST /console-debug/{start, stop}`
  - `GET /setup/state`, `POST /setup/pairing`, `GET /party-api/aldata/auth`
- **Dependencies:** F3, F4, F7 #7/#8, B4 (Prepare mail composer).

#### S3 — Logs (M)
- **Rows:** A072–A079.
- **Scope:**
  - Game logs / Dashboard logs tabs, fetched at 1 s while visible.
  - Game-log category toggles (Kills off by default, Gold, Party, Items, Upgr., Errors, Info), persisted in `localStorage['party-log-filters']`.
  - Dashboard-log source select (All / Combat / Merchant-coordinator / Anniversary), including anniversary activity.
  - Character filter (live characters ∪ game-log names ∪ bankbois).
  - Status line: "Disconnected — showing retained logs" / "Character offline — showing retained logs" / "Live updates · latest 1,000 matching entries".
  - Rows: local time, `[name]`/`[source]`, colour (`e.color`), errors in red.
  - Chronological order, latest 1000, auto-follow scroll.
- **Dashboard sources:** `D/log-sidebar.tsx`, `RT/game-log-filters.ts`.
- **PWA files:** `P/screens/account/LogsScreen.tsx`.
- **Dependencies:** F7 #1, F8, F2 (`seenAt`).


---

## Appendix A — Full feature inventory

This table has one row per unique feature: **510 rows**, built from 553 audit rows plus 65 challenge gaps, with duplicates merged.

- **Final status** is the post-challenge verdict.
- **Package** is the single work package that owns the row. `-` means no work is needed (PRESENT, EXTRA or N/A).
- **Source rows** use these formats:
  - `NN-xx`: audit report NN, row xx.
  - `NN-ch …`: challenge NN.
  - `oos`: an out-of-slice observation.
- **EXTRA** rows are PWA-only features with no dashboard counterpart. They are kept for awareness but are not parity work.

| # | Domain | Feature | Final status | Package | Source rows |
|---|---|---|---|---|---|
| A001 | Shell & navigation | Title + 'Game vX · Console vY' version line | MISSING | S1 | 01-A1 |
| A002 | Shell & navigation | Console-update '!' indicator in header | MISSING | S1 | 01-A2 |
| A003 | Shell & navigation | Mail entry with unread count badge | PARTIAL | F4 | 01-A3, 06-#43 |
| A004 | Shell & navigation | Header entries Catalog/Bestiary/Skills/View market/Inspect bank | PRESENT | - | 01-A4, 06-#1, 06-#62, 06-#83, 05-K1 |
| A005 | Shell & navigation | Inspect stand · N/16 occupied-slot count (occupiedStandSlots) | BROKEN | M4 | 01-A5, 05-I1 |
| A006 | Shell & navigation | Logs entry | PRESENT | - | 01-A6 |
| A007 | Shell & navigation | Account screens reachable with no character online (home gear opens server override; AccountMenu only on character detail) | UNREACHABLE | F4 | 01-A7, 01-ch confirmed #2, 01-O8, 02-oos |
| A008 | Shell & navigation | Settings gear seeds realm destination + ALData key auto-reveal | PARTIAL | F4 | 01-A7 |
| A009 | Shell & navigation | /wtb, /routines, /hunt-settings reachable from account menu | PARTIAL | F4 | 01-O8, 05-L11 |
| A010 | Shell & navigation | Party gold: bank + combined total, active non-bankboi slots, '—' when unknown, exact tooltip | PARTIAL | S1 | 01-A8, 05-F1 |
| A011 | Shell & navigation | abbreviatedGold formatting (1.234m / 123.4K) | MISSING | S1 | 05-F2 |
| A012 | Shell & navigation | Debug-instance banner + 'Open game client' link | MISSING | S2 | 01-A9 |
| A013 | Shell & navigation | Session-expired screen with Reconnect on 401/403/redirect | BROKEN | P0-02 | 01-A10 (upgraded), 01-ch X1 |
| A014 | Shell & navigation | Account-switch detection resets caches (accountId) | MISSING | F8 | 01-A11 |
| A015 | Shell & navigation | Global render-error page with retry/reload (error boundary) | MISSING | F4 | 01-A12 |
| A016 | Shell & navigation | 'Couldn't complete action' error surface (toast equivalent) | PRESENT | - | 01-A13, 06-#95 |
| A017 | Shell & navigation | Workspace load/reconnecting/empty states + 'open setup' link | PARTIAL | S1 | 01-A14 |
| A018 | Shell & navigation | WebMCP document.modelContext tools | N/A | - | 01-A15 |
| A019 | Shell & navigation | DashboardModeControl / DashboardHealth (dead code) | N/A | - | 01-A16 |
| A020 | Live data layer | SSE /dashboard-stream snapshot/delta/heartbeat receiver | PRESENT | - | 01-B1, 01-M5 |
| A021 | Live data layer | Envelope validation (isSafeInteger(sequence), epoch string) | PARTIAL | P0-02 | 01-B2, 01-BROKEN-8 |
| A022 | Live data layer | Heartbeat watchdog + reconnect | PRESENT | - | 01-B3 |
| A023 | Live data layer | Fixed-length inventory from vitals.inventorySize | PRESENT | - | 01-B5 |
| A024 | Live data layer | Polling fallback (section=fast / section=inventory) while SSE unhealthy | MISSING | F8 | 01-B6 |
| A025 | Live data layer | Domain cadences (core 1s, config 15s, logs 1s, bank 2s, mail 2s, market 10s, catalog on referenceRevision) | PARTIAL | F8 | 01-B7 |
| A026 | Live data layer | Config domain GET /state?section=config fetched and merged | BROKEN | P0-01 | 01-B8, 02-ch M1, 04-B1, 05-BR-1, 05-ch X1, 06-ch M1 |
| A027 | Live data layer | Startup full GET /state parsed for roster only, config thrown away | BROKEN | P0-01 | 05-ch X2 |
| A028 | Live data layer | Roster kept fresh (from config, 15s) | BROKEN | P0-01 | 01-B9 |
| A029 | Live data layer | Bank section fetched with dashboard=1 (full bankboi records with items) | BROKEN | P0-01 | 01-M1 bank row, 01-O7, 04-ch M1, 06-ch M2 |
| A030 | Live data layer | characterDetails kept (diagnostics + presence), not reduced to monsterHunt | PARTIAL | F2 | 01-B10, 02-top4, 03-ch (e) |
| A031 | Live data layer | serverNow clock-skew reference | MISSING | F2 | 01-ch X7 |
| A032 | Live data layer | Poll loops survive non-JSON / redirected responses (unguarded JSON.parse kills polling) | BROKEN | P0-02 | 01-ch X1 |
| A033 | Live data layer | Live metrics (window.dashboardLiveMetrics) | N/A | - | 01-B12 |
| A034 | Live data layer | POST /aldata/refresh (no v1.2.0 caller) | N/A | - | 01-M1 |
| A035 | Live data layer | /steam/action headless-all (no UI caller) | N/A | - | 01-ch matrix |
| A036 | Roster & sessions | Character list = activeSlots order, bankbois excluded, primary→Steam→headless→merchant | PARTIAL | R1 | 01-C1 |
| A037 | Roster & sessions | Offline / reconnecting character keeps a card (removal nulls vitals only) | PARTIAL | R1 | 01-B4 |
| A038 | Roster & sessions | 'Load character slot N' buttons (disabled during Steam switch) | MISSING | R1 | 01-C2 |
| A039 | Roster & sessions | Roster picker (Headless/Steam toggle, hides active, 'Lv N class', empty text) | MISSING | R1 | 01-C3 |
| A040 | Roster & sessions | Spawn headless POST /slots/:slot/spawn | MISSING | R1 | 01-C4 |
| A041 | Roster & sessions | Login to Steam client POST /steam/action login | MISSING | R1 | 01-C5 |
| A042 | Roster & sessions | Slot 0 'Switch Steam character' (action primary) | MISSING | R1 | 01-C6 |
| A043 | Roster & sessions | Per-character session controls (Steam/headless/logout) with confirmation + stale guard | MISSING | R1 | 01-C7, 02-oos |
| A044 | Roster & sessions | Pending character cards (hosting kind, status labels, delayed help, error) | MISSING | R1 | 01-C9 |
| A045 | Roster & sessions | Create character dialog POST /roster/create {name,class,look} | MISSING | R1 | 01-C10 |
| A046 | Roster & sessions | Settings 'Create character' entry | MISSING | R1 | 01-D12 |
| A047 | Roster & sessions | 'Bankboi Active' card (bankboiTransaction) | MISSING | R1 | 01-C11 |
| A048 | Roster & sessions | Recover Steam handoff POST /steam/recover | MISSING | R1 | 01-D1 |
| A049 | Realm | Realm header: Current (currentRealm) / 'Mixed realms' / Home, with labels | PARTIAL | R2 | 01-D5, 01-ch #3 |
| A050 | Realm | Split-realm per-character list | MISSING | R2 | 01-D6 |
| A051 | Realm | Realm select: all realms '(N players)', PVP shown disabled | PARTIAL | R2 | 01-D7 |
| A052 | Realm | 'Change realm' disabled states + spinner | MISSING | R2 | 01-D8 |
| A053 | Realm | Realm operation progress panel | MISSING | R2 | 01-D9 |
| A054 | Realm | 'Switch realm?' confirmation with Realm Fatigue / Hop Sickness warnings, set-home only when not home | PARTIAL | P0-24 | 01-D10 |
| A055 | Realm | Realm switch request POST /realm/switch {realm,setHome} | PRESENT | - | 01-D11 |
| A056 | Settings & console | Dashboard state import/export info block (paths, help) | MISSING | S2 | 01-D2 |
| A057 | Settings & console | Export state file | MISSING | S2 | 01-D3 |
| A058 | Settings & console | Import state file (preview, X-State-Preview digest, backup notice) | MISSING | S2 | 01-D4 |
| A059 | Settings & console | Account member grid (portraits, bankbois, live level, 8 slot padding) | PARTIAL | S2 | 01-D13, 06-oos7 |
| A060 | Settings & console | Bankboi default name: seeded from server, trimmed, 3-11 validation, maxLength, Saved/error | BROKEN | P0-11 | 01-D14, 01-ch #6, 06-#41 (upgraded) |
| A061 | Settings & console | ALData status line Auth/Publish + Check status | PRESENT | - | 01-D15 (downgraded), 05-N1 |
| A062 | Settings & console | ALData auth-pending banner + 15s /aldata/auth poll | MISSING | S2 | 01-B11, 01-D15, 05-N4, 06-oos5 |
| A063 | Settings & console | ALData key Reveal / Copy | PRESENT | - | 01-D16, 05-N2 |
| A064 | Settings & console | ALData Generate key | PRESENT | - | 01-D17, 05-N2 |
| A065 | Settings & console | ALData help text + aldata.error | PRESENT | - | 01-D19, 05-N5 |
| A066 | Settings & console | Require secure pairing (disabled state, warning, authorized note, inline error) | PARTIAL | S2 | 01-D20 (endpoint OK per 01-ch) |
| A067 | Settings & console | 'Load setup' link to /setup | MISSING | S2 | 01-D21 |
| A068 | Settings & console | Console updates section (version, check, download, restart, automatic toggle) | MISSING | S2 | 01-D22 |
| A069 | Settings & console | Cave of Many Dreams debug instance controls | MISSING | S2 | 01-D23 |
| A070 | Settings & console | Debug-browser link replacing session controls | MISSING | S2 | 01-C8 |
| A071 | Settings & console | PWA-only extras (server-address override, anniversary send in Settings) | EXTRA | - | 01-D24 |
| A072 | Logs | Game logs / Dashboard logs tabs (1s) | PARTIAL | S3 | 01-E1 |
| A073 | Logs | Game-log category filters (persisted) | MISSING | S3 | 01-E2 |
| A074 | Logs | Dashboard-log source select | MISSING | S3 | 01-E3 |
| A075 | Logs | Anniversary activity in dashboard logs | MISSING | S3 | 01-E4 |
| A076 | Logs | Character filter | MISSING | S3 | 01-E5 |
| A077 | Logs | Status line (disconnected / character offline / live) | MISSING | S3 | 01-E6 |
| A078 | Logs | Row time, [name]/[source], colour, error red | PARTIAL | S3 | 01-E7 |
| A079 | Logs | Chronological latest 1000 + auto-follow | PARTIAL | S3 | 01-E8 |
| A080 | Logs | Resizable sidebar | N/A | - | 01-E13 |
| A081 | Character card | Portrait (doll HTML / sprite / skin) | MISSING | C1 | 02-#1 |
| A082 | Character card | Tracktrix badge on portrait | MISSING | C1 | 02-#2 |
| A083 | Character card | Character Stats dialog (formulas, 18 combat stats) | MISSING | C1 | 02-#3 |
| A084 | Character card | Online presence dot (seenAt < 10s) | MISSING | C1 | 02-#4 |
| A085 | Character card | Level / class / primary stat / realm line | PRESENT | - | 02-#5 |
| A086 | Character card | Per-character ping | MISSING | C1 | 02-#6 |
| A087 | Character card | XP meter | PRESENT | - | 02-#7 |
| A088 | Character card | BANKING / BANK QUEUED / STOCKING UP badges | PRESENT | - | 02-#8 |
| A089 | Character card | HP / MP meters | PRESENT | - | 02-#9 |
| A090 | Character card | Gold display (non-merchant) | PRESENT | - | 02-#10 |
| A091 | Character card | Map + coords line with cave relabel | PARTIAL | C1 | 02-#11 |
| A092 | Character card | 'Awaiting status' placeholder | PRESENT | - | 02-#12 |
| A093 | Character card | Active status section (count, collapse) | PARTIAL | C1 | 02-#13 |
| A094 | Character card | Status sprite, ticking countdown, bar, stacks | PARTIAL | C1 | 02-#14 |
| A095 | Character card | Condition details dialog | MISSING | C1 | 02-#15 |
| A096 | Character card | Statuses visible for merchant characters | UNREACHABLE | C1 | 02-#16 |
| A097 | Formation | Leader radio POST /formation {leader} only (PWA chip also sends follow:false, never selected) | BROKEN | P0-04 | 01-C12, 02-#18 (upgraded), 02-ch M9 |
| A098 | Formation | Follow toggle POST /formation {character,follow} (PWA sends leader:null every tap) | BROKEN | P0-04 | 01-BROKEN-2, 02-#19, 02-ch (d) |
| A099 | Formation | 'Following X' hint | PRESENT | - | 02-#20 |
| A100 | Events & anniversary | Per-character 'Events (n)' popover POST /formation {character,eventSelections} | MISSING | C4 | 02-#21, 01-O4 |
| A101 | Events & anniversary | Event schedule labels (LIVE / next / stale / unsupported) | MISSING | C4 | 02-#22 |
| A102 | Events & anniversary | 'Using {leader}'s events' inheritance | MISSING | C4 | 02-#23 |
| A103 | Events & anniversary | Anniversary settings cog → dialog | MISSING | C4 | 02-#24, 06-#98 |
| A104 | Events & anniversary | Anniversary live target / map / expiry / next round | MISSING | C4 | 02-#25 |
| A105 | Events & anniversary | Anniversary failsafe + return-dispatched status | MISSING | C4 | 02-#26 |
| A106 | Events & anniversary | Per-character ticket stage | MISSING | C4 | 02-#27 |
| A107 | Events & anniversary | Cake slices grid, complete sets, tradable surplus | MISSING | C4 | 02-#28 |
| A108 | Events & anniversary | Anniversary auto-chat toggle shows real state, can be turned off | BROKEN | P0-10 | 02-#29 (upgraded), 01-O3, 02-ch M10 |
| A109 | Events & anniversary | Chat advertisement preview, gating, 'Queued for {merchant}' | PARTIAL | C4 | 02-#30 |
| A110 | Events & anniversary | Anniversary activity log in dialog | MISSING | C4 | 02-#31 |
| A111 | Daily dungeons | Dungeon state polling GET /daily-dungeons (1s) | MISSING | C5 | 02-#32..46 |
| A112 | Daily dungeons | Cave row in Events popover with entry label | MISSING | C5 | 02-#32..46 |
| A113 | Daily dungeons | Cave settings dialog (participants, eligibility errors, rules) | MISSING | C5 | 02-#32..46 |
| A114 | Daily dungeons | 'Don't leave the Cave for other events' toggle (settings + operationId) | MISSING | C5 | 02-#32..46 |
| A115 | Daily dungeons | Enter now / Resume visit | MISSING | C5 | 02-#32..46 |
| A116 | Daily dungeons | Resume ordinary activity (release) | MISSING | C5 | 02-#32..46 |
| A117 | Daily dungeons | Exit dungeon with confirmation | MISSING | C5 | 02-#32..46 |
| A118 | Daily dungeons | Retry failed preparation | MISSING | C5 | 02-#32..46 |
| A119 | Daily dungeons | Return missing participants (recover) | MISSING | C5 | 02-#32..46 |
| A120 | Daily dungeons | Floor, time remaining, shared gold, Amber, members | MISSING | C5 | 02-#32..46 |
| A121 | Daily dungeons | Automatic exploration start/stop + progress | MISSING | C5 | 02-#32..46 |
| A122 | Daily dungeons | Priest recovery status + 'Call Nera' revival | MISSING | C5 | 02-#32..46 |
| A123 | Daily dungeons | Room/point move buttons | MISSING | C5 | 02-#32..46 |
| A124 | Daily dungeons | Encounter dialog with votes + paid-vote confirmation | MISSING | C5 | 02-#32..46 |
| A125 | Daily dungeons | Cave shop inspect + buy with confirmation | MISSING | C5 | 02-#32..46 |
| A126 | Daily dungeons | Cave full map with party pins, waypoint placement, native-size | MISSING | C5 | 02-#47, 06-#100 |
| A127 | Daily dungeons | Escape label 'Escape — exit dungeon' + dungeon actionError | PARTIAL | C5 | 01-C14 (downgraded), 02-#48 (downgraded), 01-ch X6 |
| A128 | Farming & hunt | Farming mode selector shows saved mode (always 'Auto' today) | BROKEN | P0-01 | 02-#49 (upgraded) |
| A129 | Farming & hunt | Badge 'Copy leader' / policy · live effective mode; correct per-character copy | PARTIAL | C2 | 02-#50 |
| A130 | Farming & hunt | Hunt backup setup (monster + area) on backup_required | PRESENT | - | 02-#51 |
| A131 | Farming & hunt | Active farming zone + message (null because legacy=leader check) | BROKEN | P0-01 | 02-#52 (upgraded) |
| A132 | Farming & hunt | Hunt status block (status / last status / preparing) | BROKEN | C2 | 02-#53 (upgraded) |
| A133 | Farming & hunt | Hunt backup batch countdown + per-member state | MISSING | C2 | 02-#54 |
| A134 | Farming & hunt | Quest owner + 'Events wait until Daisy reward claims finish' | BROKEN | C2 | 02-#55 (upgraded) |
| A135 | Farming & hunt | My quest incl. 'Blacklisted — skipped for Hunt' | PARTIAL | C2 | 02-#56 (downgraded) |
| A136 | Farming & hunt | Farming settings dialog owner title, disabled when inherited | BROKEN | P0-07 | 02-#57 |
| A137 | Farming & hunt | Hunt settings scoped to character, seeded from farmingProfiles[owner], Save not destructive | BROKEN | P0-07 | 01-ch M1 /hunt-settings, 01-ch X2, 02-#58, 02-ch M4 |
| A138 | Farming & hunt | Hunt blacklist list scoped to character (sprite, label, date, remove) | BROKEN | P0-07 | 01-ch /hunt-blacklist, 02-#60 |
| A139 | Farming & hunt | Hunt blacklist Clear all with confirmation (correct owner) | BROKEN | P0-07 | 02-#61 |
| A140 | Farming & hunt | Hunt blacklist labels via huntBlacklistLabel + click → monster details | MISSING | C2 | 02-#60 note, 02-#63 |
| A141 | Farming & hunt | Add to Hunt blacklist (searchable picker) | MISSING | C2 | 01-ch X3, 02-#62 |
| A142 | Farming & hunt | Preferred hunt spawns per monster | MISSING | C2 | 01-ch X4, 02-#59 |
| A143 | Farming & hunt | Passive hunting: field generators toggle POST /rare-hunting | MISSING | C2 | 02-#64 |
| A144 | Farming & hunt | Passive hunting rules table | MISSING | C2 | 02-#65 |
| A145 | Farming & hunt | Combat recovery prop (not rendered by dashboard) | N/A | - | 02-#66 |
| A146 | Focus & routing | Monster focus picker: 'All' toggle, monsterChoices source, auto-save, empty → [] | BROKEN | P0-08 | 02-#67, 02-ch (c), 02-ch M2 |
| A147 | Focus & routing | Focus/radius form seeded with real values (every save replaces real focus today) | BROKEN | P0-08 | 02-ch M3 |
| A148 | Focus & routing | Clear all focus (X) | MISSING | P0-08 | 02-#68 |
| A149 | Focus & routing | Fairy (tinyp) shown disabled with explanation | BROKEN | P0-08 | 02-#70 |
| A150 | Focus & routing | Monster search radius (1-10000 validation, no silent reset to 400) | BROKEN | P0-08 | 02-#72 (upgraded), 01-ch radius note |
| A151 | Focus & routing | Per-monster target priority (monsterPriorities) | MISSING | C3 | 02-#69, 01-O4 |
| A152 | Focus & routing | Focus display: explicit empty per-character focus kept | PARTIAL | C3 | 02-#71 |
| A153 | Focus & routing | Focus header shows effective radius | MISSING | C3 | 02-ch M8 |
| A154 | Focus & routing | Radius context/help text | PARTIAL | C3 | 02-#72 notes |
| A155 | Focus & routing | 'Find selected monster' disabled for followers | PARTIAL | C3 | 02-#73 (downgraded) |
| A156 | Focus & routing | Leader uses party-monster-travel convoy (isLeader always false today) | BROKEN | P0-01 | 02-#74 (upgraded), 02-ch M5 |
| A157 | Focus & routing | Farming-area picker: waypoint pref, map preview/enlarge, legend, MonsterSpawns fallback, label field, monsterChoices list | PARTIAL | C3 | 02-#74, 02-#51 note, 02-B6 |
| A158 | Map | Live character map (canvas from /map-stream, /maps/:map, native-size dialog) | MISSING | C6 | 02-#76, 01-M1 maps |
| A159 | Travel & party actions | Send character to… (known area or exact map/X/Y, validation, error) | PARTIAL | C7 | 01-C16, 02-#77, 03-#75 (downgraded), 03-ch M3 |
| A160 | Travel & party actions | Return to leader (hidden on leader, disabled when leader offline, error shown) | BROKEN | C7 | 02-#78 (upgraded), 03-#74 |
| A161 | Travel & party actions | Go home (merchant) sends cmd go-home (PWA sends character-travel main 0,0) | BROKEN | P0-23 | 02-#79, 03-#73, 03-B5 |
| A162 | Travel & party actions | Send party to town (result surfaced) | PARTIAL | C7 | 01-C13, 02-#80 (downgraded), 02-ch M7 |
| A163 | Travel & party actions | Escape status polling cadence (1s) + spinner/labels | PARTIAL | C7 | 02-#81 |
| A164 | Travel & party actions | Error surfacing for travel / go-home / return-leader | MISSING | C7 | 03-ch M4 |
| A165 | Travel & party actions | Merchant map-travel list labelled 'Send merchant to…' (PWA-only) | EXTRA | - | 03-ch M5 |
| A166 | Skills | Skills dialog: search, sprites, id, range label, definition grid | PARTIAL | C9 | 02-#83, 06-#97 |
| A167 | Combat log | Per-character combat log on character screen (collapsible, colours, last 50, count) | PARTIAL | C8 | 01-E9, 02-ch M6 |
| A168 | Combat log | Combat log 'Clear history' POST /combat-log/:character/clear | MISSING | C8 | 01-E10 |
| A169 | Inventory grid | Inventory grid one tile per slot | PRESENT | - | 03-#1 |
| A170 | Inventory grid | Capacity counter occupied/total coloured | MISSING | I1 | 03-#2 |
| A171 | Inventory grid | Collapsible Inventory header | MISSING | I1 | 03-#3 |
| A172 | Inventory grid | Non-merchant compacted order (layout difference) | PRESENT | - | 03-#4, 04-oos4 |
| A173 | Inventory grid | +level label only when > 0 | PARTIAL | I1 | 03-#5 |
| A174 | Inventory grid | Coloured stat_type badge | MISSING | I1 | 03-#6 |
| A175 | Inventory grid | Quantity badge | PRESENT | - | 03-#7 |
| A176 | Inventory grid | Merchant's Luck clover (item.m) | MISSING | I1 | 03-#8 |
| A177 | Inventory grid | In-progress upgrade/compound overlay (from→to, chance) | MISSING | I1 | 03-#9 |
| A178 | Inventory grid | Action banner priority/variants (item-action-banner port) | PARTIAL | I1 | 03-#10 |
| A179 | Inventory grid | Banner tooltip (NPC sale state/error/retry, conflicts) | MISSING | I1 | 03-#11 |
| A180 | Inventory grid | Tile border coloured by banner | PARTIAL | I1 | 03-#12 |
| A181 | Inventory grid | Merchant hover/long-press tooltip (suggested price, decon, NPC state) | MISSING | I1 | 03-#13 |
| A182 | Inventory grid | 'Loading inventory…' state | PARTIAL | I1 | 03-#15 |
| A183 | Inventory grid | Tap opens item details | PRESENT | - | 03-#16 |
| A184 | Inventory grid | Tile sprite fallback to name / live meta.sprite | PARTIAL | I1 | 03-ch M11 |
| A185 | Inventory grid | Inventory upgrade banner '+L → +T' | BROKEN | P0-01 | 04-#8 |
| A186 | Inventory grid | Compound group banner | BROKEN | P0-01 | 04-#28 |
| A187 | Inventory grid | Stat scroll banner | BROKEN | P0-01 | 04-#38 |
| A188 | Inventory grid | Auto compound pending banner | MISSING | I1 | 04-#30 |
| A189 | Inventory grid | Auto exchange banner | MISSING | I1 | 04-#57 |
| A190 | Inventory grid | Auto stand banner on inventory tiles | MISSING | I1 | 05-J7 |
| A191 | Item menu | Equip only for equipment | PARTIAL | I2 | 03-#17 |
| A192 | Item menu | Use / 'Use elixir' only when usable | PARTIAL | I2 | 03-#18 |
| A193 | Item menu | Compare with equipped | PRESENT | - | 03-#19 |
| A194 | Item menu | Compare slot submenu (Main/Off hand, Ring/Earring 1/2 with equipped name) | MISSING | I2 | 03-#20 |
| A195 | Item menu | Deliver to… targets online, not self, no bankbois | PARTIAL | I2 | 03-#21 |
| A196 | Item menu | Deliver merchant+equipment Don't equip / Equip | PRESENT | - | 03-#22 |
| A197 | Item menu | Stat scroll submenu (costs, owned/required, wiring) | PRESENT | - | 03-#23, 04-#36 |
| A198 | Item menu | Stat scroll pending-mark trigger label | PARTIAL | U2 | 03-#23, 04-#37 |
| A199 | Item menu | Auto exchange row disabled when marked (server toggle silently removes rule) | BROKEN | P0-17 | 03-#24, 04-#56, 04-ch (a) |
| A200 | Item menu | Mark for bank disabled once marked | PARTIAL | I2 | 03-#25 |
| A201 | Item menu | Auto mark for bank (only with merchant, disabled once set) | PARTIAL | I2 | 03-#26 (downgraded) |
| A202 | Item menu | Mark for stand / Edit stand listing (defaults, 16/16 guard, never shrink qty) | BROKEN | P0-14 | 03-#27, 03-B3, 03-ch M10 |
| A203 | Item menu | Auto mark for stand price default (empty → price 0 → 400) | PARTIAL | P0-14 | 03-#28 |
| A204 | Item menu | Mark for upgrade tier submenu with '· N tiers' | PARTIAL | U2 | 03-#29, 04-#1 |
| A205 | Item menu | Auto mark for upgrade (current tier disabled, label) | PARTIAL | U2 | 03-#31, 04-#13 |
| A206 | Item menu | Buy another level 0 | PRESENT | - | 03-#33, 04-#6 |
| A207 | Item menu | Mark for compounding hidden when grouped | PARTIAL | U2 | 03-#34, 04-#27 |
| A208 | Item menu | Auto compound submenu label 'to +N', hidden when level ≥ min(7,max) | PARTIAL | U2 | 03-#35 (downgraded), 04-#29 |
| A209 | Item menu | Auto compound target capped at 7 (else command falls through) | BROKEN | P0-25 | 04-ch row 29, 04-ch M7 |
| A210 | Item menu | Mark for merchant (non-merchant only, disabled once marked) | PARTIAL | I2 | 03-#36 |
| A211 | Item menu | Auto mark for merchant (non-merchant only) | PARTIAL | I2 | 03-#37 |
| A212 | Item menu | Clear all marks conditional + tooltip (inventory) | PARTIAL | I2 | 03-#43 (downgraded), 03-ch M12 |
| A213 | Item menu | Clear marks also removes auto-exchange rule | PRESENT | - | 04-#60 |
| A214 | Item menu | Merchant weapon banner | MISSING | I2 | 03-#44 |
| A215 | Item menu | Actions hidden when no merchant configured (auto-bank, Sell NPC, auto NPC, compound, exchange, stand) | PARTIAL | I2 | 03-ch M6 |
| A216 | Item menu | Auto-deconstruct / auto-bank disabled when rule exists | MISSING | I2 | 03-ch M7 |
| A217 | Item menu | 'Update auto sell to NPC…' / 'Update auto mark for stand…' labels | MISSING | I2 | 03-ch M8 |
| A218 | Deconstruction | Mark for deconstruction gated by deconstructionCatalog | PARTIAL | I3 | 03-#38 |
| A219 | Deconstruction | Deconstruction confirmation dialog (rewards %, cost, titles) | MISSING | I3 | 03-#39 |
| A220 | Deconstruction | Auto mark for deconstruction with confirmation | PARTIAL | I3 | 03-#40 |
| A221 | Deconstruction | Pending deconstruction marks list with Retry / remove by id | MISSING | I3 | 03-#59 |
| A222 | Deconstruction | Bank 'Mark for deconstruction' confirmation (+ unreachable until config) | BROKEN | I3 | 06-#16 (upgraded) |
| A223 | NPC sale | Sell to NPC… quantity sheet defaulting to stack, proceeds, ack (character + merchant) | BROKEN | P0-15 | 01-F4, 03-#41, 03-B2 |
| A224 | NPC sale | Bank Sell to NPC dialog (editable qty, always confirm) | PARTIAL | P0-15 | 06-#18 |
| A225 | NPC sale | Auto sell to NPC on merchant omits character (else dead rule + wipes other rules) | BROKEN | P0-16 | 03-#42, 03-B1, 03-ch M2 |
| A226 | NPC sale | Remove auto-NPC rule from merchant list (no character) | BROKEN | P0-16 | 03-#69 |
| A227 | NPC sale | Automatic NPC-sale confirmation dialog ('You will receive Xg') | PARTIAL | I4 | 01-F3 |
| A228 | NPC sale | Auto NPC sales list incl. manual npcSaleMarks (owner, qty, state, error) | PARTIAL | I4 | 03-#57 |
| A229 | NPC sale | Remove manual NPC-sale mark by id | MISSING | I4 | 03-#58 |
| A230 | Equipment | Equipment excludes trade* stand slots (Unequip pulls listing off stand) | BROKEN | P0-13 | 03-#45, 03-B4, 03-ch M1 |
| A231 | Equipment | All 15 fixed slots with 'Empty' tiles | PARTIAL | I5 | 03-#46 (mostly missing) |
| A232 | Equipment | Slot labels ('Earring 1') | PARTIAL | I5 | 03-#47 |
| A233 | Equipment | Level / stat_type / mluck badges on equipped | PARTIAL | I5 | 03-#48 |
| A234 | Equipment | Set progress badge | MISSING | I5 | 03-#49 |
| A235 | Equipment | Equipment upgrade/stat banner | BROKEN | P0-01 | 03-#50, 04-#9 |
| A236 | Equipment | Equipped stat-scroll banner (statScrolls passed as []) | MISSING | I5 | 04-#39 |
| A237 | Equipment | Unequip (not elixir) | PRESENT | - | 03-#51 |
| A238 | Equipment | Elixir disabled 'Active elixir effect' | PARTIAL | I5 | 03-#52 |
| A239 | Equipment | Equipped Mark for upgrade (labels, offering rows) | PARTIAL | U2 | 03-#53, 04-#2, 03-ch M9 |
| A240 | Equipment | Equipped Auto mark for upgrade | PARTIAL | U2 | 04-#14 |
| A241 | Equipment | Clear all marks on equipped (conditional) | PARTIAL | I2 | 03-#54 (downgraded) |
| A242 | Equipment | Click equipped opens details | PRESENT | - | 03-#55 |
| A243 | Equipment | Equipped 'Buy copy' (dashboard never offers) | EXTRA | - | 03-#56, 04-#7 |
| A244 | Auto-rule lists | Auto deconstruction rules scoped to ruleOwner (shared rules) | PARTIAL | F1 | 03-#60, 04-oos5 |
| A245 | Auto-rule lists | Auto stand marks list + remove | PRESENT | - | 03-#61, 05-J8 |
| A246 | Auto-rule lists | Auto upgrades list (all owners, '+a → +b', owner, count) | BROKEN | I8 | 03-#62, 04-#16 |
| A247 | Auto-rule lists | Edit auto-upgrade target tiers | MISSING | I8 | 03-#63, 04-#17 |
| A248 | Auto-rule lists | Edit auto-upgrade remaining quantity (∞ / Completed) | MISSING | I8 | 03-#63, 04-#18 |
| A249 | Auto-rule lists | Remove one auto-upgrade rule with confirm + error | PARTIAL | I8 | 04-#19, 03-#68 |
| A250 | Auto-rule lists | Clear all auto upgrades (button hidden: list empty) | BROKEN | P0-01 | 04-#20 |
| A251 | Auto-rule lists | Auto compounds list (owner, target, qty) | BROKEN | I8 | 04-#31 |
| A252 | Auto-rule lists | Edit auto-compound target (1-7) | MISSING | I8 | 03-#64, 04-#32 |
| A253 | Auto-rule lists | Edit auto-compound quantity | MISSING | I8 | 03-#64, 04-#33 |
| A254 | Auto-rule lists | Remove auto compound | PRESENT | - | 04-#34 |
| A255 | Auto-rule lists | Clear all auto compounds | BROKEN | P0-01 | 04-#35 |
| A256 | Auto-rule lists | Auto merchant marks list | PRESENT | - | 03-#65 |
| A257 | Auto-rule lists | Auto bank marks scoped to ruleOwner | PARTIAL | F1 | 03-#66 |
| A258 | Auto-rule lists | Per-section Clear all with confirmation | PRESENT | - | 03-#67 |
| A259 | Auto-rule lists | AutoMarksSection remove/clear surfaces errors | MISSING | I8 | 04-oos7 |
| A260 | Item details | Header sprite/name/'character · slot N' | PRESENT | - | 03-#76 |
| A261 | Item details | 'Add to stand' from details (stand-full guard) | PARTIAL | I6 | 03-#77 |
| A262 | Item details | 'Add to WTB' from details with preview level | PARTIAL | I6 | 03-#78 |
| A263 | Item details | Tracktrix bonuses for tracker/supercomputer | MISSING | I6 | 03-#79 |
| A264 | Item details | Explanation text | PRESENT | - | 03-#80 |
| A265 | Item details | Buy from / Sell to NPC values | PRESENT | - | 03-#81 |
| A266 | Item details | Eligible classes + hands-required line | PARTIAL | I6 | 03-#82 |
| A267 | Item details | Level stat preview slider | PRESENT | - | 03-#83 |
| A268 | Item details | Compare popover: any party character → slot | MISSING | I6 | 03-#84 |
| A269 | Item details | Stats grid ranking, equip_slot row, hide type | PARTIAL | I6 | 03-#86 |
| A270 | Item details | propertiesAtLevel semantics (keep server-only properties) | PARTIAL | I6 | 04-#70 |
| A271 | Item details | Set bonus with clickable pieces | PRESENT | - | 03-#87 |
| A272 | Item details | Ingredient in | PRESENT | - | 03-#88 |
| A273 | Item details | Craftable | PRESENT | - | 03-#89 |
| A274 | Item details | Monster drops Sort select (Name/Percentage) | PARTIAL | I6 | 03-#92 |
| A275 | Item details | Back-navigation trail | PRESENT | - | 03-#94 |
| A276 | Item details | Live-instance meta merged over catalog meta | PARTIAL | I6 | 03-#95 |
| A277 | Gear comparison | Open from 'Compare with equipped' | PRESENT | - | 03-#96, 06-#99 |
| A278 | Gear comparison | Full character projection (HP…Output) with deltas | PARTIAL | I7 | 03-#97 |
| A279 | Gear comparison | Character doll image | MISSING | I7 | 03-#98 |
| A280 | Gear comparison | Set changes section (GAINED/LOST) | MISSING | I7 | 03-#99 |
| A281 | Gear comparison | Stat-scroll preview per side | PRESENT | - | 03-#100 |
| A282 | Gear comparison | Independent preview-level sliders | PRESENT | - | 03-#101 |
| A283 | Catalog | Catalog reachable | PRESENT | - | 03-#102, 06-#83 |
| A284 | Catalog | Equipment-only scope | PARTIAL | I9 | 03-#103, 06-#84 |
| A285 | Catalog | Search name/id/set | PARTIAL | I9 | 03-#104, 06-#85 |
| A286 | Catalog | Sort (25) + sorted stat value | MISSING | I9 | 03-#105, 06-#86 |
| A287 | Catalog | Type filter chips | MISSING | I9 | 03-#106, 06-#87 |
| A288 | Catalog | Class filter chips + 'Exclusive gear' | MISSING | I9 | 03-#107, 06-#88 |
| A289 | Catalog | Result count / sorted-by line | MISSING | I9 | 03-#108, 06-#89 |
| A290 | Catalog | Tile type · T{tier} · set · stat | PARTIAL | I9 | 03-#109, 06-#90 |
| A291 | Catalog | Inspect → details with WTB action | PARTIAL | I9 | 03-#110, 06-#91 |
| A292 | Catalog | Incremental rendering (120-row batches) | MISSING | I9 | 06-#92 |
| A293 | Catalog | Catalog comparison mode (A + ≤3, from details 'From catalog') | MISSING | I9 | 03-#85, 03-#111, 04-#71, 06-#93 |
| A294 | Catalog | Catalog comparison table (level sliders, stat scroll, deltas, abilities) | MISSING | I9 | 03-#111, 06-#94 |
| A295 | Upgrades & offerings | Upgrade with Primling/Essence/Primordial + confirm (inventory & equipped) | MISSING | U1 | 03-#30, 04-#3 |
| A296 | Upgrades & offerings | Offering stock state (upgradeOfferingStock) | MISSING | U1 | 04-#4 |
| A297 | Upgrades & offerings | Server upgrade preview panel POST /upgrade-preview (+Refresh, 2s poll) | MISSING | U1 | 04-#5, 01-M1 |
| A298 | Upgrades & offerings | 'Add upgrade rule' from item (prefilled) | MISSING | U1 | 03-#32, 04-#15 |
| A299 | Upgrades & offerings | Upgrade offering rules list | PRESENT | - | 03-#70, 04-#21 |
| A300 | Upgrades & offerings | Edit offering rule | PRESENT | - | 04-#22 |
| A301 | Upgrades & offerings | Remove offering rule | PRESENT | - | 04-#23 |
| A302 | Upgrades & offerings | Clear all offering rules (two-click) | MISSING | U1 | 04-#24 |
| A303 | Upgrades & offerings | Add offering rule dialog: overlap / ceiling validation, from item | PARTIAL | U1 | 04-#25 |
| A304 | Lucky slot | Lucky slot summary | PRESENT | - | 04-#40 |
| A305 | Lucky slot | Lucky statistics dialog counts + explanatory text | PARTIAL | U3 | 04-#41 |
| A306 | Lucky slot | Lucky slot outline in merchant grid + menu | MISSING | U3 | 03-#14, 04-#42 |
| A307 | Lucky slot | Merge live local evidence stream | PARTIAL | U3 | 04-#43 |
| A308 | Lucky slot | Verified-slot validation | PRESENT | - | 04-#44 |
| A309 | Exchange | Exchange catalog search + owned/required + Add | PRESENT | - | 04-#45, 05-H10 |
| A310 | Exchange | Owned counts include bankboi storage (exchange + craft) | BROKEN | M10 | 04-#46 (fix corrected), 05-H8 |
| A311 | Exchange | Currency grouping / Choose / choices panel | PRESENT | - | 04-#47, 05-H10 |
| A312 | Exchange | Exchange cart + Exchange all POST /merchant/exchange-order | PRESENT | - | 04-#48, 05-H11 |
| A313 | Exchange | 409 missing-materials detail (exchange + order) | PARTIAL | M10 | 04-#49, 05-H9 |
| A314 | Exchange | Exchange rules overlay (gear, 'N required per exchange', potential results) | PARTIAL | M11 | 04-#50 (downgraded), 05-H12 |
| A315 | Exchange | Tap exchange tile → item details with 'Add' | MISSING | M11 | 04-#51, 05-H14, 03-ch M14 |
| A316 | Exchange | Nested exchange drill-down | MISSING | M11 | 04-#52 |
| A317 | Exchange | 'Mark multiple' bulk staging (bank/stand/upgrade/npc) | MISSING | M11 | 04-#53, 05-H13 |
| A318 | Exchange | Reward-tile banners | MISSING | M11 | 04-#54 |
| A319 | Exchange | Reward-tile automatic-action context menu | MISSING | M11 | 03-#91, 04-#55 |
| A320 | Exchange | Item details 'Exchange price' | PRESENT | - | 04-#61 |
| A321 | Exchange | Item details fixed reward opens the reward (navigates to itself today) | BROKEN | M11 | 04-#62 |
| A322 | Exchange | Item details table rewards with chance | PRESENT | - | 04-#63 |
| A323 | Exchange | 'Reward in' sources | PRESENT | - | 04-#64 |
| A324 | Exchange | 'Rewards' heading for boxes, cosmo/sixcake notes | PARTIAL | M11 | 03-#90, 04-#65 |
| A325 | Exchange | Exchange sections follow preview level | PARTIAL | M11 | 04-#66 |
| A326 | Commerce | Buy/Craft/Exchange buttons | PRESENT | - | 05-C1 |
| A327 | Commerce | Buy catalog search + Add | PRESENT | - | 05-H1 |
| A328 | Commerce | Buy cart qty ≤ 9999, target +level | PARTIAL | M10 | 05-H2 |
| A329 | Commerce | Buy cart target level for upgradeables | PRESENT | - | 04-#68 |
| A330 | Commerce | 90% budget line + 'Gold (est)' via upgradeEstimate | MISSING | M10 | 04-#69, 05-H3 |
| A331 | Commerce | Buy submit POST /merchant/order | PRESENT | - | 05-H4 |
| A332 | Commerce | Craft list + ingredient totals | PRESENT | - | 05-H5 |
| A333 | Commerce | Craft gold total incl. ingredient purchases | MISSING | M10 | 05-H6 |
| A334 | Commerce | Recipe preview (per-material owned/missing/buy) | MISSING | M10 | 05-H7 |
| A335 | Merchant card & queue | Collapsible 'Merchant logistics · N queued' + 'No queued work' | PARTIAL | M1 | 05-A1, 05-ch X7 |
| A336 | Merchant card & queue | Human job labels (merchantJobLabel + routineFor) | PARTIAL | M1 | 05-A2, 04-ch M4 |
| A337 | Merchant card & queue | Priority prefix P{n} | MISSING | M1 | 05-A3 |
| A338 | Merchant card & queue | Target suffix (suppressed for giveaway) | PARTIAL | M1 | 05-A4 (downgraded) |
| A339 | Merchant card & queue | Status column: deferred reason, phase, retryAt, pauseReason | PARTIAL | M1 | 05-A5, 04-ch oos |
| A340 | Merchant card & queue | Retry only when realmRetryExhausted | PARTIAL | M1 | 05-A6 (downgraded), 04-ch oos |
| A341 | Merchant card & queue | Cancel: confirm for automatic routines, hidden for fishing/mining/current, 'undo pending intent' hint | BROKEN | P0-22 | 04-#59, 04-ch M2, 04-ch M3, 05-A7, 05-BR-7 |
| A342 | Merchant card & queue | Merchant's Luck upkeep row | MISSING | M1 | 05-A8 |
| A343 | Merchant card & queue | Current job first | PRESENT | - | 05-A9 |
| A344 | Merchant card & queue | Activity log: time, level colour, details | PARTIAL | M1 | 01-E11, 05-B1 |
| A345 | Merchant card & queue | Clear stale orders shows removed counts | PARTIAL | M1 | 05-B2, 01-O5 |
| A346 | Merchant card & queue | Clear history | PRESENT | - | 01-E12, 05-B3 |
| A347 | Merchant card & queue | Cleanup / clear-history inline result text | PARTIAL | M1 | 05-ch X6 |
| A348 | Merchant card & queue | Donate gold with XP preview + description + inline error | PARTIAL | M1 | 05-C2, 06-#96 |
| A349 | Merchant card & queue | Join giveaway: realm Select + online-player picker | PARTIAL | M1 | 01-F1, 05-C3 |
| A350 | Merchant card & queue | Send to party group picker (/bank-party {group}) | PARTIAL | M1 | 05-C4 |
| A351 | Merchant card & queue | Force stand toggle reflects server state (can't be turned off today) | BROKEN | P0-10 | 05-C5 (upgraded), 01-O1, 05-ch X4 |
| A352 | Merchant card & queue | Routines button | PRESENT | - | 05-C6 |
| A353 | Merchant card & queue | Mining/Fishing toggles | PRESENT | - | 05-C7 |
| A354 | Merchant card & queue | Mining/Fishing readiness (Ready / cooldown / No tool) | MISSING | M1 | 05-C8 |
| A355 | Merchant card & queue | Clear job queue | PRESENT | - | 05-C9 |
| A356 | Merchant card & queue | 'Send merchant to…' manual visit (/command {character:target,type:'bank'}) | MISSING | M1 | 03-#72, 03-B6, 05-C10 |
| A357 | Merchant card & queue | Gold target 'Exchange gold and items with bank' (cmd bank) | PARTIAL | M1 | 02-#82, 05-F3 |
| A358 | Merchant card & queue | Gold target offered for every character (dashboard: merchant only) | EXTRA | - | 02-ch M11, 05-oos5 |
| A359 | Merchant card & queue | Hardcoded Patinder 'Clear stuck production attempt' button | BROKEN | P0-21 | 01-ch X5, 04-#73, 04-ch (e), 05-oos3 |
| A360 | Routines | Routine label set incl. deliveries, withdrawals, upgrade preview, manual/automatic exchange (no 'exchange') | BROKEN | P0-06 | 04-#58, 04-#72, 05-D1, 06-#24 label |
| A361 | Routines | Enable checkboxes: automatic keys + fishing/mining seeded from gatheringModes | BROKEN | P0-06 | 05-D2, 05-BR-2 |
| A362 | Routines | Seed draft from server (Save posts 50 / true for everything today) | BROKEN | P0-06 | 01-F5, 05-D3, 04-ch (b) |
| A363 | Routines | Deliveries/withdrawals rows disabled + priority dropped when trip off | MISSING | P0-06 | 05-D5 |
| A364 | Routines | Save body POST /merchant/routine-priorities | PARTIAL | P0-06 | 05-D8 |
| A365 | Routines | Seed on open only (no late overwrite of edits) | PARTIAL | P0-06 | 05-ch X8 |
| A366 | Routines | Header 'N/M enabled' | PARTIAL | M3 | 05-D4 |
| A367 | Routines | Priority input 0-100 | PRESENT | - | 05-D6 |
| A368 | Routines | Reorder skips disabled routines | PARTIAL | M3 | 05-D7 |
| A369 | Merchant settings | Settings entry/sheet | PARTIAL | M2 | 05-E1 |
| A370 | Merchant settings | Bank sort 'Sort on next visit' + status | PRESENT | - | 06-#22 |
| A371 | Merchant settings | Bank sorting mode radio | PRESENT | - | 05-E2, 06-#23 |
| A372 | Merchant settings | Bank sort help text + error display | PARTIAL | M2 | 06-#22 note, 06-ch M12 |
| A373 | Merchant settings | Maximum number to buy at once (buyUpgradeBatchSize) | MISSING | M2 | 01-O5, 04-#67, 05-E3 |
| A374 | Merchant settings | Merchant stand location X/Y | MISSING | M2 | 05-E4 |
| A375 | Merchant settings | Marked deliveries create merchant jobs | MISSING | M2 | 05-E5 |
| A376 | Merchant settings | Marked withdrawals create merchant jobs | MISSING | M2 | 05-E6, 06-#24 |
| A377 | Merchant settings | Gold collection threshold seeded/validated (writes threshold:0 today) | BROKEN | P0-12 | 01-F6, 01-ch #8, 05-E7 |
| A378 | Merchant settings | Item collection threshold 1-42 seeded/validated | BROKEN | P0-12 | 01-F6, 05-E8 |
| A379 | Merchant settings | Collection settings explanatory text + inline errors | PARTIAL | M2 | 05-E7, 05-E8 |
| A380 | Restock | Restock HP/MP min/max (defaults 5/20/0/0, no zeroing of untouched fields) | BROKEN | P0-09 | 05-G1 (upgraded), 05-ch X3 |
| A381 | Stand | 'Items for sale · N/16' + Stand open/closed | MISSING | M4 | 05-I2 |
| A382 | Stand | Sale rows reconciled vs trade slots (Live/Paused/Queued, unmanaged rows) | MISSING | M4 | 05-I3 |
| A383 | Stand | Sale tile badges (sprite, level, stat, clover, qty) | PARTIAL | M4 | 05-I4 |
| A384 | Stand | Suggested-price tooltip | MISSING | M4 | 05-I5 |
| A385 | Stand | Stand price edit keeps bankPack (bank listing converted today) | BROKEN | P0-14 | 05-I6 (upgraded), 05-ch X5 |
| A386 | Stand | Stand Remove sends id+bankPack, two-step confirm (silent no-op today) | BROKEN | P0-14 | 05-I7, 05-BR-4, 03-ch #27 |
| A387 | Stand | Native buy orders section (priority, use-stand, cancel) | MISSING | M4 | 05-I8 |
| A388 | Stand | Inspect item from stand row | MISSING | M4 | 05-I9 |
| A389 | Stand dialog | Dialog context: Buy-from-NPC price, current number on market | MISSING | M5 | 01-F2, 05-J1 |
| A390 | Stand dialog | 13 price presets | MISSING | M5 | 01-F2, 05-J2 |
| A391 | Stand dialog | Quantity input for stacks (default stack) | MISSING | P0-14 | 01-F2, 05-J3 |
| A392 | Stand dialog | 'Mark all for stand' (markAll:true; bank 'Mark all' mislabelled today) | BROKEN | P0-14 | 01-F2, 05-J4, 06-#12, 06-B2 |
| A393 | Stand dialog | Inline stand error | PARTIAL | M5 | 05-J5 |
| A394 | Stand dialog | Automatic stand variant: presets, existing rule prefill, 'Update' | PARTIAL | M5 | 05-J6 |
| A395 | Stand dialog | 16-slot guard when not editing | MISSING | M5 | 01-F2 |
| A396 | Market | Status banner (unavailable / loading / not configured + Go to setup) | MISSING | M6 | 05-K2 |
| A397 | Market | Tabs with counts: Live WTS / Live WTB / Classifieds / Ponty | PARTIAL | M6 | 05-K3 |
| A398 | Market | Search item/seller/server/map | MISSING | M6 | 05-K4 |
| A399 | Market | WTS filters (deals, bad deals, unaffordable, blacklisted) | MISSING | M6 | 05-K5 |
| A400 | Market | WTS grouping + fresh-first sort | MISSING | M6 | 05-K6 |
| A401 | Market | WTS row details, deal colouring, stale dimming | PARTIAL | M6 | 05-K7 |
| A402 | Market | WTS buy: qty + All + confirmation + stale→Make WTB | PARTIAL | M6 | 05-K8 |
| A403 | Market | Live WTB tab + Sell POST /merchant/aldata-sale + List | MISSING | M6 | 05-K9, 01-M1 |
| A404 | Market | Classifieds tab | MISSING | M6 | 05-K10 |
| A405 | Market | Ponty tab grouping/freshness/'Matches WTB'/error | PARTIAL | M6 | 05-K11 |
| A406 | Market | Ponty purchase routed to /merchant/ponty-order (Ponty rows have no source) | BROKEN | P0-19 | 05-K12, 05-BR-3 |
| A407 | Market | Inspect item from any market row | MISSING | M6 | 05-K15 |
| A408 | Market | Purchase result handling (busy, inline error, no double tap) | PARTIAL | M6 | 05-ch X9 |
| A409 | Market | Player-stand search & buy (dashboard dialog is dead code; results need config standSearch) | EXTRA | - | 05-K16, 01-M2, 01-O10 |
| A410 | WTB | Active WTB panel inside market | PARTIAL | M7 | 05-K13 |
| A411 | WTB | New WTB item picker | PRESENT | - | 05-K14 |
| A412 | WTB | WTB list filter + count + empty texts | PARTIAL | M7 | 05-L1 |
| A413 | WTB | Row inspect + '· +N minimum' | PARTIAL | M7 | 05-L2 |
| A414 | WTB | Inline field edits with editField + bidRevision | PARTIAL | M7 | 05-L3 |
| A415 | WTB | Use-stand / accept-higher toggles + explanations, Auto badge, problems | PARTIAL | M7 | 05-L4 |
| A416 | WTB | Cancel with 'Really cancel?' | PARTIAL | M7 | 05-L5 |
| A417 | WTB | 'Make room' replacement dialog on 409 occupants | MISSING | M7 | 05-L6 |
| A418 | WTB | WTB dialog fields (priority clamp 100) | PRESENT | - | 05-L7 |
| A419 | WTB | Clearing priorityOverride (null always sent) | BROKEN | P0-18 | 05-L8, 05-BR-5 |
| A420 | WTB | 15 price presets | PARTIAL | M7 | 05-L9 |
| A421 | WTB | Existing price prefill only at same minimumQuality | PARTIAL | M7 | 05-L10 |
| A422 | WTB | Entry points: item details, stand buy-order, market Make/Add to WTB | MISSING | M7 | 05-L11, 03-#78 |
| A423 | Marketplace settings | Auto-fill empty stand slots (/merchant/native-stand configure) | MISSING | M8 | 05-M1 |
| A424 | Marketplace settings | Enable blacklisting unavailable merchants | MISSING | M8 | 05-M2 |
| A425 | Marketplace settings | Manual blacklist add | MISSING | M8 | 05-M3 |
| A426 | Marketplace settings | Strike records list + clear | MISSING | M8 | 05-M4 |
| A427 | Marketplace settings | Clear all blacklist (two-step) | MISSING | M8 | 05-M5 |
| A428 | Shared rules | Configured merchant (merchantCharacter) used instead of ctype==='merchant' everywhere | BROKEN | F1 | 03-oos, 03-ch M13, 04-ch M6, 06-oos1 |
| A429 | Shared rules | Shared-rule conflicts panel POST /merchant/rule-conflict | MISSING | M9 | 03-#71, 05-O1 |
| A430 | Shared rules | Incompatible-rules notice | MISSING | M9 | 05-O2 |
| A431 | Bank | No snapshot empty state | PRESENT | - | 06-#2 |
| A432 | Bank | Search (name/id/definition name) with dimming | MISSING | B1 | 06-#3, 06-ch M10 |
| A433 | Bank | Pack header occupied/total | PRESENT | - | 06-#4 |
| A434 | Bank | stat_type badge | MISSING | B1 | 06-#5a |
| A435 | Bank | Merchant's Luck clover | MISSING | B1 | 06-#5b |
| A436 | Bank | Auto-stand banner | MISSING | B1 | 06-#5c |
| A437 | Bank | RESERVED overlay on items1 35-41 | MISSING | B1 | 06-#5d |
| A438 | Bank | Co-existing mark indicators (withdraw border, $, NPC) with same() identity | BROKEN | B1 | 06-#5e (upgraded) |
| A439 | Bank | Tap tile → full item details (bank source) | MISSING | B1 | 06-#7 |
| A440 | Bank | Mark/Unmark for withdrawal to configured merchant (offline OK) | BROKEN | F1 | 06-#8, 06-B1 |
| A441 | Bank | Mark all for withdrawal | BROKEN | F1 | 06-#9 |
| A442 | Bank | Withdraw double-tap guard (2nd tap removes mark) | BROKEN | P0-20 | 06-ch M3 |
| A443 | Bank | Auto-bank 409 confirm → retry with removeAutoBankMark | MISSING | B1 | 06-#10, 06-B6 |
| A444 | Bank | Bank Mark for stand (price default, qty default, unmark) | BROKEN | P0-14 | 06-#11 (upgraded), 06-ch M4 |
| A445 | Bank | Bank auto mark for stand | MISSING | B1 | 06-#13 |
| A446 | Bank | Bank Mark for upgrade (withdraw upgradeTiers) | MISSING | B1 | 04-#10, 06-#14 |
| A447 | Bank | Bank Auto mark for upgrade (slot -1) | MISSING | B1 | 04-#11, 06-#15 |
| A448 | Bank | Bank 'Add upgrade rule' | MISSING | B1 | 04-#12 |
| A449 | Bank | Bank auto mark for deconstruction | MISSING | B1 | 06-#17 |
| A450 | Bank | Bank auto sell to NPC | MISSING | B1 | 06-#19 |
| A451 | Bank | Bank clear all marks | MISSING | B1 | 06-#20 |
| A452 | Bank | Disabled states (no merchant, item.l, stand full) | PARTIAL | B1 | 06-#21 |
| A453 | Bank floors & vaults | Floor names | PARTIAL | B2 | 06-#25 |
| A454 | Bank floors & vaults | Floor access status | MISSING | B2 | 06-#26 |
| A455 | Bank floors & vaults | Unlock with key, owned count, disabled at 0 | PARTIAL | B2 | 06-#27 |
| A456 | Bank floors & vaults | Gold unlock only on accessible floors | PARTIAL | B2 | 06-#28 (downgraded) |
| A457 | Bank floors & vaults | Vault notices | MISSING | B2 | 06-#29 |
| A458 | Bank floors & vaults | Unlock confirmation text names merchant / key consumed | PARTIAL | B2 | 06-#30, 06-ch M6 |
| A459 | Bank floors & vaults | Unlock wiring POST /bank/unlock | PRESENT | - | 06-#31 |
| A460 | Bank floors & vaults | Vault gold cost display | PRESENT | - | 06-#32 |
| A461 | Bank floors & vaults | Unlock disabled without configured merchant | MISSING | B2 | 06-ch M5 |
| A462 | Bank floors & vaults | 'Additional bank storage' lists every floor | PARTIAL | B2 | 06-ch M7 |
| A463 | Bankbois | Section header 'N staged or waiting' (bankboiQueue) | MISSING | B3 | 06-#33 |
| A464 | Bankbois | Create bankboi POST /bankbois/create | MISSING | B3 | 06-#34, 01-M1 |
| A465 | Bankbois | First-bankboi confirm (reserve 7 slots) | MISSING | B3 | 06-#35 |
| A466 | Bankbois | Prefix-required alert / disabled create | MISSING | B3 | 06-#36 |
| A467 | Bankbois | Bankboi card (name, mode·phase, occupied/42, error) | MISSING | B3 | 06-#37 |
| A468 | Bankbois | Delete bankboi (empty only, two-step) | MISSING | B3 | 06-#38, 01-M1 |
| A469 | Bankbois | Bankboi 42-slot grid with full context menu | MISSING | B3 | 06-#39 |
| A470 | Bankbois | 'No bankbois yet' empty text | MISSING | B3 | 06-#40 |
| A471 | Mail | Inbox row subject/From/date/attachment status | PARTIAL | B4 | 06-#44 |
| A472 | Mail | Refresh POST /mail/refresh | MISSING | B4 | 06-#45 (lower severity) |
| A473 | Mail | 'Mail may be out of date' / loading / empty | MISSING | B4 | 06-#46 |
| A474 | Mail | Message detail from → to · date, pre-wrap | PARTIAL | B4 | 06-#47 |
| A475 | Mail | Attachment tile sprite/level/qty + inspect | PARTIAL | B4 | 06-#48 |
| A476 | Mail | Attachment status labels ('pending' shows collected today) | BROKEN | B4 | 06-#49 (partly downgraded) |
| A477 | Mail | Collect disabled while queued/collecting + errors | PARTIAL | B4 | 06-#50 |
| A478 | Mail | Delete message two-step POST /mail/delete | MISSING | B4 | 06-#51 |
| A479 | Mail | Reply | MISSING | B4 | 06-#52 |
| A480 | Mail | Compose limits + disable rules | PARTIAL | B4 | 06-#53 |
| A481 | Mail | Attachment picker (merchant, bank, bankbois) | MISSING | B4 | 06-#54, 01-O6 |
| A482 | Mail | Attachment quantity | MISSING | B4 | 06-#55, 01-O6 |
| A483 | Mail | Postage estimate GET /mail/postage | MISSING | B4 | 06-#57 |
| A484 | Mail | Two-step send | MISSING | B4 | 06-#58 |
| A485 | Mail | Mail outcome status (collection, collectionError) | MISSING | B4 | 06-ch M8 |
| A486 | Mail | Write message / Cancel / Remove attachment footer | PARTIAL | B4 | 06-ch M9 |
| A487 | Mail | ALData 'Prepare mail' through composer with postage + pending | PARTIAL | B4 | 01-D18, 05-N3 |
| A488 | Mail | decodeMailInbox (old coordinators only) | N/A | - | 06-#60 (refuted) |
| A489 | Bestiary | Tracktrix bonuses popover | MISSING | X1 | 06-#63 |
| A490 | Bestiary | Map filter chips | MISSING | X1 | 06-#64 |
| A491 | Bestiary | Search | MISSING | X1 | 06-#65 |
| A492 | Bestiary | Sort + asc/desc | MISSING | X1 | 06-#66 |
| A493 | Bestiary | 'Tracktrix data unavailable' notice | MISSING | X1 | 06-#67 |
| A494 | Bestiary | Card threat | PARTIAL | X1 | 06-#69 |
| A495 | Bestiary | Card achievements / score / high score | MISSING | X1 | 06-#70 |
| A496 | Bestiary | Monster details dialog (unified with item drill-in) | PARTIAL | X1 | 02-#75, 03-#93, 06-#71, 06-#80 |
| A497 | Bestiary | G.monsters.ID line | MISSING | X1 | 06-#72 |
| A498 | Bestiary | Navigate to monster (non-Phoenix; tinyp disabled) | MISSING | X1 | 02-#75, 06-#73 |
| A499 | Bestiary | Monster achievements panel | MISSING | X1 | 06-#74 |
| A500 | Bestiary | Recorded spawns with restrictions | MISSING | X1 | 06-#75, 02-#75 |
| A501 | Bestiary | Definition grid | MISSING | X1 | 06-#76 |
| A502 | Bestiary | Drop rate via formatDropRate (250.0000% / 0.0000% today) | BROKEN | X1 | 06-#77 (severity up) |
| A503 | Bestiary | Zone & world drops | MISSING | X1 | 06-#78 |
| A504 | Bestiary | Click drop → item details | PARTIAL | X1 | 06-#79 |
| A505 | Bestiary | Drops order (server order) | PARTIAL | X1 | 06-ch M11 |
| A506 | Bestiary | monsterAchievements per character aggregated | MISSING | F2 | 06-#81 |
| A507 | Bestiary | tracktrix per character | MISSING | F2 | 06-#82 |
| A508 | Infrastructure | API post() returns parsed body + status + code (occupants, missing, counts, auto_bank_confirmation_required) | BROKEN | F3 | 05-oos4, 05-ch (f), 06-ch (b) |
| A509 | Infrastructure | e2e mock honours section, strips config from core, mirrors server semantics | BROKEN | P0-03 | 01-O9, 02-ch M13, 03-ch M15, 05-ch X10, 06-ch 7 |
| A510 | Infrastructure | TEMPORARY coreFetchDebug banner shipped | BROKEN | P0-21 | 02-ch M12, 02-oos, 03-oos |

---

## Appendix B — Verification protocol

Every package, P0 items included, must pass all five gates below before its rows can be marked PRESENT in Appendix A. A package is "done" only when **every** row it owns has passed.

### B.1 Mock-server fidelity (gate 1: the test environment is honest)
1. **Section contract.**
   - `E/fixtures/mockPartyServer.ts` keeps a `CONFIG_FIELDS` / `CONFIG_EXTRA_KEYS` constant copied verbatim from `R/telemetry/public-state.ts:65-86`, with a header naming the console version.
   - `E/mock-contract.spec.ts` asserts:
     - no config key appears in `section=core&dashboard=1`;
     - every config key appears in `section=config`;
     - `section=bank` includes `bankbois` only with `dashboard=1`;
     - `section=market` returns only `aldata`, `ponty` and `standPriceHistory`.
2. **Handler semantics.**
   - For each endpoint a package touches, the mock handler mirrors the real `R/http/*` handler's:
     - validation (status code and `error` text);
     - side effects (toggles, scope fallbacks, `undefined` vs `null`, identity matching);
     - extra response fields (`occupants`, `missing`, `code`, counts).
   - The package PR lists each endpoint with the server handler file:line it mirrors.
   - Known semantics that must be mirrored:

     | Endpoint | Semantics to mirror |
     |---|---|
     | `/merchant/stand` | find-without-id rules; price ≥ 1; quantity overwrite on re-mark; `markAll` |
     | `/merchant/auto-npc-sale` | per-player keys |
     | `/command auto-exchange`, `/command withdraw` | toggle |
     | `/hunt-*` | leader fallback when `character` is absent |
     | `/formation` | `leader` applied only when the key is present |
     | `/merchant/routine-priorities` | unknown keys dropped |
     | `/merchant/bid` | `priorityOverride` undefined keeps the old value, null clears |
     | `/merchant/job/cancel` | disables the automation |
     | `/daily-dungeons` | `operationId` required; paid votes require `confirmed` |
     | `withdraw` | 409 `auto_bank_confirmation_required` |
     | `/merchant/order` | 409 `missing[]` |
     | Ponty listings | no `source` field |
3. **Negative paths.**
   - The mock can serve a `302 → /setup`, a garbage-JSON response, a delayed config (20 s) and a failing config (503).
   - The P0-02 and P0-05 specs use these.
4. **Request-body assertions.**
   - Every mutating action added or changed by a package gets a Playwright assertion on the captured request body: exact key set and values, using a `captureRequests(page, path)` helper.
   - Expected bodies come from the dashboard source line cited in the package, *not* from the PWA's own client.
   - Where practical, record the dashboard's real body once and store it in `E/fixtures/dashboard-bodies/<endpoint>.json`. Capture it from DevTools while using the dashboard against the user's coordinator (read-only actions, or actions the user performs themselves).

### B.2 Parity checklist (gate 2: nothing dropped)
For each package, produce `parity/<ID>.md` in the PWA repo with these sections:
1. **Dashboard files.** List every file from the package's "Dashboard sources". For each file, list every user-visible element: field, badge, button, menu entry, dialog, confirmation, tooltip, disabled state, error text. Start from the Appendix A rows and add any element found on re-read.
2. **PWA mapping.** Give each element the PWA file:line that implements it, or "intentional mobile adaptation: <how>" (for example, hover tooltip → long-press sheet). "Omitted" is not allowed.
3. **Reviewer independence.** A reviewer who did not implement the package re-reads the dashboard files in full and greps the PWA, using the challenge method from `CHALLENGE-BRIEF.md`. Any element without a mapping blocks the package.
4. **Appendix A update.** Update each row's status to PRESENT (or keep it PARTIAL with the reason) in a tracked copy of Appendix A.

### B.3 Local run against the live coordinator, read-only (gate 3: the real contract)
Per user policy:
- **Never touch Mainframe.** The user plays via the Steam client.
- **No blocking CI gates until the checks have been verified locally.**

Steps:
1. **Run the PWA against the coordinator.** Run `npm run dev` in `web/`. Point the in-app server override at the user's coordinator. Pair with the existing flow.
2. **Make GET requests only.**
   - Allowed: `state?section=core&dashboard=1`, `config`, `bank&dashboard=1`, `market`, `logs`, `catalog`, `mail`, `escape`, `daily-dungeons`, `mail/postage`, `aldata/auth`, root `console-update`, `console-debug`, `setup/state`, and the `dashboard-stream` / `map-stream` SSE streams.
   - Any POST needs the user's explicit go-ahead for that specific action. Better: the user performs it themselves while watching the PWA update.
3. **Run the key-diff script.** `scripts/contract-diff.mjs` fetches each section from the live coordinator. It asserts:
   - (a) the key sets match the mock's sections;
   - (b) every field the PWA model types is present, or is documented as optional;
   - (c) no config key arrives in core.

   It also prints `gameVersion` and the console version. Re-run it after every console update. Any new or removed key opens a re-audit task.
4. **Side-by-side visual check.** Open the dashboard and the PWA for the same account state. For each Appendix A row in the package, compare the values shown:
   - leader, follow flags, focus and radius, priorities;
   - stand count, marks badges, queue labels;
   - bank badges, mail status, dungeon phase.

   Record a screenshot pair, or a list of matched values, in `parity/<ID>.md`.
5. **Confirm specific Phase 0 symptoms on the live coordinator.**
   - P0-01: the debug banner (before P0-21 removes it) reads `leader="<name>"` and a non-null `farmingPolicy`.
   - P0-04: tapping Follow leaves `leader` unchanged in `section=config`.
   - P0-06: opening Routines and pressing Save without edits leaves the `section=config` `merchantRoutinePriorities` and `merchantAutomations` byte-identical. Do this only with the user's approval, because it is a POST; the user can do it themselves.

### B.4 Unit tests for verbatim ports (gate 4: pure logic is identical)
- Add Vitest (`npm run test:unit`). Each F7 port gets a golden test.
- Where the dashboard has its own tests or fixtures, copy them unchanged. Otherwise generate input/output pairs by running the dashboard function in Node against the same inputs. The file is pure, so this needs no app.
- Ports carry a header such as `// ported verbatim from console-v1.2.0/dashboard/features/party/<file> L<a>-<b>`. A `scripts/port-drift.mjs` check compares the body against the source on version bumps.

### B.5 Definition of done and release sequencing (gate 5)
- **Done** means:
  - gates 1–4 have passed;
  - `npm run build`, `npm run lint` and `npm run test:e2e` are green locally;
  - Appendix A rows are updated;
  - the Android app gets mirrored on a best-effort basis (per user policy the PWA is primary; Android is not blocking).
- **Phase 0 ships before any Phase 1+ work merges.** P0-04 goes first. PR-0b (P0-01/02/03/05) is verified live with gate 3 before PR-0c through PR-0f.
- **No CI gate is wired for any check that has not first been run and verified locally.** The e2e suite and the contract-diff stay advisory until the user confirms they pass reliably.
- **Every package is re-audited after any console release.** The plan is pinned to v1.2.0, and the core/config split shows how silently the contract can move.
