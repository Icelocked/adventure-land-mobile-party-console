/** Witch's Cipher types and recipe helpers, ported from the console's
 *  runtime/events/october.ts (2db4d763). */
export const cipherIngredients = ['verdantspore', 'frostscale', 'embercoal', 'gloomfeather'] as const
export type Ingredient = (typeof cipherIngredients)[number]

export interface CipherGatheringPlan {
  round: string
  realm: string
  owner: string
  mode: 'gathering' | 'brewing' | 'finished'
  ingredient?: Ingredient
  monster?: string
  reason: 'initial stock' | 'recipe shortage' | 'gathering ended'
  stock: Record<string, number>
  selectedAt: number
}
export interface CipherClue {
  mix: string[]
  right: number
}
export interface CipherBoard {
  live?: boolean
  id?: string
  start?: number
  gather_end?: number
  end?: number
  board?: CipherClue[]
  fit?: string
  mixes?: number
  possible?: number
  cracks?: number
  cracked?: { by: string; recipe: string[] }
}
export interface CipherSettings {
  // The server still accepts this legacy field on import; it no longer controls gathering.
  gatherMinutes?: number
  minClues: number
  automatic: boolean
  gatherMonsters?: string[]
  manual?: { id: string; round: string; cracks: number; mix: string[] }
}
export const defaultCipherSettings: CipherSettings = {
  minClues: 1,
  automatic: true,
  gatherMonsters: ['goo', 'arcticbee', 'plantoid', 'snake'],
}

/** core eventSchedules[witchcipher].cipher (cipher-controls.tsx CipherView). */
export interface CipherView {
  board: CipherBoard | null
  ingredients: { id: string; name: string; sprite?: import('@/models').Sprite | null }[]
  gathering?: [string, string[]][]
  sources?: { ingredient: string; id: string; name: string; sprite?: import('@/models').Sprite | null; rate: number }[]
  stock?: Record<string, number> | null
  gatheringPlan?: CipherGatheringPlan | null
  merchant?: string | null
  runtime?: { phase: string; detail: string; candidates?: number; day?: { mixes_left?: number; server?: string }; journal?: { last?: { action: string; result: unknown } } }
}

export function validMix(mix: unknown): mix is Ingredient[] {
  return Array.isArray(mix) && mix.length === 5 && mix.every((item) => (cipherIngredients as readonly string[]).includes(item))
}

export function cipherScore(a: string[], b: string[]): number {
  return a.reduce((count, name, i) => count + Number(name === b[i]), 0)
}

const recipes = Array.from({ length: 1024 }, (_, n) => Array.from({ length: 5 }, (_, i) => cipherIngredients[Math.floor(n / 4 ** i) % 4] as string))

/** Every recipe that fits the board's clues. `fit` is the server's bitmask
 *  over the 1024 recipes; without it, a board that reports more mixes than
 *  it sent clues has no usable candidates. */
export function cipherCandidates(board: CipherBoard): string[][] {
  const clues = board.board ?? []
  if (clues.some((clue) => !validMix(clue.mix) || !Number.isInteger(clue.right) || clue.right < 0 || clue.right > 5)) return []
  const fit = typeof board.fit === 'string' && /^[0-9a-f]{256}$/i.test(board.fit) ? board.fit : null
  if (!fit && (board.mixes ?? 0) > clues.length) return []
  return recipes.filter(
    (mix, n) => (!fit || ((parseInt(fit[n >> 2], 16) >> (n & 3)) & 1) !== 0) && clues.every((clue) => cipherScore(mix, clue.mix) === clue.right),
  )
}
