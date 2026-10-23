import { describe, expect, it } from 'vitest'
import { changedComponents, deploymentPending, pendingBuildCount, readyBuild, type ConsoleBuildStatus } from './consoleBuild'

// Cases follow Ryan's console-build-control.tsx and tools/console-build/contracts.ts.

const build = (id: string, createdAt: string, dashboard = 'd') => ({ id, createdAt, sourceHash: `s-${id}`, components: { dashboard, coordinator: 'c', characters: 'k' } })
const status = (fields: Partial<ConsoleBuildStatus>): ConsoleBuildStatus => ({ builds: [build('a', '2026-10-22T01:00:00Z'), build('b', '2026-10-22T02:00:00Z', 'd2')], active: 'a', available: 'b', ...fields })

describe('console builds', () => {
  it('treats every phase but complete and failed as pending', () => {
    expect(['preparing', 'waiting-safe', 'moving-main', 'activating', 'resuming', 'rolling-back'].every((phase) => deploymentPending(phase as never))).toBe(true)
    expect(deploymentPending('complete')).toBe(false)
    expect(deploymentPending('failed')).toBe(false)
  })

  it('offers the available build only when it is not the active one', () => {
    expect(readyBuild(status({}))?.id).toBe('b')
    expect(readyBuild(status({ available: 'a' }))).toBeUndefined()
    expect(readyBuild(status({ available: undefined }))).toBeUndefined()
  })

  it('lists the components that differ from the active build', () => {
    expect(changedComponents(status({}).builds[1], status({}).builds[0])).toEqual(['dashboard'])
    expect(changedComponents(status({}).builds[1], undefined)).toEqual(['dashboard', 'coordinator', 'characters'])
  })

  it('counts builds since deployment from pendingBuildCount, else newer builds, and at least one', () => {
    expect(pendingBuildCount(status({ pendingBuildCount: 4 }))).toBe(4)
    expect(pendingBuildCount(status({}))).toBe(1)
    expect(pendingBuildCount(status({ available: 'a', builds: [build('a', '2026-10-22T01:00:00Z')] }))).toBe(1)
  })
})
