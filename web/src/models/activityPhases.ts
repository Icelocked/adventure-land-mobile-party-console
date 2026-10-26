/** Core's read-only `activityPhases` field: the task phases the activity
 *  label reads that core does not otherwise carry. The console fork builds
 *  it in runtime/coordinator/telemetry/activity-phases.ts; these types copy
 *  its interfaces. */
export interface PlacePhase {
  map?: string
  mapName?: string
  monsterIds?: string[]
}
export interface HuntPhase {
  stage: string
  participants: string[]
  target?: string | null
  message?: string
  recovering?: boolean
  encounter?: unknown
  currentIndex?: number
  missions?: { target: string }[]
  turnIn?: { phase: string } | null
}
export interface ConvoyPhase {
  id?: string
  phase: string
  purpose?: string | null
  label?: string
  failure?: string
  defenseReason?: string
  participants?: string[]
  walkingActivity?: string
  walkingEvent?: string
  eventPursuitBossId?: string | null
  merchantInterruption?: { phase?: string } | null
  location?: PlacePhase | null
}
export interface RarePhase {
  encounter?: { mtype: string; stage: string } | null
  patrol?: { stage: string } | null
}
export interface EventReturnPhase {
  phase: string
  event?: string
  participants?: string[]
}
/** activity-phases.ts profilePhases(): one character's owning farming profile. */
export interface ProfilePhases {
  monsterHunt: HuntPhase | null
  activeConvoy: ConvoyPhase | null
  farmAreaState: { active: PlacePhase | null; pending: true | null; paused: boolean } | null
  combatRecovery: { phase: string; names: string[] } | null
  eventReturn: EventReturnPhase | null
  rareHuntState: RarePhase | null
  partyFarmingMode: string | null
  partyFarmingMonsterType: string | null
  achievement: { target: { id: string | null; milestone: number | null; step: number | null } | null; message: string | null } | null
  eventSession: { event: string; spawnAt: number | null; live: boolean } | null
}
export interface ActivityPhases {
  profiles: Record<string, ProfilePhases | undefined>
  bossChase: { trip: { boss: string | null; realm: string | null; arrived: boolean; respawnAt: number | null } | null; returning: boolean } | null
  attendance: Record<string, Record<string, { ignored: string | null; dead: boolean } | undefined> | undefined>
  escape: { stage: string | null } | null
  dungeon: { phase: string | null; participants: string[]; travel: string | null; message: string | null; reviving: { priest: string | null; target: string | null } | null } | null
  characters: Record<string, { eventExit: string | null; farmReunion: string | null } | undefined>
}
