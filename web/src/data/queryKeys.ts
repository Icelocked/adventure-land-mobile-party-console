/** TanStack Query cache keys this app's data layer writes to and every
 *  screen reads from - mirrors party-console's own dashboard-live.tsx
 *  pattern (SSE writes into the query cache, screens read via query
 *  hooks) rather than a bespoke store, and mirrors the Android app's
 *  PartyRepository StateFlow surface 1:1 so the port stays mechanical. */
export const QK = {
  characters: ['characters'] as const,
  connected: ['connected'] as const,
  lastConnectionError: ['lastConnectionError'] as const,
  roster: ['roster'] as const,
  dynamicState: ['dynamicState'] as const,
  mail: ['mail'] as const,
  gameLogs: ['gameLogs'] as const,
}
