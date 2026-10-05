/** Which data domains each action can change; after an action the
 *  provider refreshes exactly these. Keep in step with the console's
 *  dashboard/features/party/query-actions.ts on each release. */
export type Domain = 'core' | 'config' | 'fast' | 'inventory' | 'logs' | 'bank' | 'market' | 'catalog' | 'mail'

// 'config' (rules/marks/settings) accompanies 'core' (live state) in every
// group: most actions change settings, and without refreshing config the
// user's change looks stale until the next config poll.
const core = ['core', 'config'] as const
const inventory = ['core', 'config', 'inventory', 'fast'] as const
const commerce = ['core', 'config', 'inventory', 'fast', 'bank', 'market'] as const
export const actionDomains = {
  '/daily-dungeons': core,
  '/merchant/bank-sort': core,
  '/config': core,
  '/formation': core,
  '/focus': core,
  '/farming-mode': core,
  '/hunt-blacklist': core,
  '/hunt-settings': core,
  '/rare-hunting': core,
  '/navigate-to-monster': core,
  '/town-party': core,
  '/restock': core,
  '/escape': core,
  '/bank-party': ['core', 'config', 'bank'],
  '/realm/switch': inventory,
  '/steam/action': inventory,
  '/steam/recover': inventory,
  '/roster/create': core,
  '/bankbois/create': ['core', 'config', 'bank'],
  '/bank/unlock': ['bank', 'core', 'config'],
  '/merchant/clear': core,
  '/merchant/force-stand': core,
  '/merchant/stand-location': core,
  '/merchant/gather': core,
  '/merchant/job/cancel': commerce,
  '/merchant/job/retry': commerce,
  '/merchant/routine-priorities': core,
  '/merchant/blacklist': core,
  '/merchant/stale-orders/clear': commerce,
  '/merchant/activity/clear': ['logs'],
  '/merchant/auto-npc-sale': core,
  '/merchant/rule-conflict': commerce,
  '/deconstruction/mark': core,
  '/deconstruction/auto': core,
  '/merchant/auto-stand': core,
  '/merchant/stand': commerce,
  '/merchant/bid': commerce,
  '/merchant/native-stand': commerce,
  '/merchant/npc-sale': commerce,
  '/merchant/order': commerce,
  '/merchant/exchange-order': commerce,
  '/merchant/aldata-order': commerce,
  '/merchant/aldata-sale': commerce,
  '/merchant/ponty-order': commerce,
  '/merchant/donate': inventory,
  '/merchant/join-giveaway': inventory,
  '/merchant/send-mail': [...commerce, 'mail'],
  '/mail/collect': ['mail', 'inventory', 'config', 'bank', 'core'],
  '/mail/delete': ['mail'],
  '/mail/refresh': ['mail'],
  '/aldata/key': core,
  '/aldata/refresh': ['market', 'core', 'config'],
  '/anniversary/chat-advertise': core,
} satisfies Record<string, readonly Domain[]>

export function affectedDomains(path: string, body?: unknown): readonly Domain[] {
  if (path === '/command') {
    const type = (body as { type?: string } | undefined)?.type || ''
    if (type === 'withdraw') return commerce
    return /travel|town|gold-target/.test(type) ? core : inventory
  }
  if (/^\/slots\/\d+\/(spawn|logout)$/.test(path)) return inventory
  if (/^\/bankbois\/[^/]+\/delete$/.test(path)) return ['core', 'config', 'bank']
  if (/^\/combat-log\/[^/]+\/clear$/.test(path)) return ['logs']
  // Routes not mapped above fall back to core + config.
  return actionDomains[path as keyof typeof actionDomains] ?? core
}

/** Fired on window after every POST through PartyApiClient.post, so the
 *  provider can refresh what the action touched. */
export const PARTY_ACTION_EVENT = 'party-action'
export interface PartyActionDetail {
  path: string
  body: unknown
}
