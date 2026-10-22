import { describe, expect, it } from 'vitest'
import { drawMapSprites, projectilePose } from './mapSprites'
import type { MapProjectile, MapSpriteLayer } from './mapTypes'

// Cases follow the console's dashboard/features/party/draw-map-sprites.ts and
// draw-map-projectile.ts (2db4d763). The projectile mirrors a live
// map-stream frame read on 2026-10-22.

const projectile: MapProjectile = {
  ray: false,
  id: 'WlJ603',
  url: 'https://adventure.land/images/sprites/animations/magic2.png',
  frames: 4,
  frameMillis: 9,
  scale: 1,
  directional: true,
  startedAt: 1000,
  expiresAt: 1800,
  x: 0,
  y: 0,
  targetX: 80,
  targetY: -40,
}

describe('projectilePose', () => {
  it('draws nothing before launch or after expiry', () => {
    expect(projectilePose(projectile, 999)).toBeNull()
    expect(projectilePose(projectile, 1800)).toBeNull()
  })

  it('moves linearly along the observed flight and cycles atlas frames', () => {
    expect(projectilePose(projectile, 1400)).toEqual({ progress: 0.5, x: 40, y: -20, frame: Math.floor(400 / 9) % 4 })
  })

  it('keeps a ray on frame 0', () => {
    expect(projectilePose({ ...projectile, ray: true }, 1400)?.frame).toBe(0)
  })
})

type Call = [string, ...unknown[]]
function fakeContext() {
  const calls: Call[] = []
  const ctx = new Proxy(
    { globalAlpha: 1 },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target]
        return (...args: unknown[]) => calls.push([String(key), ...args])
      },
      set(target, key, value) {
        ;(target as Record<string, unknown>)[key as string] = value
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const layer = (overrides: Partial<MapSpriteLayer> = {}): MapSpriteLayer => ({
  url: 'sheet.png',
  sx: 0,
  sy: 0,
  sw: 26,
  sh: 36,
  dx: -13,
  dy: -36,
  transform: [1, 0, 0, 1, 0, 0],
  alpha: 1,
  tint: 0xffffff,
  ...overrides,
})
const image = { complete: true, naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement

describe('drawMapSprites', () => {
  it('draws each untinted layer at its own transform and atlas cell', () => {
    const { ctx, calls } = fakeContext()
    expect(drawMapSprites(ctx, [layer({ transform: [-1, 0, 0, 1, 4, 0] })], () => image)).toBe(true)
    expect(calls).toEqual([['save'], ['transform', -1, 0, 0, 1, 4, 0], ['drawImage', image, 0, 0, 26, 36, -13, -36, 26, 36], ['restore']])
  })

  it('skips a layer whose sheet has not loaded or whose cell is invalid', () => {
    const { ctx, calls } = fakeContext()
    expect(drawMapSprites(ctx, [layer({ sw: 0 }), layer({ dx: Number.NaN })], () => image)).toBe(false)
    expect(drawMapSprites(ctx, [layer()], () => undefined)).toBe(false)
    expect(calls).toEqual([])
  })

  it('draws at most 32 layers', () => {
    const { ctx, calls } = fakeContext()
    drawMapSprites(ctx, Array.from({ length: 40 }, () => layer()), () => image)
    expect(calls.filter(([name]) => name === 'drawImage')).toHaveLength(32)
  })
})
