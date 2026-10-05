/** Primary first, then Steam, then headless; merchants stay last unless
 *  primary. */
export function orderCharacters<T extends { name: string; ctype?: string }>(
  characters: T[],
  roster: { name: string }[],
  primary: string | null | undefined,
  merchant: string | null | undefined,
  steam: readonly string[] = [],
): T[] {
  const order = new Map(roster.map((member, index) => [member.name, index]))
  const steamNames = new Set(steam)
  const rank = (member: T) => {
    if (member.name === primary) return 0
    if (member.name === merchant || member.ctype === 'merchant') return 3
    return steamNames.has(member.name) ? 1 : 2
  }
  return characters
    .slice()
    .sort((a, b) => rank(a) - rank(b) || (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity) || a.name.localeCompare(b.name))
}
