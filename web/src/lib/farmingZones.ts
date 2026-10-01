/** Ported verbatim from party-console's dashboard/lib/farming-zones.ts -
 *  pure geometry, no framework dependency. Computes/compares the spawn
 *  "shapes" (rectangles or polygons) a monster's known locations occupy,
 *  used by farmingAreas.ts to cluster multiple monsters' spawn areas into
 *  shared farming zones. */
export interface Point {
  x: number
  y: number
  map?: string
}
export interface Shape {
  boundary?: number[]
  polygon?: number[][]
}
export interface Area extends Shape {
  map: string
  x: number
  y: number
  mapName?: string
  id?: string
  shapes?: Shape[] | null
  allOf?: Area[]
}
export interface Zone extends Area {
  monsterIds: string[]
}
export type Catalog = { id: string; locations?: Area[] }[]

export function polygon(shape: Shape): number[][] {
  if (shape.polygon && shape.polygon.length >= 3) return shape.polygon
  const b = shape.boundary
  return b
    ? [
        [b[0], b[1]],
        [b[2], b[1]],
        [b[2], b[3]],
        [b[0], b[3]],
      ]
    : []
}
export function segmentDistance(p: Point, a: number[], b: number[]): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    d = dx * dx + dy * dy
  const t = d ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / d)) : 0
  return Math.hypot(p.x - a[0] - dx * t, p.y - a[1] - dy * t)
}
export function shapeDistance(shape: Shape, p: Point): number {
  const poly = polygon(shape)
  let inside = false,
    distance = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j]
    distance = Math.min(distance, segmentDistance(p, a, b))
    if (a[1] > p.y !== b[1] > p.y && p.x < ((b[0] - a[0]) * (p.y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? 0 : distance
}
export function distance(area: Area | null | undefined, p: Point | null | undefined): number {
  if (!area || !p || (p.map && p.map !== area.map)) return Infinity
  if (area.allOf) return Math.max.apply(null, area.allOf.map((a) => distance(a, p)))
  const shapes = area.shapes || (area.boundary || area.polygon ? [area] : [])
  if (!shapes.length) return Math.hypot(p.x - area.x, p.y - area.y)
  return Math.min.apply(
    null,
    shapes.map((s) => shapeDistance(s, p)),
  )
}
export function contains(area: Area | null | undefined, p: Point, margin = 0, radius = 400): boolean {
  if (!area || !Number.isFinite(p && p.x) || !Number.isFinite(p && p.y)) return false
  const shaped = area.shapes || area.boundary || area.polygon || area.allOf
  return distance(area, p) <= (shaped ? (margin || 0) + 0.001 : (radius || 400) + (margin || 0))
}
/** Spawn boundaries take precedence; the center radius is used only when empty. */
export function candidates<T extends Point>(area: Area | null, targets: T[], radius = 400): T[] {
  if (!area) return targets
  const bounded = targets.filter((target) => contains(area, target, 0, radius))
  return bounded.length ? bounded : targets.filter((target) => withinRadius(area, target, radius))
}
export function withinRadius(area: Area, target: Point, radius = 400): boolean {
  return (!target.map || target.map === area.map) && Math.hypot(target.x - area.x, target.y - area.y) <= radius
}
export function bounds(area: Area): number[] {
  const points = (area.shapes || [area]).flatMap(polygon)
  return points.length
    ? [
        Math.min.apply(
          null,
          points.map((p) => p[0]),
        ),
        Math.min.apply(
          null,
          points.map((p) => p[1]),
        ),
        Math.max.apply(
          null,
          points.map((p) => p[0]),
        ),
        Math.max.apply(
          null,
          points.map((p) => p[1]),
        ),
      ]
    : [area.x, area.y, area.x, area.y]
}
export function overlap(a: Area, b: Area): boolean {
  const x = bounds(a),
    y = bounds(b)
  if (Math.max(x[0], y[0]) > Math.min(x[2], y[2]) || Math.max(x[1], y[1]) > Math.min(x[3], y[3])) return false
  const pa = (a.shapes || [a]).flatMap(polygon),
    pb = (b.shapes || [b]).flatMap(polygon)
  if (pa.some((p) => contains(b, { x: p[0], y: p[1] })) || pb.some((p) => contains(a, { x: p[0], y: p[1] }))) return true
  function cross(a: number[], b: number[], c: number[]): number {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  }
  for (const sa of a.shapes || [a])
    for (const sb of b.shapes || [b]) {
      const ap = polygon(sa),
        bp = polygon(sb)
      for (let i = 0; i < ap.length; i++)
        for (let j = 0; j < bp.length; j++) {
          const p = ap[i],
            q = ap[(i + 1) % ap.length],
            r = bp[j],
            s = bp[(j + 1) % bp.length]
          if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true
        }
    }
  return false
}
export function id(area: Area): string {
  return JSON.stringify([area.map, area.allOf || area.shapes || area.boundary || [area.x, area.y]])
}
export function zones(catalog: Catalog, ids: string[]): Zone[] {
  const result: Zone[] = []
  for (const monster of catalog || []) {
    if (!ids.includes(monster.id)) continue
    for (const loc of monster.locations || []) {
      if (!loc.map || !Number.isFinite(loc.x) || !Number.isFinite(loc.y)) continue
      const shapes = loc.shapes || (loc.boundary || loc.polygon ? [{ boundary: loc.boundary, polygon: loc.polygon }] : null)
      const area: Zone = Object.assign({}, loc, { shapes, monsterIds: [monster.id] })
      for (let i = result.length - 1; i >= 0; i--) {
        const old = result[i]
        if (old.map === area.map && old.monsterIds[0] === monster.id && shapes && old.shapes && overlap(area, old)) {
          area.shapes = area.shapes!.concat(old.shapes)
          result.splice(i, 1)
          i = result.length
        }
      }
      if (area.shapes) area.boundary = bounds(area)
      area.id = id(area)
      result.push(area)
    }
  }
  return result
}
export function resolve(catalog: Catalog, ids: string[], location: Area | null): Area | null {
  if (!location) return null
  if (location.shapes || location.allOf) return location
  return (
    zones(catalog, ids).find(
      (a) =>
        a.map === location.map &&
        (a.id === location.id ||
          (a.shapes && a.shapes.some((s) => location.boundary && JSON.stringify(s.boundary) === JSON.stringify(location.boundary))) ||
          (a.x === location.x && a.y === location.y) ||
          contains(a, location, 0, 1)),
    ) || location
  )
}
export function searchPoints(area: Area | null): Point[] {
  if (!area) return []
  const box = bounds(area),
    points = [{ map: area.map, x: area.x, y: area.y }]
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++)
      points.push({ map: area.map, x: box[0] + ((box[2] - box[0]) * (x + 0.5)) / 5, y: box[1] + ((box[3] - box[1]) * (y + 0.5)) / 5 })
  return points.filter((p) => contains(area, p, 0, 1))
}
