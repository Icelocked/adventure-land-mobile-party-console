/** Whether a member's Cave visit check still answers (console hunting/rules.ts caveVisitCurrent):
 *  a check made before the visit's reset goes stale once the reset passes. */
export function caveVisitCurrent(visit: { checkedAt: number; resets: number }, now: number): boolean {
  return !(visit.checkedAt < visit.resets && now >= visit.resets)
}
