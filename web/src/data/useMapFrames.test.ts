import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MapFrame } from '@/components/map/mapTypes'
import { subscribeMapFrames } from './useMapFrames'

// A stand-in for the browser EventSource that lets a test push frames.
class FakeSource {
  static OPEN = 1
  static all: FakeSource[] = []
  readyState = 1
  closed = false
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeSource.all.push(this)
  }
  close() {
    this.closed = true
  }
  push(frame: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

const definition = { name: 'zone_ab_0', min_x: 0, max_x: 10, min_y: 0, max_y: 10 }

describe('subscribeMapFrames', () => {
  beforeEach(() => {
    FakeSource.all = []
    ;(globalThis as { EventSource?: unknown }).EventSource = FakeSource
  })
  afterEach(() => {
    delete (globalThis as { EventSource?: unknown }).EventSource
  })

  it('replays the floor definition to a listener that joins an open shared stream', () => {
    // telemetry/map-stream.ts message() sends `definition` only on a subscriber's first frame.
    const first: MapFrame[] = []
    const late: MapFrame[] = []
    const stopFirst = subscribeMapFrames('/s/A', { frame: (f) => first.push(f) })
    const source = FakeSource.all[0]
    source.push({ map: 'zone_ab_0', name: 'A', x: 1, y: 1, entities: [], definition })
    const stopLate = subscribeMapFrames('/s/A', { frame: (f) => late.push(f) })
    expect(FakeSource.all).toHaveLength(1)
    // The late listener hears the cached definition at once, before the next frame.
    expect(late[0]?.definition?.name).toBe('zone_ab_0')
    source.push({ map: 'zone_ab_0', name: 'A', x: 2, y: 2, entities: [] })
    expect(late.at(-1)?.x).toBe(2)
    expect(first.at(-1)?.definition).toBeUndefined()
    stopFirst()
    stopLate()
    expect(source.closed).toBe(true)
  })

  it('drops the cached definition when the character leaves that map', () => {
    const late: MapFrame[] = []
    const stop = subscribeMapFrames('/s/B', { frame: () => {} })
    const source = FakeSource.all[0]
    source.push({ map: 'zone_ab_0', name: 'B', x: 1, y: 1, entities: [], definition })
    source.push({ map: 'main', name: 'B', x: 1, y: 1, entities: [] })
    const stopLate = subscribeMapFrames('/s/B', { frame: (f) => late.push(f) })
    expect(late[0]?.definition).toBeUndefined()
    stop()
    stopLate()
  })
})
