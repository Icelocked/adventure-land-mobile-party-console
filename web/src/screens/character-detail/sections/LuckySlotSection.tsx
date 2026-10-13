import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { validLuckySlot } from '@/lib/itemActionBanner'
import { aggregateSlotTracking, emptyRolls, luckySlotSearch, normalizeSlotTracking } from '@/lib/luckySlot'
import { SectionCard } from '../SectionCard'
import type { LuckySlotStreams } from '@/models'

/** Lucky-upgrade-slot results. party-console moves automatic upgrades
 *  through the merchant's 42 inventory slots in order and records where
 *  each roll lands, since some AL private-server slots carry a hidden
 *  bonus to upgrade success chance. Console 1.4 adds a per-square position
 *  lock (lucky-slot-tracker.tsx). */
export function LuckySlotSection({
  characterName,
  streams,
  verified,
  lockedSlot,
  resumingSlot,
  open,
  onOpenChange: setOpen,
  localLucky,
}: {
  characterName: string
  streams: LuckySlotStreams
  verified?: number | null
  lockedSlot?: number | null
  // The square an unlock handed back to discovery, until it gets a roll.
  resumingSlot?: number | null
  // Controlled so the inventory's lucky slot can open it too ("Show lucky slot data").
  open: boolean
  onOpenChange: (open: boolean) => void
  localLucky?: unknown
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const tracking = aggregateSlotTracking(streams, localLucky ? normalizeSlotTracking(localLucky) : undefined)
  const search = luckySlotSearch(tracking)
  const nextSlot = validLuckySlot(lockedSlot) ? lockedSlot : validLuckySlot(resumingSlot) ? resumingSlot : validLuckySlot(verified) ? verified : search.nextSlot
  const summary = validLuckySlot(lockedSlot)
    ? `Locked slot: ${lockedSlot}. Rolls continue to accumulate in this position.`
    : validLuckySlot(verified) && !validLuckySlot(resumingSlot)
      ? `Verified slot: ${verified}.`
      : `Next upgrade will test for lucky upgrade · slot ${nextSlot} (inventory position ${nextSlot + 1}).`
  // connected-inventory.tsx onLock: any row unlocks while a lock exists, otherwise it locks that row.
  const [lockError, setLockError] = useState('')
  const onLock = async (slot: number) => {
    setLockError('')
    const result = await api.setLuckySlotLock(characterName, slot, lockedSlot != null)
    if (result.kind === 'failure') return setLockError(result.message)
    await refreshNow()
  }

  return (
    <SectionCard title="Lucky upgrade slot">
      <p className="text-sm text-muted-foreground">{summary}</p>
      <Button variant="link" size="xs" className="mt-1 px-0" onClick={() => setOpen(true)}>
        Show lucky slot data
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <LuckySlotStatistics characterName={characterName} tracking={tracking} search={search} nextSlot={nextSlot} summary={summary} lockedSlot={lockedSlot} lockError={lockError} onLock={onLock} />
        </SheetContent>
      </Sheet>
    </SectionCard>
  )
}

function LuckySlotStatistics({
  characterName,
  tracking,
  search,
  nextSlot,
  summary,
  lockedSlot,
  lockError,
  onLock,
}: {
  characterName: string
  tracking: ReturnType<typeof aggregateSlotTracking>
  search: ReturnType<typeof luckySlotSearch>
  nextSlot: number
  summary: string
  lockedSlot?: number | null
  lockError: string
  onLock: (slot: number) => void
}) {
  const rows = Array.from({ length: 42 }, (_, slot) => {
    const stats = tracking.slots[slot] || emptyRolls()
    return { slot, ...stats, average: stats.totalRolls ? stats.sumRolls / stats.totalRolls : null }
  })
  const sampled = rows.filter((row) => row.totalRolls > 0).length
  const status = (slot: number, totalRolls: number) =>
    [
      slot === lockedSlot ? 'Locked' : slot === nextSlot ? 'Next upgrade' : '',
      search.slots[slot]?.ruledOut ? 'Ruled out' : slot !== lockedSlot && slot !== nextSlot ? (totalRolls ? 'Sampled' : 'Untested') : '',
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <h2 className="text-base font-semibold">Lucky slots · {characterName}</h2>
      <p className="text-xs text-muted-foreground">Upgrade evidence saved per character in coordinator state, with a local copy for reconnects.</p>
      <p className="rounded-md border border-amber-600 bg-amber-950/40 p-2.5 text-amber-200">{summary}</p>
      {lockError && (
        <p role="alert" className="text-sm text-destructive">
          {lockError}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{search.ruledOutCount}/42 slots ruled out.</p>
      <p className="text-xs text-muted-foreground">
        {search.total} recorded upgrade rolls · {sampled}/42 slots sampled.
      </p>
      <p className="text-xs text-muted-foreground">
        {search.slot === null
          ? 'No evidence yet. Testing starts at slot 0.'
          : `${search.inferred ? 'Statistically inferred' : 'Leading candidate'}: slot ${search.slot} · ${(search.confidence * 100).toFixed(2)}% model confidence · ${search.samples} rolls in that slot.`}
      </p>
      <p className="text-xs">
        Normal upgrade jobs test remaining candidates in sequential order, skipping ruled-out slots, and restore inventory afterward. Once a slot is statistically inferred, upgrades use it while evidence continues to accumulate. If confidence drops, sequential discovery resumes. No extra upgrades are queued. Slot numbers start at 0.
      </p>
      <p className="text-xs text-muted-foreground">
        Inference requires at least 100 rolls in the leading slot and 99.9% confidence under the published server model. New evidence can change the selected slot. A slot with at least 100 rolls is ruled out when its ordinary probability reaches 99.9% in the same joint model; new evidence can restore it as a candidate.
      </p>
      <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
        <table className="w-full text-right text-xs">
          <thead className="sticky top-0 bg-card">
            <tr>
              {['Slot', 'Rolls', 'Average', '> 0.963', 'Zero rolls', 'Status', 'Position lock'].map((label) => (
                <th key={label} className="p-1.5 font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.slot}
                data-slot={row.slot}
                className={`border-t border-border ${row.slot === search.slot && search.confidence > 0.95 ? 'bg-green-900 text-green-100' : row.slot === nextSlot ? 'bg-amber-950/40' : ''}`}
              >
                <td className="p-1.5 text-left text-amber-400">{row.slot}</td>
                <td className="p-1.5">{row.totalRolls}</td>
                <td className="p-1.5">{row.average?.toFixed(4) ?? '—'}</td>
                <td className="p-1.5">
                  {row.rollsAbove96_3} ({row.totalRolls ? ((100 * row.rollsAbove96_3) / row.totalRolls).toFixed(1) : '0.0'}%)
                </td>
                <td className="p-1.5">
                  {row.perfectRolls} ({row.totalRolls ? ((100 * row.perfectRolls) / row.totalRolls).toFixed(2) : '0.00'}%)
                </td>
                <td className="p-1.5 text-muted-foreground">{status(row.slot, row.totalRolls)}</td>
                <td className="p-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`${row.slot === lockedSlot ? 'Unlock' : 'Lock'} lucky slot position · slot ${row.slot}`}
                    disabled={validLuckySlot(lockedSlot) && row.slot !== lockedSlot}
                    onClick={() => onLock(row.slot)}
                  >
                    {row.slot === lockedSlot ? 'Unlock' : 'Lock'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
