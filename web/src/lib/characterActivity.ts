import type { MerchantJob, RealmControl } from '@/models'
import type { ActivityPhases, ConvoyPhase, EventReturnPhase, HuntPhase, PlacePhase, ProfilePhases, RarePhase } from '@/models/activityPhases'
import type { ConsoleControlState } from '@/models/consoleControl'
import { merchantJobLabel } from './merchantJobLabel'
import { eventDisplayNames } from './eventPolicy'

// A port of the console fork's dashboard/features/party/character-activity.ts
// (topic15r/release-ui af92de45). Keep the branches and strings in step with
// it; characterActivity.test.ts replays its console-card-strip.spec.ts cases.

type Destination = PlacePhase
type Convoy = ConvoyPhase
type Hunt = HuntPhase
/** The party state fields the label reads: core's top-level task fields
 *  (the leader's profile), consoleControl and activityPhases. */
export type ActivityState = {
  consoleControl?: ConsoleControlState | null
  combatRecovery?: { phase: string; names: string[] } | null
  merchantCharacter?: string | null
  merchantCatalog?: { allItems?: readonly { id: string; name: string }[] } | null
  gatheringModes?: string[]
  realmControl?: Pick<RealmControl, 'operation'> | null
  partyFarmingMode?: string | null
  partyFarmingMonsterType?: string | null
  activeConvoy?: Convoy | null
  monsterHunt?: Hunt | null
  eventReturn?: EventReturnPhase | null
  deferredEventReturns?: Record<string, { phase: string } | undefined> | null
  rareHuntState?: RarePhase | null
  merchantCurrent?: MerchantJob | null
  farmAreaState?: { pending?: unknown; paused?: boolean; active?: Destination | null } | null
  activityPhases?: ActivityPhases | null
}
/** The live vitals merged over core's characterDetails for one character. */
export type ActivityCharacter = {
  name: string
  map?: string
  rip?: boolean
  activeEvent?: string | null
  joinedEvent?: string | null
  banking?: boolean
  bankQueued?: boolean
  stocking?: boolean
  upgrading?: boolean
  standOpen?: boolean
  gatheringPhase?: string
  monsterAchievementKills?: Record<string, number> | null
  lootStatus?: { pending?: boolean; capacityBlocked?: boolean } | null
  recovery?: { phase?: string; status?: string; recoveredAt?: number | null } | null
  anniversaryState?: { busy?: boolean; stage?: string } | null
  farmingNavigationDebug?: { town?: boolean; forceTravel?: boolean; cancelled?: boolean } | null
}
export type MonsterNames = (id: string) => string

const regrouping = new Set(['assemble', 'prepare', 'shared-prepare', 'scheduled', 'shared-hold', 'plan-return', 'observing'])
const farmTrips = new Set(['farm-relocation', 'empty-spawn-recovery', 'party-travel', 'party-force-travel', 'grouped-approach'])

// characterActivity sets this so boss events like mrpumpkin read with the
// bestiary name ("Mr. Pumpkin") instead of the raw id.
let monsterNames: MonsterNames | null = null
function eventName(id: string | null | undefined): string {
  if (!id) return 'event'
  const monster = monsterNames?.(id)
  return eventDisplayNames[id] || (monster && monster !== id ? monster : title(id))
}
function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// A convoy leg reads as regrouping until it walks; the phase list comes from
// navigation/convoy.ts and shared-navigation.ts.
function trip(convoy: Convoy, goal: string): string {
  if (convoy.phase === 'communication-hold') return 'Waiting for party connection'
  if (convoy.phase === 'failed') return `Travel held${convoy.failure ? ` - ${convoy.failure}` : ''}`
  if (convoy.phase === 'defending') return `Defending party${convoy.defenseReason ? ` - ${convoy.defenseReason}` : ''}`
  if (convoy.phase === 'hunt-arrival') return `Arriving at ${goal}`
  if (regrouping.has(convoy.phase)) return 'Regrouping for travel'
  return `Travelling to ${goal}`
}

function huntActivity(hunt: Hunt, convoy: Convoy | null, monster: MonsterNames): string | null {
  const id = hunt.missions?.[hunt.currentIndex ?? -1]?.target || hunt.target
  const target = `Hunt target - ${id ? monster(id) : 'unknown'}`
  const message = hunt.message || ''
  if (hunt.recovering) return 'Regrouping after death'
  if (hunt.turnIn?.phase === 'claiming') return 'Turning in hunt'
  // These holds keep the stage and change only the message (hunt/recovery.ts:175, hunt/convoy.ts:33 and :37).
  if (message.startsWith('Hunt movement is paused')) return 'Waiting - Hunt paused; select Hunt again'
  if (message.includes('paused by Escape')) return 'Waiting - Hunt paused by Escape'
  if (/^(Waiting|Backup Hunt waiting|Hunt waiting)/.test(message)) return message
  if (/^(Trying alternate|Recovering Hunt route)/.test(message)) return `Rerouting to ${target}`
  switch (hunt.stage) {
    case 'checking-quests':
    case 'assigning':
      return 'Acquiring new hunt target'
    case 'daisy-sync-travel':
      return message.startsWith('Regrouping') ? 'Regrouping at Daisy' : 'Travelling to Daisy for new hunt'
    case 'at-daisy':
      return 'At Daisy'
    case 'waiting-expiry':
      return 'Waiting at Daisy for hunt to expire'
    // Between convoy legs the convoy is null and the trip is still running.
    case 'mission-travel':
      return convoy?.purpose === 'monster-hunt' ? trip(convoy, target) : `Travelling to ${target}`
    case 'farming':
      return hunt.encounter ? `Fighting ${target} (en route)` : `Fighting ${target}`
    case 'returning':
      return 'Hunt finished - Travelling to turn in'
    case 'batch-loot':
      return 'Collecting hunt loot'
    case 'blacklist-retreat':
      return 'Retreating - hunt target blacklisted'
    case 'backup-travel':
      return 'Travelling to backup farm'
    case 'backup-farming':
      return 'Backup farming while hunts expire'
    // A member outside the event waits while the rest of the party attends it.
    case 'paused-event':
      return 'Waiting - Hunt paused for event'
    default:
      return null
  }
}

// Achievement Hunt states come from hunt/achievement-hunt.ts, which reports
// them only as achievementMessage text next to achievementTarget.
function achievementActivity(character: ActivityCharacter, phases: NonNullable<ProfilePhases['achievement']>, convoy: Convoy | null, monster: MonsterNames): string {
  const message = phases.message || ''
  const id = phases.target?.id
  if (message.startsWith('Waiting')) return `Waiting - ${message.replace(/^Waiting(: | for )/, '')}`
  if (message.startsWith('Skipping')) return 'Achievement Hunt - Switching achievement target'
  if (!id) return message.startsWith('Nothing left') ? 'Achievement Hunt - Nothing left to farm' : 'Achievement Hunt - Acquiring target'
  const target = `achievement target - ${monster(id)}`
  if (convoy?.purpose === 'manual-monster-override') return trip(convoy, target)
  if (message.startsWith('Returning to the')) return `Travelling to ${target}`
  const kills = character.monsterAchievementKills?.[id],
    goal = phases.target?.milestone
  return `Fighting ${target}${kills != null && goal ? ` (${kills}/${goal})` : ''}`
}

function dungeonActivity(name: string, dungeon: NonNullable<ActivityPhases['dungeon']>): string {
  if (dungeon.reviving && (dungeon.reviving.priest === name || dungeon.reviving.target === name)) return `Cave - reviving ${dungeon.reviving.target}`
  switch (dungeon.phase) {
    case 'gathering':
      return 'Gathering for cave'
    case 'entering':
      return 'Entering cave'
    case 'held':
      return 'Cave held'
    case 'exiting':
      return 'Leaving cave for event'
  }
  if (dungeon.travel === 'assembling') return 'Cave - grouping up'
  if (dungeon.travel === 'travelling') return 'Cave - travelling'
  return dungeon.message ? `In cave - ${dungeon.message}` : 'In cave'
}

function eventExitActivity(phase: string): string {
  if (phase.includes('goobrawl')) return 'Leaving event - Goobrawl (transporter)'
  if (phase.startsWith('leaving')) return 'Leaving event'
  if (phase === 'convoy-assembling') return 'Regrouping after event'
  if (phase === 'convoy-returning' || phase === 'returning') return 'Returning from event'
  if (phase === 'retry-wait') return 'Waiting - event exit retry'
  return 'Teleporting to town'
}

function merchantActivity(character: ActivityCharacter, state: ActivityState): string {
  const job = state.merchantCurrent
  const event = character.activeEvent || character.joinedEvent
  if (event) return `Fighting event - ${eventName(event)}`
  // A gathering attempt runs while a newly assigned job waits for the cast
  // to finish (observed live: deconstruction "assigned" during a fishing trip).
  const gathering = character.gatheringPhase && character.gatheringPhase !== 'idle'
  if (gathering && (!job || job.phase === 'assigned')) {
    // The status report omits which mode the attempt uses, so two enabled modes read as "Gathering".
    const modes = state.gatheringModes || []
    const mode = modes.length === 1 ? (modes[0] === 'mining' ? 'Mining' : 'Fishing') : 'Gathering'
    return character.gatheringPhase === 'travelling' ? `${mode} - travelling` : mode
  }
  if (job) {
    const catalog = state.merchantCatalog?.allItems || []
    const label = merchantJobLabel({ ...job, operationStage: undefined }, catalog)
    const phase = job.phase || ''
    if (phase === 'handoff') return `Collecting items from ${job.target}`
    if (phase.startsWith('collecting materials from')) return title(phase)
    if (phase.startsWith('switching')) return `${label} - switching realm`
    if (job.pauseReason) return `${label} - paused`
    if (job.operationStage === 'retrieving') return `${label} - bank retrieval`
    if (job.operationStage === 'storing') return `${label} - bank storage`
    return label
  }
  if (character.anniversaryState?.busy && character.anniversaryState.stage) return `Anniversary - ${character.anniversaryState.stage}`
  if (character.banking) return 'Banking'
  if (character.upgrading) return 'Upgrading'
  if (character.stocking) return 'Restocking'
  if (character.standOpen) return 'Idle at stand'
  return 'Idle'
}

/**
 * A character's activity label. It follows the coordinator's party task
 * and its phase (hunt stage, convoy phase, event return, merchant job), so
 * retargets and short moves inside a phase leave it unchanged. Per-character
 * fields only pick the character's own branch and fill in names.
 */
export function characterActivity(character: ActivityCharacter, party: ActivityState, monster: MonsterNames, now = Date.now()): string {
  monsterNames = monster
  const name = character.name
  const phases = party.activityPhases
  // A character outside the leader's party reads its own farming profile.
  const scoped = phases?.profiles[name]
  const state: ActivityState = scoped ? { ...party, ...scoped } : party
  const control = state.consoleControl
  if (control?.shutdown?.phase === 'safe') return 'Safe to stop'
  if (control?.shutdown?.phase === 'draining') return 'Holding still for shutdown'
  if (control?.paused) return 'Paused'
  if (character.rip) return 'Dead'
  const operation = state.realmControl?.operation?.phase
  if (operation === 'switching') return 'Switching realm'
  if (operation === 'setting-home') return 'Switching realm - setting home'
  if (name === state.merchantCharacter) return merchantActivity(character, state)
  // runtime/characters/roles/death-recovery.ts publishes these after a death outside party recovery.
  const ownRecovery = character.recovery
  if (ownRecovery?.phase && !ownRecovery.recoveredAt && !/complete|cancelled/.test(ownRecovery.status || '')) {
    switch (ownRecovery.phase) {
      case 'respawn':
        return 'Respawning'
      case 'event-reentry':
        return 'Rejoining event after death'
      case 'event-search':
        return 'Searching for Slenderman'
      case 'event-travel':
        return 'Travelling to event after death'
      case 'farm-return':
        return 'Returning to farm'
    }
  }
  switch (phases?.escape?.stage) {
    case 'blink':
    case 'warrior':
    case 'priest':
      return 'Escaping'
    case 'recovering':
    case 'recovery-convoy':
      return 'Regrouping after escape'
    case 'failed-hold':
      return 'Escape held'
  }
  const job = state.merchantCurrent
  if (job?.phase === 'handoff' && job.target === name) return 'Handing items to merchant'
  const recovery = state.combatRecovery?.names.includes(name) ? state.combatRecovery : null
  switch (recovery?.phase) {
    case 'finishing':
      return 'Finishing fight after death'
    case 'escaping':
      return 'Escaping'
    case 'recovering':
      return 'Regrouping after death'
    case 'returning-to-farm':
      return 'Returning to farm'
  }
  const convoy = state.activeConvoy?.participants?.includes(name) ? state.activeConvoy : null
  if (convoy?.purpose === 'death-recovery') return 'Regrouping after death'
  if (convoy?.purpose === 'escape-recovery') return 'Escaping to town'
  if (convoy?.merchantInterruption?.phase) return 'Handing items to merchant'
  const dungeon = phases?.dungeon?.participants.includes(name) ? phases.dungeon : null
  if (dungeon) return dungeonActivity(name, dungeon)
  const chase = phases?.bossChase
  if (chase?.returning) return 'Returning home after boss chase'
  if (chase?.trip && !chase.trip.arrived) return `Realm-hopping to ${eventName(chase.trip.boss)}`
  if (chase?.trip?.respawnAt && chase.trip.respawnAt > now) return `Waiting for spawn - ${eventName(chase.trip.boss)}`
  const exit = state.eventReturn?.participants?.includes(name) ? state.eventReturn : null
  if (exit?.phase === 'evacuating') return `Leaving event - ${eventName(exit.event)}`
  if (exit?.phase === 'checkpoint') return `Returning from event - ${eventName(exit.event)}`
  if (exit?.phase === 'handoff') return 'Resuming hunt'
  switch (state.deferredEventReturns?.[name]?.phase) {
    case 'awaiting-event-handoff':
      return 'Switching event'
    case 'awaiting-reconnect':
      return 'Waiting to reconnect'
    case 'awaiting-event-admission':
      return 'Waiting to rejoin event'
    case 'returning-to-checkpoint':
      return 'Returning from event'
  }
  const characterPhases = phases?.characters[name]
  if (characterPhases?.eventExit) return eventExitActivity(characterPhases.eventExit)
  if (convoy?.walkingActivity === 'event') {
    const event = eventName(convoy.walkingEvent || character.activeEvent || character.joinedEvent)
    // Event walking legs repeat every few seconds on the event map itself
    // (observed live during Graveyard Rising); only a leg to another map is a trip.
    if (convoy.location?.map && convoy.location.map !== character.map) return trip(convoy, `event - ${event}`)
    if (convoy.eventPursuitBossId) return `Chasing event boss - ${event}`
    return `Fighting event - ${event}`
  }
  if (convoy?.walkingActivity === 'event-return' || convoy?.purpose === 'event-return') return 'Returning from event'
  if (convoy?.walkingActivity === 'town-return') return 'Returning to town'
  if (convoy?.walkingActivity === 'anniversary-staging') return trip(convoy, 'Anniversary')
  if (convoy?.purpose === 'anniversary-return') return 'Returning from Anniversary'
  if (convoy?.purpose === 'franky-exit') return "Leaving Franky's map"
  const event = character.activeEvent || character.joinedEvent
  if (event) {
    const skipped = phases?.attendance[name]?.[event]?.ignored
    if (skipped) return `Leaving event - ${eventName(event)} (${skipped})`
    const session = scoped?.eventSession
    if (session?.event === event && !session.live && session.spawnAt && session.spawnAt > now) return `Waiting for spawn - ${eventName(event)}`
    return `Fighting event - ${eventName(event)}`
  }
  if (character.anniversaryState?.busy && character.anniversaryState.stage) return `Anniversary - ${character.anniversaryState.stage}`
  if (character.banking) return 'Banking'
  if (character.bankQueued) return 'Bank queued'
  if (character.stocking) return 'Buying potions'
  if (character.upgrading) return 'Upgrading items'
  if (characterPhases?.farmReunion) {
    const reunion = characterPhases.farmReunion
    return reunion.includes('magiport') ? 'Rejoining party - magiport' : reunion.startsWith('blinking') ? 'Rejoining party - blink' : 'Rejoining party at farm'
  }
  const hunt = state.monsterHunt?.participants?.includes(name) && state.monsterHunt.stage !== 'ended' ? state.monsterHunt : null
  const hunting = hunt && huntActivity(hunt, convoy, monster)
  if (hunting) return hunting
  if (scoped?.achievement) return achievementActivity(character, scoped.achievement, convoy, monster)
  const rare = state.rareHuntState
  switch (rare?.encounter?.stage) {
    case 'approach':
      return `Pursuing rare - ${monster(rare.encounter.mtype)}`
    case 'converge':
      return 'Converging on Phoenix'
    case 'combat':
      return `Fighting rare - ${monster(rare.encounter.mtype)}`
    case 'loot':
      return 'Collecting rare loot'
  }
  if (rare?.patrol?.stage === 'searching') return 'Phoenix patrol - searching'
  if (rare?.patrol?.stage === 'respawn') return 'Phoenix patrol - waiting for respawn'
  const farmMonster = (place: Destination | null | undefined) => (place?.monsterIds?.[0] ? monster(place.monsterIds[0]) : place?.mapName || place?.map || 'farm')
  if (convoy?.purpose === 'hunt-fallback') return `Hunt ended - ${trip(convoy, 'farm')}`
  if (convoy && (farmTrips.has(convoy.purpose || '') || convoy.purpose === 'manual-monster-override' || convoy.walkingActivity === 'farm-recovery'))
    return trip(convoy, `farm - ${farmMonster(convoy.location)}`)
  if (convoy) return trip(convoy, convoy.location?.mapName || convoy.location?.map || convoy.label || 'destination')
  const navigation = character.farmingNavigationDebug
  if (navigation?.cancelled) return 'Waiting - manual stop'
  if (navigation?.town) return 'Returning to town'
  if (navigation?.forceTravel) return 'Travelling to party location'
  if (character.lootStatus?.capacityBlocked) return 'Waiting - inventory full'
  const farm = state.farmAreaState
  if (farm?.paused) return 'Farm travel paused'
  if (farm?.pending) return 'Relocating farm zone'
  if (state.partyFarmingMode === 'scatter' && state.partyFarmingMonsterType) return `Scatter farming - ${monster(state.partyFarmingMonsterType)}`
  if (farm?.active) return `Fighting farm - ${farmMonster(farm.active)}`
  if (job?.target === name) return 'Waiting for merchant'
  return 'Idle'
}
