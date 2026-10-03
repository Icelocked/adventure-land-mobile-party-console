/** runtime/dungeons/contracts.ts - the wire shapes GET/POST /daily-dungeons
 *  returns (DungeonView), copied for the fields the dashboard reads. */
export interface PriestRecoveryAssignment {
  id: string
  run: string
  priest: string
  target: string
  authorized: boolean
}
export interface PriestRecoveryObservation {
  actor: { ctype?: string; hp?: number; max_hp?: number; mp?: number; max_mp?: number; c?: Record<string, unknown> }
  essence: boolean
  id?: string
  target?: string
  phase: 'idle' | 'healing' | 'waiting' | 'ready' | 'dispatched' | 'reviving' | 'uncertain' | 'failed' | 'complete'
  reason?: string
}
export interface CavePoint {
  room?: string
  kind?: string
  id: string
  label: string
  map: string
  x: number
  y: number
  locked?: boolean
  done?: boolean
  exit?: boolean
  down?: boolean
  to?: string
  required?: boolean
}
export interface CaveChoice {
  resultLabel?: string
  summary?: string[]
  id: string
  title: string
  text: string
  deadline: number
  resolved: boolean
  votes: Record<string, string>
  options: { id: string; label: string; unavailable?: string; cost?: number; amber?: number }[]
  shop?: { room: string; name: string; price: number; sold: boolean; nearby: boolean }
}
export interface CaveObservation {
  protocol: 1
  at: number
  supported: boolean
  alive: boolean
  ready: boolean
  members: string[]
  leader?: string
  visitError?: string
  visit?: {
    available: boolean
    resets: number
    home: string
    resume?: { server: string; run?: string }
    checkedAt: number
  }
  cave: {
    run: string
    floor: number
    expires: number
    remainingMs: number
    paused: boolean
    gold: number
    amber: number
    points: CavePoint[]
    choice?: CaveChoice
  } | null
  recovery?: PriestRecoveryObservation
  keeper?: { map: string; x: number; y: number }
  action?: { id: string; status: 'dispatched' | 'complete' | 'uncertain' | 'failed'; error?: string }
}
export interface DungeonState {
  travel?: { target: CavePoint; origin: CavePoint; stage: 'assembling' | 'travelling'; serial: number; repairs?: number }
  progress?: { enabled: boolean; target?: string; floor?: number; serial: number; message?: string }
  protectFromEvents: boolean
  participants: string[]
  phase: 'idle' | 'gathering' | 'entering' | 'active' | 'exiting' | 'held'
  run?: string
  server?: string
  commands: Record<string, { action: string }>
  error?: string
  priestRecovery?: PriestRecoveryAssignment
  manualRecovery?: boolean
}
export interface DungeonView {
  state: DungeonState
  members: { name: string; fresh: boolean; observation?: CaveObservation }[]
}
