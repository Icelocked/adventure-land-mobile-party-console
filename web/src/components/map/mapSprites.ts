import { cachedMapImage } from './mapRendering'
import type { MapProjectile, MapSpriteLayer } from './mapTypes'

// Console: draw-map-sprites.ts and draw-map-projectile.ts (2db4d763).

type ImageLookup = (url: string) => HTMLImageElement | undefined

// Tinted cells are cached up to 64 cells and 1M pixels, oldest first out.
let tintedPixels = 0
const tintedCells = new Map<string, HTMLCanvasElement>()

function tintedCell(image: HTMLImageElement, layer: MapSpriteLayer) {
  const key = [layer.url, layer.sx, layer.sy, layer.sw, layer.sh, layer.tint].join(':')
  let cell = tintedCells.get(key)
  if (cell) return cell
  cell = document.createElement('canvas')
  cell.width = layer.sw
  cell.height = layer.sh
  const paint = cell.getContext('2d')!
  paint.drawImage(image, layer.sx, layer.sy, layer.sw, layer.sh, 0, 0, layer.sw, layer.sh)
  paint.globalCompositeOperation = 'multiply'
  paint.fillStyle = '#' + layer.tint.toString(16).padStart(6, '0')
  paint.fillRect(0, 0, cell.width, cell.height)
  // destination-in restores the cell's own transparency after the fill.
  paint.globalCompositeOperation = 'destination-in'
  paint.drawImage(image, layer.sx, layer.sy, layer.sw, layer.sh, 0, 0, layer.sw, layer.sh)
  tintedCells.set(key, cell)
  tintedPixels += cell.width * cell.height
  while (tintedCells.size > 64 || tintedPixels > 1048576) {
    const first = tintedCells.keys().next().value!
    const expired = tintedCells.get(first)!
    tintedPixels -= expired.width * expired.height
    tintedCells.delete(first)
  }
  return cell
}

/** Draws up to 32 native sprite layers relative to the current origin and
 *  reports whether any drew, so the caller can fall back to the doll. */
export function drawMapSprites(ctx: CanvasRenderingContext2D, layers: MapSpriteLayer[], lookup: ImageLookup = cachedMapImage): boolean {
  let drawn = false
  for (const layer of layers.slice(0, 32)) {
    const image = lookup(layer.url)
    if (
      !image?.complete ||
      !image.naturalWidth ||
      ![layer.sx, layer.sy, layer.sw, layer.sh, layer.dx, layer.dy, layer.alpha, ...layer.transform].every(Number.isFinite) ||
      layer.sw <= 0 ||
      layer.sh <= 0
    )
      continue
    ctx.save()
    ctx.transform(...layer.transform)
    ctx.globalAlpha *= layer.alpha
    if (layer.tint !== 0xffffff) ctx.drawImage(tintedCell(image, layer), layer.dx, layer.dy)
    else ctx.drawImage(image, layer.sx, layer.sy, layer.sw, layer.sh, layer.dx, layer.dy, layer.sw, layer.sh)
    ctx.restore()
    drawn = true
  }
  return drawn
}

/** Where a projectile is at `now` on the server clock, or null outside its flight. */
export function projectilePose(p: MapProjectile, now: number) {
  if (now < p.startedAt || now >= p.expiresAt) return null
  const progress = (now - p.startedAt) / (p.expiresAt - p.startedAt)
  return {
    progress,
    x: p.x + (p.targetX - p.x) * progress,
    y: p.y + (p.targetY - p.y) * progress,
    frame: p.ray ? 0 : Math.floor((now - p.startedAt) / p.frameMillis) % p.frames,
  }
}

/** Draws one projectile from its observed flight timing. A ray stretches
 *  from source to target and fades; anything else flies toward the target. */
export function drawMapProjectile(ctx: CanvasRenderingContext2D, p: MapProjectile, now: number) {
  const pose = projectilePose(p, now)
  if (!pose) return
  const image = cachedMapImage(p.url)
  if (!image?.complete || !image.naturalWidth) return
  const width = Math.floor(image.naturalWidth / p.frames)
  const height = image.naturalHeight
  if (width < 1 || height < 1) return
  if (p.ray) {
    const dx = p.targetX - p.x
    const dy = p.targetY - p.y
    const length = Math.hypot(dx, dy)
    ctx.save()
    ctx.translate((p.x + p.targetX) / 2, (p.y + p.targetY) / 2)
    ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2)
    ctx.globalAlpha *= 1 - pose.progress
    ctx.drawImage(image, pose.frame * width, 0, width, height, (-width * p.scale) / 2, -length / 2, width * p.scale, length)
    ctx.restore()
    return
  }
  ctx.save()
  ctx.translate(pose.x, pose.y)
  if (p.directional) ctx.rotate(Math.atan2(p.targetY - p.y, p.targetX - p.x) + Math.PI / 2)
  ctx.scale(p.scale, p.scale)
  ctx.drawImage(image, pose.frame * width, 0, width, height, -width / 2, -height, width, height)
  ctx.restore()
}
