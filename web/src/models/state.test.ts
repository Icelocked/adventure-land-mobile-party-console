import { describe, expect, it } from 'vitest'
import { consoleHasAchievementHunt, emptyPartyStateDynamic, resolveFarmingContext, type AchievementHuntSettings, type PartyStateDynamic } from './state'

// Console hunt/achievement-settings.ts defaultAchievementHuntSettings.
const defaults: AchievementHuntSettings = { monsters: [], blacklistDeaths: true, deathThreshold: 6, fillIdle: true, fillSelectedOnly: true, bossRecheckMinutes: 10 }

// Ryan's v1.4.0 public state: no achievementHunt field at the top level or in any farming profile.
const v140State = (): PartyStateDynamic => ({
  ...emptyPartyStateDynamic(),
  leader: 'Leada',
  followers: { Folla: true },
  farmingPolicy: 'hunt',
  farmingProfiles: { Solo: { farmingPolicy: 'default' } },
})

// A console with Achievement Hunt (upstream PR #131): the top-level settings
// for the leader scope, and one per farming profile (hunt/scopes.ts).
const ahState = (): PartyStateDynamic => ({
  ...v140State(),
  achievementHunt: { ...defaults, monsters: ['goo'] },
  farmingProfiles: { Solo: { farmingPolicy: 'default', achievementHunt: { ...defaults, monsters: ['bee'] } } },
})

describe('consoleHasAchievementHunt / resolveFarmingContext achievementSettings', () => {
  it('a v1.4.0 state has no Achievement Hunt and resolves no settings for any scope', () => {
    const state = v140State()
    expect(consoleHasAchievementHunt(state)).toBe(false)
    for (const name of ['Leada', 'Folla', 'Solo']) expect(resolveFarmingContext(state, name).achievementSettings).toBeUndefined()
  })

  it('an Achievement Hunt console resolves the leader scope for the leader and followers, and the profile for an independent character', () => {
    const state = ahState()
    expect(consoleHasAchievementHunt(state)).toBe(true)
    expect(resolveFarmingContext(state, 'Leada').achievementSettings?.monsters).toEqual(['goo'])
    expect(resolveFarmingContext(state, 'Folla').achievementSettings?.monsters).toEqual(['goo'])
    expect(resolveFarmingContext(state, 'Solo').achievementSettings?.monsters).toEqual(['bee'])
  })

  it('a farming profile alone does not enable Achievement Hunt; the top-level object is the signal', () => {
    const state = { ...ahState(), achievementHunt: undefined }
    expect(consoleHasAchievementHunt(state)).toBe(false)
    expect(resolveFarmingContext(state, 'Solo').achievementSettings).toBeUndefined()
    expect(consoleHasAchievementHunt({ achievementHunt: null })).toBe(false)
  })
})
