import { describe, expect, it } from 'vitest'
import { emptyPartyStateDynamic, resolveFarmingContext, characterOnline, type PartyStateDynamic } from '@/models'
import { npcSaleLine } from './npcSaleLine'
import { conflictingItems } from './ruleConflicts'
import { caveVisitCurrent } from './caveVisit'
import { dungeonEntryLabel } from '@/data/useDailyDungeon'
import type { DungeonView } from '@/models/dungeon'

// The owners release's wire, as OWNERS-PORT-MAP.md rows A2, A5, A6, A10, A15 and A16 list it.

describe('NPC sale line (A10, U3)', () => {
  it('names the bag-change wait for a retrying sale, as inventory-panel.tsx does', () => {
    expect(npcSaleLine({ state: 'retrying', error: 'NPC refused' })).toBe('NPC sale: retrying · NPC refused · Retries when the merchant bag changes')
  })
  it('shows a queued sale with no wait', () => {
    expect(npcSaleLine({})).toBe('NPC sale: queued')
  })
})

describe('farming context (A5, A6)', () => {
  const state = (): PartyStateDynamic => ({
    ...emptyPartyStateDynamic(),
    leader: 'Leada',
    followers: { Folla: true, Merch: true },
    merchantCharacter: 'Merch',
    farmingPolicy: 'hunt',
    monsterHunt: { phase: 'leader-scope' } as unknown as PartyStateDynamic['monsterHunt'],
    farmingProfiles: { Solo: { farmingPolicy: 'hunt' }, Merch: { farmingPolicy: 'auto' } },
    farmingLive: {
      Solo: { monsterHunt: { phase: 'solo-live' } as never, farmAreaState: { message: 'solo area' } },
      Merch: { monsterHunt: null },
    },
  })

  it("reads a scope's Hunt and farm area from core's farmingLive", () => {
    const context = resolveFarmingContext(state(), 'Solo')
    expect((context.hunt as { phase?: string } | null)?.phase).toBe('solo-live')
    expect(context.farmArea?.message).toBe('solo area')
  })
  it('keeps the merchant in its own scope despite a saved follower mark (tasks/rules.ts scopeOwner)', () => {
    const context = resolveFarmingContext(state(), 'Merch')
    expect(context.owner).toBe('Merch')
    expect(context.followingLeader).toBeUndefined()
    expect(context.hunt).toBeNull()
  })
  it('a follower still resolves to the leader scope', () => {
    expect(resolveFarmingContext(state(), 'Folla').owner).toBe('Leada')
  })
})

describe('presence (A2)', () => {
  it("answers the coordinator's online flag, not the phone's clock against seenAt", () => {
    expect(characterOnline({ seenAt: Date.now(), online: false })).toBe(false)
    expect(characterOnline({ seenAt: 1, online: true })).toBe(true)
    expect(characterOnline(undefined)).toBe(false)
  })
})

describe('incompatible rules (A15)', () => {
  it("answers core's incompatibleRules rows", () => {
    const rows = [{ item: { name: 'wbook0', level: 0 }, actions: ['NPC sale', 'Stand sale'] }]
    expect(conflictingItems({ ...emptyPartyStateDynamic(), incompatibleRules: rows })).toEqual(rows)
    expect(conflictingItems(emptyPartyStateDynamic())).toEqual([])
  })
})

describe('Cave visit (A16)', () => {
  const now = 1_000_000
  it('stays current until its reset passes (hunting/rules.ts caveVisitCurrent)', () => {
    expect(caveVisitCurrent({ checkedAt: now - 120_000, resets: now + 60_000 }, now)).toBe(true)
    expect(caveVisitCurrent({ checkedAt: now - 120_000, resets: now - 1 }, now)).toBe(false)
    expect(caveVisitCurrent({ checkedAt: now, resets: now - 1 }, now)).toBe(true)
  })
  it('labels a two-minute-old check by its reset', () => {
    const view = { members: [{ name: 'A', fresh: true, observation: { supported: true, visit: { checkedAt: now - 120_000, resets: now + 60_000, available: false } } }] } as unknown as DungeonView
    expect(dungeonEntryLabel(view, now)).toBe('Next entry: 0h 1m 0s')
  })
})
