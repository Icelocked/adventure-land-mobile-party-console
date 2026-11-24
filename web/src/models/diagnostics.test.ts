import { describe, expect, it } from 'vitest'
import { markAlertsRead, parseReadMarks, ringReadFailures } from '@/models'

// OWNERS-PORT-MAP.md B5: the Diagnostics button's read marks and ring read failures.
describe('diagnostics read marks', () => {
  it("reads v1.5.0's number, broken JSON and an empty key as no marks", () => {
    expect(parseReadMarks('1732400000000')).toEqual([])
    expect(parseReadMarks('{not json')).toEqual([])
    expect(parseReadMarks(null)).toEqual([])
    expect(parseReadMarks('["a", 7, "b"]')).toEqual(['a', 'b'])
  })
  it('keeps a mark only while its alert is still saved', () => {
    const alerts = [{ id: 'b', subject: 'Leada', trigger: 'death', at: 1 }, { id: 'c', subject: 'Leada', trigger: 'stuck', at: 2 }]
    expect(markAlertsRead(['a', 'b'], ['c', 'c'], alerts)).toEqual(['b', 'c'])
  })
})

describe('ring read failures', () => {
  it("lists each read-failed incident's error and skips the others", () => {
    expect(ringReadFailures([{ kind: 'read-failed', error: 'boom' }, { kind: 'stuck', id: 'x' }, null])).toEqual(['boom'])
    expect(ringReadFailures(undefined)).toEqual([])
  })
})
