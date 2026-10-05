/** Account-wide roster entry (name/class/level/home realm). Merged into
 *  CharacterVitals, whose live stream lacks ctype/level. */
export interface RosterMember {
  name: string
  ctype: string
  level: number
  id?: string
  online?: boolean
  home?: string
  server?: string
}

/** The roster slice of GET /party-api/state; other fields are ignored. */
export interface PartyStateRoster {
  roster: RosterMember[]
}
