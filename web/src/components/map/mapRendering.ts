import { sanitizeDollHtml } from '@/lib/safeHtml'
import type { DollLayer, MapDefinition, MapFrame, MapPlacement } from './mapTypes'

// Console: map-render-buffer.ts, cropped-tile.ts, marker-style.ts, dreams-gate.ts.
export type MapRenderBuffer = {
  frame: MapFrame | null
  previous: MapFrame | null
  receivedAt: number
}
export function receiveMapFrame(buffer: MapRenderBuffer, next: MapFrame, receivedAt: number, now: number) {
  const previous = buffer.frame?.map === next.map ? buffer.frame : null
  next.events = [...(previous?.events || []).filter((event) => now - event.at < 1100), ...(next.events || [])].slice(-80)
  Object.assign(buffer, { frame: next, previous, receivedAt })
}
export function drawDue(now: number, last: number, fps?: number) {
  return !fps || now - last >= 1000 / fps - 0.01
}
export function prepareMap(definition: MapDefinition) {
  const prepare = (placement: MapPlacement) => {
    const tile = definition.tiles[placement[0]]
    const width = tile?.[3] || 1,
      height = tile?.[4] || width
    return {
      placement,
      width,
      height,
      left: Math.min(placement[1], placement[3] ?? placement[1]),
      right: Math.max(placement[1], placement[3] ?? placement[1]),
      top: Math.min(placement[2], placement[4] ?? placement[2]),
      bottom: Math.max(placement[2], placement[4] ?? placement[2]),
    }
  }
  return {
    placements: definition.placements.map(prepare),
    groups: definition.groups.map((group) => ({
      y: Math.max(...group.map((v) => v[2] + (definition.tiles[v[0]]?.[4] || definition.tiles[v[0]]?.[3] || 0))),
      placements: group.map(prepare),
    })),
  }
}
export type PreparedPlacement = ReturnType<typeof prepareMap>['placements'][number]
export function visibleTiles(p: PreparedPlacement, left: number, top: number, right: number, bottom: number) {
  if (p.right + p.width < left || p.left > right || p.bottom + p.height < top || p.top > bottom) return null
  return {
    left: p.left + Math.max(0, Math.ceil((left - p.width - p.left) / p.width)) * p.width,
    top: p.top + Math.max(0, Math.ceil((top - p.height - p.top) / p.height)) * p.height,
    right: Math.min(p.right, right),
    bottom: Math.min(p.bottom, bottom),
  }
}

// On a debug instance, game images come from its local copy.
let debugAssetsBase: string | null = null
export function setLocalDebugAssets(base: string | null) {
  debugAssetsBase = base
}
function gameImageUrl(url: string) {
  if (debugAssetsBase === null || !url.startsWith('https://adventure.land/images/')) return url
  return `${debugAssetsBase}/debug-assets${url.slice('https://adventure.land'.length)}`
}
const mapImages = new Map<string, HTMLImageElement>()
export function cachedMapImage(source: string) {
  const url = gameImageUrl(source)
  let image = mapImages.get(url)
  if (!image && typeof window !== 'undefined') {
    image = new Image()
    image.src = url
    mapImages.set(url, image)
  }
  return image
}

const croppedTileCache = new Map<string, HTMLCanvasElement>()
export function croppedTile(image: HTMLImageElement, url: string, x: number, y: number, width: number, height: number) {
  const key = `${url}:${x}:${y}:${width}:${height}`
  let tile = croppedTileCache.get(key)
  if (!tile) {
    tile = document.createElement('canvas')
    tile.width = width
    tile.height = height
    const context = tile.getContext('2d')
    if (context) {
      context.imageSmoothingEnabled = false
      context.drawImage(image, x, y, width, height, 0, 0, width, height)
    }
    croppedTileCache.set(key, tile)
  }
  return tile
}

// The doll markup is sanitized first (lib/safeHtml.ts): it can come from any
// player in view, and innerHTML would run an inline handler.
const dollLayerCache = new Map<string, DollLayer[]>()
export function dollLayers(html: string) {
  const cached = dollLayerCache.get(html)
  if (cached) return cached
  const host = document.createElement('div')
  host.innerHTML = sanitizeDollHtml(html)
  const layers = Array.from(host.querySelectorAll('img')).map((img) => {
    const parent = img.parentElement as HTMLElement
    const px = (value: string) => Number.parseFloat(value || '0') || 0
    return {
      url: img.src,
      left: px(parent.style.left),
      bottom: px(parent.style.bottom),
      width: px(parent.style.width),
      height: px(parent.style.height),
      imageWidth: px(img.style.width),
      imageHeight: px(img.style.height),
      marginLeft: px(img.style.marginLeft),
      marginTop: px(img.style.marginTop),
    }
  })
  dollLayerCache.set(html, layers)
  if (dollLayerCache.size > 64) dollLayerCache.delete(dollLayerCache.keys().next().value!)
  return layers
}

export interface Marker {
  role?: string
  state?: string
}
/** Explicit roles keep scatter targets red and preserve invisible grouped ranks. */
export function markerStyle(marker: Marker, index = 0) {
  const role = marker.role || (marker.state === 'scatter' ? 'current' : ['current', 'next', 'third'][index])
  return { color: role === 'current' ? 0xef4444 : 0xfacc15, css: role === 'current' ? '#ef4444' : '#facc15', double: role === 'third' }
}

// The native dreams_gate composite at 120 ms cadence.
export function drawDreamsGate(ctx: CanvasRenderingContext2D, tilesets: Record<string, { file: string }>, now: number) {
  const piece = (sheet: string, sx: number, sy: number, w: number, h: number, x: number, y: number) => {
    const image = cachedMapImage(tilesets[sheet]?.file || '')
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, sx, sy, w, h, x, y, w, h)
  }
  const stone = (x: number, y: number, w: number, h: number, left: boolean, right: boolean, sx = 224) => {
    const l = left ? 4 : 0,
      r = right ? 4 : 0
    piece('dungeon', sx + l, 176, w - l - r, 4, x + l, y)
    piece('dungeon', sx, 180, w, h - 4, x, y + 4)
    if (left) piece('dungeon', 226, 130, 4, 4, x, y)
    if (right) piece('dungeon', 266, 130, 4, 4, x + w - 4, y)
  }
  for (const side of [-1, 1]) {
    for (let y = -24; y < 8; y += 8) {
      const sx = 224 + (y % 16 === 0 ? 0 : 8),
        x = side < 0 ? -32 : 24
      if (y === -24) stone(x, y, 8, 8, side < 0, side > 0, sx)
      else piece('dungeon', sx, 176, 8, 8, x, y)
    }
    for (let y = -32; y < 8; y += 8) piece('dungeon', 224, 184, 8, 8, side < 0 ? -24 : 16, y)
    stone(side < 0 ? -24 : 8, -40, 16, 16, side < 0, side > 0)
    stone(side < 0 ? -16 : 0, -48, 16, 16, side < 0, side > 0)
  }
  stone(-8, -52, 16, 8, true, true)
  for (const x of [-30, 17]) piece('outside', 736, 560, 16, 32, x, -43)
  piece('outside', 736, 560, 16, 32, -8, -60)
  const frame = Math.floor(now / 120)
  portal(ctx, frame)
  ;[-48, 32].forEach((x, i) => {
    piece('dungeon', 16, 304, 16, 32, x, -12)
    piece('custom_a', ((frame + i) % 3) * 16, 0, 16, 16, x, -12)
  })
}
function portal(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.fillStyle = '#222638'
  ctx.beginPath()
  const points = [[-16, 0], [-16, -24], [-12, -24], [-12, -32], [-6, -32], [-6, -36], [6, -36], [6, -32], [12, -32], [12, -24], [16, -24], [16, 0]]
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#30354d'
  ctx.fillRect(-14, -22, 2, 22)
  ctx.fillRect(12, -22, 2, 22)
  for (let i = 0; i < 16; i++) {
    const x = ((i * 17 + frame) % 26) - 13,
      y = -30 + ((i * 11 + frame) % 28)
    if (y < -24 && Math.abs(x) > 6) continue
    ctx.fillStyle = ['#729d9e', '#a7d3d0', '#686c9c', '#d8ebcf'][(i + frame) % 4]
    ctx.fillRect(x, y, 1, 1)
  }
}
