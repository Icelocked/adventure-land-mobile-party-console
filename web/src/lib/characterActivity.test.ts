import { describe, expect, it } from 'vitest'
import { characterActivity, type ActivityCharacter, type ActivityState } from './characterActivity'
import type { ActivityPhases, ProfilePhases } from '@/models/activityPhases'

// The cases replay the console fork's e2e/console-card-strip.spec.ts "the
// strip activity follows the coordinator task and phase" journey with the
// same fields.

const names: Record<string, string> = { bbpompom: 'Pom Pom', goo: 'Goo', croc: 'Croc', mrpumpkin: 'Mr. Pumpkin' }
const monster = (id: string) => names[id] || id
const fighters = ['W', 'P']
const missions = [{ target: 'bbpompom' }]
const hunt = (stage: string, message: string) => ({ stage, participants: fighters, missions, currentIndex: 0, target: 'bbpompom', message })
const frozenCave = { map: 'winter_cave', mapName: 'Frozen Cave', monsterIds: ['bbpompom'] }
const eventLeg = (phase: string, walkingEvent: string, map: string) => ({ id: 'convoy-e', phase, label: 'event walking leg', purpose: 'shared-walk', participants: fighters, walkingActivity: 'event', walkingEvent, location: { map } })
const huntConvoy = (phase: string) => ({ id: 'convoy-h', phase, label: 'Monster Hunt: bbpompom', purpose: 'monster-hunt', participants: fighters, location: frozenCave })
const profile = (patch: Partial<ProfilePhases> = {}): ProfilePhases => ({
  monsterHunt: null, activeConvoy: null, farmAreaState: null, combatRecovery: null, eventReturn: null,
  rareHuntState: null, partyFarmingMode: null, partyFarmingMonsterType: null, achievement: null, eventSession: null, ...patch,
})
const phases = (patch: Partial<ActivityPhases> = {}): ActivityPhases => ({ profiles: {}, attendance: {}, characters: {}, bossChase: null, escape: null, dungeon: null, ...patch })
const quiet: ActivityState = { farmAreaState: { active: null }, monsterHunt: null, activeConvoy: null, eventReturn: null, merchantCurrent: null, merchantCharacter: 'M', activityPhases: phases() }
const w = (patch: Partial<ActivityCharacter> = {}): ActivityCharacter => ({ name: 'W', map: 'main', ...patch })
const label = (party: Partial<ActivityState>, character: ActivityCharacter = w()) => characterActivity(character, { ...quiet, ...party }, monster)

describe('characterActivity (console character-activity.ts)', () => {
  it('an event fight stays "Fighting event" through walking legs on the event map', () => {
    const graveyard = w({ map: 'spookytown', activeEvent: 'graveyard', joinedEvent: 'graveyard' })
    const paused = hunt('paused-event', 'Paused for combat event')
    for (const phase of ['scheduled', 'shared-prepare', 'travel'])
      expect(label({ monsterHunt: paused, activeConvoy: eventLeg(phase, 'graveyard', 'spookytown') }, graveyard)).toBe('Fighting event - Graveyard Rising')
    expect(label({ monsterHunt: paused }, graveyard)).toBe('Fighting event - Graveyard Rising')
  })

  it('the event exit reads Leaving, then Returning', () => {
    const waiting = hunt('paused-event', 'Waiting for fresh Main town arrival: W')
    expect(label({ monsterHunt: waiting, eventReturn: { phase: 'evacuating', event: 'graveyard', participants: fighters } }, w({ map: 'spookytown', joinedEvent: 'graveyard' }))).toBe('Leaving event - Graveyard Rising')
    const back = { id: 'c', phase: 'shared-prepare', label: 'event-return walking leg', purpose: 'shared-walk-return', participants: fighters, walkingActivity: 'event-return', location: { map: 'main' } }
    expect(label({ monsterHunt: waiting, activeConvoy: back }, w({ map: 'spookytown' }))).toBe('Returning from event')
  })

  it('travel names its purpose from the first convoy phase, and stays put between legs', () => {
    const travel = hunt('mission-travel', 'Monster Hunt: bbpompom')
    expect(label({ monsterHunt: travel, activeConvoy: huntConvoy('shared-prepare') })).toBe('Regrouping for travel')
    expect(label({ monsterHunt: travel, activeConvoy: huntConvoy('travel') })).toBe('Travelling to Hunt target - Pom Pom')
    expect(label({ monsterHunt: travel, activeConvoy: huntConvoy('travel') }, w({ map: 'winterland' }))).toBe('Travelling to Hunt target - Pom Pom')
    // Between legs the convoy is briefly absent while the stage stays mission-travel.
    expect(label({ monsterHunt: travel }, w({ map: 'winterland' }))).toBe('Travelling to Hunt target - Pom Pom')
    expect(label({ monsterHunt: travel, activeConvoy: huntConvoy('hunt-arrival') }, w({ map: 'winter_cave' }))).toBe('Arriving at Hunt target - Pom Pom')
  })

  it('arrival switches to fighting, and retargets keep it', () => {
    const farming = hunt('farming', 'Monster Hunt: bbpompom')
    expect(label({ monsterHunt: farming }, w({ map: 'winter_cave' }))).toBe('Fighting Hunt target - Pom Pom')
  })

  it('a combat event: regroup, travel to it, then fight it, with the bestiary name', () => {
    const paused = hunt('paused-event', 'Paused for combat event')
    expect(label({ monsterHunt: paused, activeConvoy: eventLeg('shared-prepare', 'mrpumpkin', 'halloween') }, w({ map: 'winter_cave' }))).toBe('Regrouping for travel')
    expect(label({ monsterHunt: paused, activeConvoy: eventLeg('travel', 'mrpumpkin', 'halloween') }, w({ map: 'winterland' }))).toBe('Travelling to event - Mr. Pumpkin')
    expect(label({ monsterHunt: paused, activeConvoy: eventLeg('scheduled', 'mrpumpkin', 'halloween') }, w({ map: 'halloween', activeEvent: 'mrpumpkin', joinedEvent: 'mrpumpkin' }))).toBe('Fighting event - Mr. Pumpkin')
  })

  it('reads the phases activityPhases publishes', () => {
    const pumpkin = w({ map: 'halloween', activeEvent: 'mrpumpkin', joinedEvent: 'mrpumpkin' })
    const now = Date.now()
    expect(characterActivity(pumpkin, { ...quiet, activityPhases: phases({ profiles: { W: profile({ eventSession: { event: 'mrpumpkin', spawnAt: now + 600_000, live: false } }) } }) }, monster, now)).toBe('Waiting for spawn - Mr. Pumpkin')
    expect(label({ activityPhases: phases({ attendance: { W: { mrpumpkin: { ignored: 'death limit', dead: false } } } }) }, pumpkin)).toBe('Leaving event - Mr. Pumpkin (death limit)')
    expect(label({ activityPhases: phases({ escape: { stage: 'blink' } }) })).toBe('Escaping')
    expect(label({ activityPhases: phases({ dungeon: { phase: 'active', participants: fighters, travel: 'travelling', message: null, reviving: null } }) })).toBe('Cave - travelling')
    expect(label({ activityPhases: phases({ bossChase: { trip: { boss: 'franky', realm: 'EUI', arrived: false, respawnAt: null }, returning: false } }) })).toBe('Realm-hopping to Franky')
  })

  it('Achievement Hunt reads its own profile', () => {
    const achievement = (message: string, target: NonNullable<ProfilePhases['achievement']>['target'], activeConvoy: ProfilePhases['activeConvoy'] = null) =>
      phases({ profiles: { W: profile({ achievement: { target, message }, activeConvoy }) } })
    const goo = { id: 'goo', milestone: 100, step: 1 }
    expect(label({ activityPhases: achievement('', null) })).toBe('Achievement Hunt - Acquiring target')
    const spawn = { id: 'convoy-a1', phase: 'travel', label: 'the goo spawn', purpose: 'manual-monster-override', participants: ['W'], location: { map: 'main', monsterIds: ['goo'] } }
    expect(label({ activityPhases: achievement('Farming Goo: 5 / 100 kills (step 1)', goo, spawn) })).toBe('Travelling to achievement target - Goo')
    expect(label({ activityPhases: achievement('Farming Goo: 5 / 100 kills (step 1)', goo) }, w({ monsterAchievementKills: { goo: 5 } }))).toBe('Fighting achievement target - Goo (5/100)')
    expect(label({ activityPhases: achievement('Waiting: P is dead', goo) })).toBe('Waiting - P is dead')
  })

  it('death, idle, Pause and a clean shutdown', () => {
    expect(label({}, w({ rip: true }))).toBe('Dead')
    expect(label({})).toBe('Idle')
    const control = { paused: true, pausedAt: 1, resume: null, shutdown: null, log: [] }
    expect(label({ consoleControl: control }, w({ rip: true }))).toBe('Paused')
    expect(label({ consoleControl: { ...control, shutdown: { phase: 'draining', requestedAt: 1, hold: null, waiting: [], command: '', directory: '' } } })).toBe('Holding still for shutdown')
  })

  it('the merchant: a job with its bank stage, then a fishing trip while the next job waits', () => {
    const m = { name: 'M', map: 'main' }
    expect(label({ merchantCurrent: { id: 'j1', target: 'M', reason: 'auto compound', routine: 'auto compound', phase: 'processing', operationStage: 'retrieving' } }, m)).toBe('Auto compound - bank retrieval')
    expect(label({ gatheringModes: ['fishing'], merchantCurrent: { id: 'j2', target: 'M', reason: 'deconstruction', routine: 'deconstruction', phase: 'assigned' } }, { ...m, gatheringPhase: 'travelling' })).toBe('Fishing - travelling')
  })

  it('a farm trip names the farm monster', () => {
    const relocate = { id: 'c', phase: 'travel', purpose: 'farm-relocation', participants: fighters, location: { map: 'main', monsterIds: ['croc'] } }
    expect(label({ activeConvoy: relocate })).toBe('Travelling to farm - Croc')
    expect(label({ farmAreaState: { active: { map: 'main', monsterIds: ['croc'] } } })).toBe('Fighting farm - Croc')
  })
})
