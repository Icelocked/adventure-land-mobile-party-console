import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { aggregateSlotTracking, emptyRolls, luckySlotSearch, normalizeSlotTracking } from '@/lib/luckySlot'
import { SectionCard } from '../SectionCard'
import type { LuckySlotStreams } from '@/models'

/** Lucky-upgrade-slot testing/results - ported from lucky-slot-tracker.tsx.
 *  party-console rotates automatic upgrades through the merchant's 42
 *  inventory slots and records where each roll lands, since some AL
 *  private-server slots carry a hidden bonus to upgrade success chance;
 *  this was previously entirely invisible in the PWA - you could see that
 *  testing was happening (upgrade marks moving between slots) with no way
 *  to see what it had actually found. */
export function LuckySlotSection({
  characterName,
  streams,
  verified,
  open,
  onOpenChange: setOpen,
  localLucky,
}: {
  characterName: string
  streams: LuckySlotStreams
  verified?: number | null
  // Controlled so the inventory's lucky slot can open it too (lucky-slot-menu.tsx "Show lucky slot data").
  open: boolean
  onOpenChange: (open: boolean) => void
  localLucky?: unknown
}) {
  const tracking = aggregateSlotTracking(streams, (localLucky ? normalizeSlotTracking(localLucky) : undefined) as Parameters<typeof aggregateSlotTracking>[1])
  const search = luckySlotSearch(tracking)
  const nextSlot = verified != null ? verified : search.nextSlot
  const isVerified = verified != null

  return (
    <SectionCard title="Lucky upgrade slot">
      <p className="text-sm text-muted-foreground">
        {isVerified ? `Verified slot: ${verified}.` : `Next upgrade will test for lucky upgrade · slot ${nextSlot} (inventory position ${nextSlot + 1}).`}
      </p>
      <Button variant="link" size="xs" className="mt-1 px-0" onClick={() => setOpen(true)}>
        Show lucky slot data
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <LuckySlotStatistics characterName={characterName} tracking={tracking} search={search} nextSlot={nextSlot} verified={verified} />
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
  verified,
}: {
  characterName: string
  tracking: ReturnType<typeof aggregateSlotTracking>
  search: ReturnType<typeof luckySlotSearch>
  nextSlot: number
  verified?: number | null
}) {
  const rows = Array.from({ length: 42 }, (_, slot) => {
    const stats = tracking.slots[slot] || emptyRolls()
    return { slot, ...stats, average: stats.totalRolls ? stats.sumRolls / stats.totalRolls : null }
  })
  const sampled = rows.filter((row) => row.totalRolls > 0).length

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <h2 className="text-base font-semibold">Lucky slots · {characterName}</h2>
      <p className="text-xs text-muted-foreground">Upgrade evidence saved per character in coordinator state, with a local copy for reconnects.</p>
      <p className="rounded-md border border-amber-600 bg-amber-950/40 p-2.5 text-amber-200">
        {verified != null ? `Verified slot: ${verified}.` : `Next upgrade will test for lucky upgrade · slot ${nextSlot} (inventory position ${nextSlot + 1}).`}
      </p>
      <p className="text-xs text-muted-foreground">
        {search.total} recorded upgrade rolls · {sampled}/42 slots sampled.
      </p>
      <p className="text-xs text-muted-foreground">
        {search.slot === null
          ? 'No evidence yet. Testing starts at slot 0.'
          : `${search.inferred ? 'Statistically inferred' : 'Leading candidate'}: slot ${search.slot} · ${(search.confidence * 100).toFixed(2)}% model confidence · ${search.samples} rolls in that slot.`}
      </p>
      <p className="text-xs">
        Normal upgrade jobs rotate through the least-sampled slots and restore inventory afterward. Once a slot is statistically inferred, upgrades use it while evidence continues to accumulate. No extra upgrades are queued. Slot numbers start at 0.
      </p>
      <p className="text-xs text-muted-foreground">Inference requires at least 100 rolls in the leading slot and 99.9% confidence under the published server model. New evidence can change the selected slot.</p>
      <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
        <table className="w-full text-right text-xs">
          <thead className="sticky top-0 bg-card">
            <tr>
              {['Slot', 'Rolls', 'Average', '> 0.963', 'Zero rolls', 'Status'].map((label) => (
                <th key={label} className="p-1.5 font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slot} data-slot={row.slot} className={`border-t border-border ${row.slot === nextSlot ? 'bg-amber-950/40' : ''}`}>
                <td className="p-1.5 text-left text-amber-400">{row.slot}</td>
                <td className="p-1.5">{row.totalRolls}</td>
                <td className="p-1.5">{row.average?.toFixed(4) ?? '—'}</td>
                <td className="p-1.5">
                  {row.rollsAbove96_3} ({row.totalRolls ? ((100 * row.rollsAbove96_3) / row.totalRolls).toFixed(1) : '0.0'}%)
                </td>
                <td className="p-1.5">
                  {row.perfectRolls} ({row.totalRolls ? ((100 * row.perfectRolls) / row.totalRolls).toFixed(2) : '0.00'}%)
                </td>
                <td className="p-1.5 text-muted-foreground">{row.slot === nextSlot ? 'Next upgrade' : row.totalRolls ? 'Sampled' : 'Untested'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
