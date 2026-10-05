/** Query cache keys. The data layer (SSE and polling) writes them and
 *  screens read them through query hooks. */
export const QK = {
  characters: ['characters'] as const,
  connected: ['connected'] as const,
  lastConnectionError: ['lastConnectionError'] as const,
  roster: ['roster'] as const,
  dynamicState: ['dynamicState'] as const,
  mail: ['mail'] as const,
  gameLogs: ['gameLogs'] as const,
  logsError: ['logsError'] as const,
  escapeError: ['escapeError'] as const,
  // Set after the ALData auth mail is sent.
  aldataAuthPending: ['aldataAuthPending'] as const,
  // The latest /aldata/auth answer.
  aldataAuthStatus: ['aldataAuthStatus'] as const,
  escape: ['escape'] as const,
  latencyMs: ['latencyMs'] as const,
  configLoadedAt: ['configLoadedAt'] as const,
  // Core's characterDetails and the server clock offset.
  characterDiagnostics: ['characterDiagnostics'] as const,
  serverOffset: ['serverOffset'] as const,
}
