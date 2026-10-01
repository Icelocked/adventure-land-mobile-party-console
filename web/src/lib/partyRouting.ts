/** Ported verbatim from party-console's dashboard/lib/party-routing.ts. */
export interface RoutingFormation {
  leader?: string | null
  followers?: Record<string, boolean>
}

export const FOLLOWER_ROUTE_MESSAGE = 'only leader can route to monster'

export function canRouteToMonster(formation: RoutingFormation, character: string): boolean {
  return character === formation.leader || formation.followers?.[character] !== true
}
