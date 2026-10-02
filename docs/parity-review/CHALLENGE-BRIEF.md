# Adversarial challenge brief

You are an adversarial reviewer. Another agent audited one domain of PWA ↔ party-console parity (read BRIEF.md in this directory first for the goal, codebase paths, and classification scheme). Your job is to try to break their report. READ-ONLY on both repos.

## Do all of these
1. **Refute false negatives in the PWA.** For every row marked MISSING / UNREACHABLE, independently grep the whole PWA (`web/src`, incl. components/lib/models/api) for the endpoint path, the state key, the label text, and synonyms. If the feature actually exists, mark the claim REFUTED with file:line.
2. **Refute false BROKEN claims.** For every BROKEN row, re-read both sides of the code and the server handler. Confirm the exact failure scenario (inputs → wrong outcome) or mark REFUTED / DOWNGRADED with reasoning.
3. **Challenge PRESENT claims.** Pick every PRESENT row and verify wiring end-to-end: endpoint path, method, body field names, state key read, refresh after mutation, navigation reachability. Upgrade to PARTIAL/BROKEN where warranted.
4. **Find what they missed.** Re-read the dashboard files in their domain slice yourself (full reads) and list every user-visible field/control/menu entry/dialog/confirmation/status not present in their table. Also check server handlers in their domain for capabilities exposed via HTTP that the dashboard uses but they didn't list.
5. **Sanity-check severity and effort** and flag dependencies (e.g. "needs PartyDataProvider to keep character details first").

## Output
Write `...\scratchpad\review\<NN>-challenge.md` with sections: Refuted claims, Downgraded/Upgraded claims, Confirmed critical claims (one line each), Missed gaps (same table format as BRIEF.md), Dependencies/ordering notes. Cite file:line for everything. Final reply to orchestrator: short summary with counts and path.
