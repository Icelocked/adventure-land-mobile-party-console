# PWA ↔ Party Console parity review — shared brief

## Goal
The user wants LITERAL 1:1 parity: anything a user can SEE or DO on Ryan's party-console dashboard must be seeable/doable in the mobile PWA. Mobile layout may differ (sheets, screens, menus instead of panels) but no capability, data field, control, setting, confirmation, status indicator, or right-click/context-menu action may be missing. "Not linking correctly" also counts: a PWA control that exists but calls the wrong endpoint, sends a wrong/missing body field, reads the wrong state key, never refreshes, or is unreachable from navigation is a defect.

## Codebases (READ-ONLY — do not edit, commit, or run git commands that modify either repo)
- Dashboard (source of truth), release v1.2.0 = what runs live:
  `C:\Users\Tyler\AppData\Local\Temp\claude\F--CodingProjects-Adventureland-Team\7b19cba8-37fd-43f9-a54b-0cb084960e97\scratchpad\console-v1.2.0`
  - UI: `dashboard/features/party/*`, `dashboard/app`, `dashboard/components`, `dashboard/lib`
  - Backend HTTP routes: `runtime/coordinator/http/*` (and the route registration that wires them), live/websocket protocol: `dashboard/features/party/live-protocol.ts`, `dashboard-live.tsx`
  - State shape: `dashboard/features/party/party-state.tsx`
  - Docs: `docs/`, `README.md`, `AGENTS.md`
- PWA: `F:\CodingProjects\adventureland-party-mobile\web` (focus on `src/`; `e2e/fixtures/mockPartyServer.ts` shows which endpoints the PWA believes exist)
  - API client: `src/api/partyApi.ts`, `src/api/liveConnection.ts`, `src/api/liveProtocol.ts`
  - State model: `src/models/state.ts`
  - Navigation: `src/App.tsx`, `src/screens/**`
- An older comparison doc exists at `F:\CodingProjects\Adventureland-Team\PARTY-CONSOLE-COMPARISON.md`. It predates v1.2.0 — you may use it as a lead list but VERIFY everything against code; do not copy its conclusions.

## Method
1. Read every file in your assigned domain slice of the dashboard fully (not excerpts). For each user-visible element (displayed field, badge, button, menu item, context-menu entry, dialog, toggle, input, setting, tooltip with info, confirmation prompt, keyboard/drag interaction) record it.
2. Trace each action to the HTTP endpoint / live message it sends (method, path, body fields) via `use-party-console.tsx`, `api.tsx`, `query-actions.ts`, and the `runtime/coordinator/http` handler.
3. Search the WHOLE PWA (`web/src`) for the equivalent — grep endpoint paths, state keys, and labels. Do not conclude "missing" without grepping for the endpoint path and the state key.
4. Classify each: PRESENT (equivalent, correct wiring) / PARTIAL (exists but missing fields/options) / BROKEN (exists but wired wrong — cite both sides) / MISSING / UNREACHABLE (code exists in PWA but no navigation path).
5. You may read files outside your slice whenever tracing requires it. If you spot gaps outside your slice, list them in an "Out-of-slice observations" section.
6. Note reuse opportunities: dashboard components/libs that are pure logic (formatting, calculations, models) and could be ported nearly verbatim, and existing PWA helpers that should be extended rather than duplicated.

## Report format
Write your report to `...\scratchpad\review\<NN>-<domain>.md` (path given in your task). Structure:
- Summary: counts by classification, top 5 most impactful gaps.
- Feature table: `| # | Feature | Dashboard evidence (file:line) | Endpoint/state key | PWA status | PWA evidence (file:line or "none — grepped X, Y") | Notes |`
- BROKEN details: exact mismatch with code from both sides.
- Reuse opportunities.
- Out-of-slice observations.
Every claim must cite file:line. Be exhaustive — completeness matters more than brevity. Your final reply to the orchestrator should be a short summary (counts + top gaps + report path), not the full report.
