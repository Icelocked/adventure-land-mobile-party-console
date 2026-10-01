/** Ported verbatim from party-console's dashboard/lib/farming-areas.ts. */
import * as zones from './farmingZones'
import type { Area, Catalog, Zone } from './farmingZones'

export type FarmingArea = Zone & { id: string }

/** Stable region anchors, independent of catalog enumeration and rounded labels. */
export function defaultPhoenixOrder(areas: Area[]): string[] {
  const anchors = [
    { map: 'main', x: 641, y: 1803 },
    { map: 'cave', x: -180, y: -1164 },
    { map: 'main', x: -1184, y: 781 },
    { map: 'main', x: 1188, y: -193 },
    { map: 'halloween', x: 8, y: 631 },
  ]
  const order = anchors.map((p) => areas.find((a) => a.map === p.map && zones.contains(a, p, 0, 1))?.id)
  return order.every((id): id is string => !!id) && new Set(order).size === 5 ? order : []
}

const key = (a: Area) => JSON.stringify([a.map, a.shapes || a.boundary || [a.x, a.y]])

export function farmingAreas(catalog: Catalog, ids: string[]): FarmingArea[] {
  const regions = new Map<string, Zone>()
  for (const a of zones.zones(catalog, ids)) {
    const k = key(a),
      existing = regions.get(k)
    if (existing) existing.monsterIds = [...new Set([...existing.monsterIds, ...a.monsterIds])]
    else regions.set(k, a)
  }
  // Closure of rectangular intersections includes regions shared by 3+ types.
  const queue = [...regions.values()]
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]
    for (let j = 0; j < i; j++) {
      const b = queue[j]
      if (a.map !== b.map || !a.boundary || !b.boundary) continue
      const members = [...new Set([...a.monsterIds, ...b.monsterIds])].sort()
      if (members.length <= Math.max(a.monsterIds.length, b.monsterIds.length)) continue
      const box = [
        Math.max(a.boundary[0], b.boundary[0]),
        Math.max(a.boundary[1], b.boundary[1]),
        Math.min(a.boundary[2], b.boundary[2]),
        Math.min(a.boundary[3], b.boundary[3]),
      ]
      if (box[0] >= box[2] || box[1] >= box[3]) continue
      const region: Zone = {
        map: a.map,
        mapName: a.mapName,
        boundary: box,
        x: Math.round((box[0] + box[2]) / 2),
        y: Math.round((box[1] + box[3]) / 2),
        monsterIds: members,
        allOf: [...(a.allOf || [a]), ...(b.allOf || [b])],
      }
      if (!zones.contains(region, region)) {
        const point = zones.searchPoints(region).find((p) => zones.contains(region, p))
        if (!point) continue
        region.x = point.x
        region.y = point.y
      }
      const k = key(region),
        existing = regions.get(k)
      if (!existing) {
        regions.set(k, region)
        queue.push(region)
      } else {
        const union = [...new Set([...existing.monsterIds, ...members])].sort()
        if (union.length > existing.monsterIds.length) {
          const updated = { ...existing, monsterIds: union }
          regions.set(k, updated)
          queue.push(updated)
        }
      }
    }
  }
  return [...regions.values()]
    .map((a) => ({ ...a, id: key(a), monsterIds: a.monsterIds.sort() }))
    .sort(
      (a, b) =>
        b.monsterIds.length - a.monsterIds.length ||
        a.monsterIds.join(',').localeCompare(b.monsterIds.join(',')) ||
        a.map.localeCompare(b.map) ||
        a.x - b.x ||
        a.y - b.y,
    )
}

export function validFarmingLocation(catalog: Catalog, ids: unknown, candidate: unknown): FarmingArea | null {
  if (!validMonsterIds(catalog, ids)) return null
  const location = candidate as { map?: unknown; x?: unknown; y?: unknown } | null | undefined
  return farmingAreas(catalog, ids).find((a) => location && a.map === location.map && a.x === location.x && a.y === location.y) || null
}
function validMonsterIds(catalog: Catalog, ids: unknown): ids is string[] {
  return !(!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !catalog.some((m) => m.id === id)))
}
