/** Mirrors model/Roster.kt's RosterMember - party-console's account-wide
 *  character roster (relatively static: name/class/level/home realm),
 *  unlike the fast-changing vitals stream. Fetched once via GET
 *  /party-api/state and merged into CharacterVitals so ctype/level are
 *  always real values instead of the vitals stream's blank placeholders. */
export interface RosterMember {
  name: string
  ctype: string
  level: number
  id?: string
  online?: boolean
  home?: string
  server?: string
}

/** Only the roster slice this app reads out of GET /party-api/state -
 *  that endpoint returns much more; unknown fields are simply ignored. */
export interface PartyStateRoster {
  roster: RosterMember[]
}
