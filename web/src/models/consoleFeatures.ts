import type { PartyStateDynamic } from './state'

/** The stable console fork's features (party-console branch `stable`:
 *  Ryan's v1.4.0 plus Thefonze74065's features) that Ryan's v1.4.0
 *  (b4443e47) lacks. The console has no capabilities route, so each flag
 *  reads a state field only a console with that feature sends. Achievement
 *  Hunt has its own check, consoleHasAchievementHunt in state.ts. */
export interface ConsoleFeatures {
  /** POST /formation {tank}. initial-core.ts always sets `designatedTank`, to
   *  null when no tank is picked, and public-state.ts configFields sends it. */
  designatedTank: boolean
  /** POST /gear-sets (save, equip, clear). initial-core.ts always sets `gearSets`. */
  gearSets: boolean
  /** POST /encounter-mode. hunt/scopes.ts gives every farming profile an
   *  `encounterRoutines` object. */
  frankyRoutine: boolean
  /** POST /realm/boss-chase. initial-core.ts always sets `bossChase`. */
  bossChase: boolean
  /** POST /realm/hop-blacklist. initial-core.ts always sets `realmHopBlacklist`. */
  realmHopBlacklist: boolean
  /** merchant/bank-sort {layout}. merchant/bank-sort.ts always sets `bankSortLayout`. */
  gappedBankSort: boolean
  /** POST /prim-stack. merchant/initial-settings.ts adds the "prim stack"
   *  routine to merchantRoutinePriorities. */
  primStack: boolean
  /** ALData Check (check: true), owned WTB offers first, resolving an
   *  unconfirmed WTB purchase, a typed giveaway host and NPC-sale Keep. No
   *  state field marks these, and v1.4.0 drops `keep` and `check` without an
   *  error, so they gate on the fork's gearSets and bossChase fields both
   *  being present: those ship in the same stable build. */
  forkCommerce: boolean
  /** POST /npc-shop/* (Ponty and Ron orders). The fork's market section
   *  always sends `npcShop` (commerce/npc-shop.ts). */
  npcShop: boolean
}

const isObject = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

export function consoleFeatures(state: PartyStateDynamic): ConsoleFeatures {
  const gearSets = isObject(state.gearSets)
  const bossChase = isObject(state.bossChase)
  return {
    designatedTank: 'designatedTank' in state,
    gearSets,
    frankyRoutine: isObject(state.encounterRoutines) || Object.values(state.farmingProfiles ?? {}).some((profile) => isObject(profile?.encounterRoutines)),
    bossChase,
    realmHopBlacklist: Array.isArray(state.realmHopBlacklist),
    gappedBankSort: typeof state.bankSortLayout === 'string',
    primStack: 'prim stack' in (state.merchantRoutinePriorities ?? {}),
    forkCommerce: gearSets && bossChase,
    npcShop: isObject(state.npcShop),
  }
}
