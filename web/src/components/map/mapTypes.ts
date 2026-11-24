import type { Sprite } from '@/models'

// Console: map-tile.ts, map-placement.ts, map-definition.ts, map-entity.ts, map-event.ts, map-frame.ts.
export type MapTile = [string, number, number, number, number?]
export type MapPlacement = [number, number, number, number?, number?]

export type MapDefinition = {
  name: string
  min_x: number
  min_y: number
  max_x: number
  max_y: number
  default?: number | null
  tiles: MapTile[]
  placements: MapPlacement[]
  groups: MapPlacement[][]
  tilesets: Record<string, { file: string }>
  decorations?: { kind: 'dreams_gate'; x: number; y: number }[]
}

export type MapEntity = {
  id: string
  name: string
  type: string
  ctype?: string | null
  mtype?: string | null
  x: number
  y: number
  hp: number
  max_hp: number
  mp: number
  max_mp: number
  moving?: boolean
  target?: string | null
  sprite?: Sprite | null
  direction?: number
  going_x?: number
  going_y?: number
  dollHtml?: string | null
  stand?: string | boolean | null
  standSprite?: Sprite | null
  weapons?: { hand: string; name: string; sprite: Sprite | null }[]
  // Native sprite layers captured from the game client; they replace the doll, weapons and stand.
  layers?: MapSpriteLayer[]
}

// Console: runtime/map-sprites.ts. One atlas cell drawn under a 2D transform.
export type MapSpriteLayer = {
  url: string
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  transform: [number, number, number, number, number, number]
  alpha: number
  tint: number
}
export type MapVisual = { id: string; x: number; y: number; layers: MapSpriteLayer[] }
export type MapProjectile = {
  ray?: boolean
  id: string
  url: string
  frames: number
  frameMillis: number
  scale: number
  directional: boolean
  startedAt: number
  expiresAt: number
  x: number
  y: number
  targetX: number
  targetY: number
}

export type MapEvent = {
  kind: string
  at: number
  data: Record<string, string | number | boolean | unknown[]>
}

export type MapFrame = {
  name: string
  map: string
  definition?: MapDefinition
  at: number
  x: number
  y: number
  target?: string | null
  grouped?: boolean
  eventCombat?: boolean
  queueRevision?: string | null
  queue?: { id: string; map: string; in?: string | number; state?: string; role?: string; server?: string; radius?: number; visible?: boolean }[]
  entities: MapEntity[]
  events?: MapEvent[]
  // Server clock for projectile timing; `at` stands in when it is absent.
  projectilesAt?: number
  projectiles?: MapProjectile[]
  visuals?: MapVisual[]
}

export type DollLayer = {
  url: string
  left: number
  bottom: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  marginLeft: number
  marginTop: number
}
