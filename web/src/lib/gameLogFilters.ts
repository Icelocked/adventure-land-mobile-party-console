// runtime/game-log-filters.ts, verbatim. Filter categories inspired by Crowns3bc's Game Log Filter:
// https://github.com/Crowns3bc/AdventureLand/blob/main/Gui/Game%20Log%20Filter.js
export const logFilters = [
  { id: 'kills', label: 'Kills', pattern: /killed|slain/i, enabled: false },
  { id: 'gold', label: 'Gold', pattern: /\bgold\b/i, enabled: true },
  { id: 'party', label: 'Party', pattern: /party/i, enabled: true },
  { id: 'items', label: 'Items', pattern: /found/i, enabled: true },
  { id: 'upgrade', label: 'Upgr.', pattern: /upgrade|combination|compound/i, enabled: true },
  { id: 'errors', label: 'Errors', pattern: /\b\w*error\b|\bexception\b|\bfailed\b|route rejected|collisions detected|falling back to native|\b(?:line|column)\s*:?\s*\d+/i, enabled: true },
  { id: 'info', label: 'Info', pattern: /$^/, enabled: true },
] as const
export const defaultLogFilters: Record<string, boolean> = Object.fromEntries(logFilters.map((f) => [f.id, f.enabled]))
export function classifyGameLog(message: string): string {
  if (logFilters[5].pattern.test(message)) return 'errors'
  return logFilters.find((f) => f.pattern.test(message))?.id || 'info'
}
export function showGameLog(category: string, filters: Record<string, boolean>): boolean {
  return filters[category === 'other' ? 'info' : category] !== false
}
