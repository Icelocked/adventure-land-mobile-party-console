import { useEffect, useState } from 'react'
import { useSectionOpen } from '@/lib/sectionOpen'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { durationLabel, useClock } from '@/lib/duration'
import { durationStat } from '@/lib/itemFormulas'
import { displayValue, durationSignature, reconcileDurations, statusRemaining, type StatusDuration } from '@/lib/statusDuration'
import type { Condition } from '@/models'

/** A collapsed "Active status" with the count; open,
 *  each status shows its sprite, a ticking countdown over a depleting bar,
 *  and stacks, and opens its Condition details. Shown for every class. */
export function StatusesSection({ characterName, conditions }: { characterName: string; conditions: Condition[] }) {
  const [open, setOpen] = useSectionOpen('character:Active status', false)
  const [selected, setSelected] = useState<Condition | null>(null)
  const now = useClock()
  const [durations, setDurations] = useState<Record<string, StatusDuration | undefined>>({})
  const signature = durationSignature(conditions)
  useEffect(() => {
    // Anchor newly observed telemetry at commit time.
    setDurations((previous) => reconcileDurations(signature, previous, Date.now()))
  }, [signature])

  return (
    <section aria-label="Active status" className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1 text-sm font-semibold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Active status
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{conditions.length}</span>
      </button>
      {open && conditions.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {conditions.map((condition) => {
            const duration = durations[condition.id]
            const remaining = statusRemaining(duration, now)
            const percent = duration?.total ? Math.min(100, ((remaining || 0) / duration.total) * 100) : 0
            return (
              <button
                key={condition.id}
                type="button"
                onClick={() => setSelected(condition)}
                title={condition.name}
                className="relative isolate flex max-w-full items-center gap-2 overflow-hidden rounded border border-cyan-800 p-1.5 text-left"
              >
                <span aria-hidden="true" data-testid="status-bar" className="absolute inset-y-0 left-0 -z-10 bg-cyan-900 transition-[width] duration-1000 ease-linear" style={{ width: `${percent}%` }} />
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-black">{condition.sprite && <SpriteIcon sprite={condition.sprite} size={32} />}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs">{condition.name}</span>
                  <span className="block font-mono text-[10px]">
                    {durationLabel(remaining ?? condition.remainingMs)}
                    {condition.stacks !== null && condition.stacks !== undefined ? ` · ${condition.stacks} stacks` : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : open ? (
        <p className="mt-2 text-xs text-muted-foreground">No active effects</p>
      ) : null}
      {selected && <ConditionDetailsSheet characterName={characterName} condition={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

/** The status's name, owner and duration, its
 *  explanation, and every definition/live field (durations formatted). */
function ConditionDetailsSheet({ characterName, condition, onClose }: { characterName: string; condition: Condition; onClose: () => void }) {
  const merged = { ...(condition.definition ?? {}), ...(condition.live ?? {}) }
  const ignored = new Set(['name', 'explanation', 'skin', 'ui'])
  const details = Object.entries(merged).filter(([key]) => !ignored.has(key))
  const definitionType = typeof condition.definition?.type === 'string' ? condition.definition.type : undefined
  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" aria-label="Condition details" className="max-h-[85vh] overflow-y-auto p-4">
        <div className="flex items-center gap-4">
          {condition.sprite && (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-cyan-700 bg-black">
              <SpriteIcon sprite={condition.sprite} size={56} />
            </div>
          )}
          <div>
            <p className="text-base font-semibold">{condition.name || 'Status effect'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {characterName} · {durationLabel(condition.remainingMs)}
            </p>
          </div>
        </div>
        {condition.explanation && <p className="mt-3 text-sm leading-6">{condition.explanation}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border pt-4">
          {details.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 border-b border-border pb-1">
              <dt className="capitalize text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
              <dd className="max-w-44 break-words text-right font-mono text-cyan-500">{(typeof value === 'number' ? durationStat(key, value, definitionType) : null) ?? displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  )
}
