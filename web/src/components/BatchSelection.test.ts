import { describe, expect, it } from 'vitest'
import { batchActions, type BatchEntry } from './BatchSelection'

// OWNERS-PORT-MAP.md B13: item-selection.tsx BatchItemActions' row rules.

const entry = (name: string, level: number, meta: Record<string, unknown>, extra: Partial<BatchEntry> = {}): BatchEntry =>
  ({ key: `${name}${level}`, slot: level, item: { name, level }, meta: meta as unknown as BatchEntry['meta'], ...extra })
const done = async () => null
const labels = (entries: BatchEntry[]) => batchActions(entries, { onCommand: done, onBank: done, exchangeable: () => true }).map((row) => row.label)

describe('batch actions (B13)', () => {
  it('offers upgrade rows only while every item is below its top level', () => {
    expect(labels([entry('bow', 2, { upgradeable: true }), entry('blade', 4, { upgradeable: true })])).toEqual([
      'Mark selected for bank', 'Auto mark for bank', 'Upgrade each by one level', 'Auto upgrade each by one level', 'Auto exchange',
    ])
    expect(labels([entry('bow', 2, { upgradeable: true }), entry('blade', 13, { upgradeable: true })])).not.toContain('Upgrade each by one level')
  })
  it('needs one level per item name to compound, and marks each name once', async () => {
    const rings = [entry('ring', 1, { compoundable: true }), entry('ring', 1, { compoundable: true }, { key: 'other' })]
    expect(labels(rings)).toContain('Auto compound each by one level')
    expect(labels([...rings, entry('ring', 2, { compoundable: true })])).not.toContain('Auto compound each by one level')
    const sent: unknown[] = []
    const row = batchActions(rings, { onCommand: async (type, e, extra) => (sent.push({ type, key: e.key, extra }), null) }).find((r) => r.label === 'Auto compound each by one level')!
    for (const e of rings) await row.run(e)
    expect(sent).toEqual([{ type: 'auto-compound-mark', key: 'ring1', extra: { targetTier: 2 } }])
  })
  it('turns every row off for a locked or bound item', () => {
    expect(labels([entry('bow', 2, { upgradeable: true }), { ...entry('staff', 1, { upgradeable: true }), item: { name: 'staff', level: 1, l: 'l' } }])).toEqual([])
  })
})
