/** runtime/party-groups.ts (party-console v1.2.0), verbatim: the party
 *  groups the merchant can be sent to - a leader with its followers, plus
 *  each independent character - never the merchant or bankbois. */
export function merchantPartyGroups(
  state: { leader?: string | null; merchantCharacter?: string | null; followers?: Record<string, boolean>; bankbois?: Record<string, unknown> | { name: string }[] },
  names: string[],
): { id: string; members: string[] }[] {
  const groups = new Map<string, string[]>()
  const storage = new Set(Array.isArray(state.bankbois) ? state.bankbois.map((worker) => worker.name) : Object.keys(state.bankbois || {}))
  for (const name of new Set(names)) {
    if (name === state.merchantCharacter || storage.has(name)) continue
    const owner = state.leader && (name === state.leader || state.followers?.[name]) ? state.leader : name
    const members = groups.get(owner) || []
    members.push(name)
    groups.set(owner, members)
  }
  return [...groups].map(([id, members]) => ({ id, members: members.sort((a, b) => (a === id ? -1 : b === id ? 1 : a.localeCompare(b))) }))
}
