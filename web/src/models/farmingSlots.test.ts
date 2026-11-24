import { describe, expect, it } from 'vitest'
import { addonStatusLines, emptyPartyStateDynamic, entryLabel, modePair, resolveFarmingContext, slotPair, type PartyStateDynamic, type SlotEntry } from '@/models'

// OWNERS-PORT-MAP.md B1: the two farming mode controls read the hunting owner's slot pair.

const targets: SlotEntry[] = [
  { mode: 'farming', addon: 'core:target-modes', button: { label: 'Farming', description: '', color: 'sky' } },
  { mode: 'achievement-hunt', addon: 'achievement-hunt', button: { label: 'Achievements', description: '', color: 'rose' },
    status: { title: 'Achievement Hunt status', field: 'achievementMessage', idle: 'Choosing the next monster' } },
]

describe('slot pair (hunting/rules.ts slotPair)', () => {
  it("takes the character's own field, else the party's, else the default", () => {
    expect(slotPair({ combatMode: 'scatter' }, { combatMode: 'default', targetMode: 'hunt' })).toEqual({ combatMode: 'scatter', targetMode: 'hunt' })
    expect(slotPair(undefined, undefined)).toEqual({ combatMode: 'auto', targetMode: 'farming' })
  })
  it('names the pair by its entry labels', () => {
    expect(modePair(entryLabel(targets, 'achievement-hunt'), 'Auto')).toBe('Achievements (Auto)')
    expect(entryLabel(targets, 'gone')).toBe('gone')
  })
})

describe('farming context slot fields (farming-context.ts)', () => {
  const state = (): PartyStateDynamic => ({
    ...emptyPartyStateDynamic(),
    leader: 'Leada',
    followers: { Folla: true },
    combatMode: 'default',
    targetMode: 'hunt',
    farmingProfiles: { Folla: { combatMode: 'scatter' }, Solo: { targetMode: 'achievement-hunt', addonFarming: { 'achievement-hunt': { achievementMessage: 'Farming goo' } } } },
  })
  it("shows a follower's own saved pair and its leader's scope pair", () => {
    const context = resolveFarmingContext(state(), 'Folla')
    expect([context.combatMode, context.targetMode]).toEqual(['scatter', 'farming'])
    expect([context.effectiveCombat, context.effectiveTarget]).toEqual(['default', 'hunt'])
  })
  it("reads the leader's pair from the top-level fields", () => {
    const context = resolveFarmingContext(state(), 'Leada')
    expect([context.combatMode, context.targetMode]).toEqual(['default', 'hunt'])
  })
  it("draws an add-on's status line from its scope store, else its idle words", () => {
    const context = resolveFarmingContext(state(), 'Solo')
    expect(addonStatusLines(targets, context.addonFarming)['achievement-hunt']).toEqual({ title: 'Achievement Hunt status', message: 'Farming goo', color: 'rose' })
    expect(addonStatusLines(targets, {})['achievement-hunt'].message).toBe('Choosing the next monster')
  })
})
