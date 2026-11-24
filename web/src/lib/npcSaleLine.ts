import type { NpcSaleMark } from '@/models'

/** The NPC sale line under an inventory item (console inventory-panel.tsx). A failed sale waits
 *  for the merchant's bag to change, not for a time (console items/coordinator/market.ts
 *  `failNpcSales`), so a retrying mark names that wait. */
export function npcSaleLine(sale: Pick<NpcSaleMark, 'state' | 'error'>): string {
  return [`NPC sale: ${sale.state || 'queued'}`, sale.error, sale.state === 'retrying' ? 'Retries when the merchant bag changes' : null].filter(Boolean).join(' · ')
}
