import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { entryLabel, modePair, type SlotColor, type SlotEntry } from '@/models'

// Each slot colour's chip classes, written out so Tailwind finds them.
const SLOT_CLASSES: Record<SlotColor, { button: string; block: string }> = {
  slate: { button: 'border-slate-600 bg-slate-900 text-slate-100', block: 'border-slate-800 text-slate-300' },
  cyan: { button: 'border-cyan-600 bg-cyan-950 text-cyan-100', block: 'border-cyan-900 text-cyan-300' },
  emerald: { button: 'border-emerald-600 bg-emerald-950 text-emerald-100', block: 'border-emerald-900 text-emerald-300' },
  violet: { button: 'border-violet-600 bg-violet-950 text-violet-100', block: 'border-violet-900 text-violet-300' },
  amber: { button: 'border-amber-600 bg-amber-950 text-amber-100', block: 'border-amber-900 text-amber-300' },
  rose: { button: 'border-rose-600 bg-rose-950 text-rose-100', block: 'border-rose-900 text-rose-300' },
  sky: { button: 'border-sky-600 bg-sky-950 text-sky-100', block: 'border-sky-900 text-sky-300' },
}

// What one mode button sends: its slot's field only (console farming-mode-control.tsx SlotChoice).
export type SlotChoice = { combatMode: string } | { targetMode: string }

/** The two farming mode rows: combat mode and target mode, each from the add-on list's slot
 *  entries, so an enabled add-on's target mode shows as its own button. Console:
 *  farming-mode-control.tsx. */
export function FarmingModeControl({
  combatEntries,
  targetEntries,
  slotsError,
  combatMode,
  targetMode,
  effectiveTarget,
  effectiveMode,
  followingLeader,
  addonStatus,
  disabled,
  onSelect,
  onSettings,
  farmingLine,
}: {
  combatEntries: readonly SlotEntry[]
  targetEntries: readonly SlotEntry[]
  // The add-on list's failure: the rows then hold no buttons, so the control says why.
  slotsError?: string
  // The character's own saved pair, which the pressed buttons show.
  combatMode: string
  targetMode: string
  // The scope's target mode, whose add-on status line shows.
  effectiveTarget: string
  // The hunting owner's calculated combat mode, which Auto shows beside its name.
  effectiveMode: string
  followingLeader?: string
  addonStatus: Record<string, { title: string; message: string; color: SlotColor }>
  disabled?: boolean
  onSelect: (choice: SlotChoice) => void
  // Opens the settings menu at this character's Farming section.
  onSettings?: () => void
  // The add-on pieces under the two rows (console farming-mode-control.tsx `farming-line` slot).
  farmingLine?: ReactNode
}) {
  const inherited = !!followingLeader
  const rows: { name: string; entries: readonly SlotEntry[]; pressed: string; choose(mode: string): SlotChoice }[] = [
    { name: 'Combat mode', entries: combatEntries, pressed: combatMode, choose: (mode) => ({ combatMode: mode }) },
    { name: 'Target mode', entries: targetEntries, pressed: targetMode, choose: (mode) => ({ targetMode: mode }) },
  ]
  const addonLine = addonStatus[effectiveTarget]
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase text-muted-foreground">Farming settings</span>
        <span className="flex items-center gap-1">
          <span className="rounded border border-cyan-700 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-400">
            {inherited ? 'Copy leader' : modePair(entryLabel(targetEntries, targetMode), entryLabel(combatEntries, combatMode))}
            {!inherited && combatMode === 'auto' ? ` · ${effectiveMode}` : ''}
          </span>
          {onSettings && (
            <button type="button" aria-label="Farming settings" title="Farming settings" onClick={onSettings} className="rounded border border-border p-1 text-muted-foreground">
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      {inherited && <p className="mb-1.5 text-xs text-cyan-500">Used when Follow is off.</p>}
      {slotsError && <p role="alert" className="mb-1.5 text-xs text-amber-400">{slotsError}</p>}
      {rows.map((row) => (
        <div key={row.name} role="group" aria-label={row.name} className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {row.entries.map((entry) => (
            <button
              key={entry.mode}
              type="button"
              title={entry.button.description}
              aria-pressed={row.pressed === entry.mode}
              disabled={disabled}
              onClick={() => onSelect(row.choose(entry.mode))}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-sm transition disabled:opacity-50',
                SLOT_CLASSES[entry.button.color]?.button,
                row.pressed === entry.mode ? 'ring-2 ring-white/70' : 'opacity-70',
              )}
            >
              {entry.button.label}
            </button>
          ))}
        </div>
      ))}
      {farmingLine}
      {addonLine && (
        <section aria-label={addonLine.title} className={cn('mt-2 border-t pt-2 font-mono text-[10px]', SLOT_CLASSES[addonLine.color]?.block)}>
          <p className="font-semibold">{addonLine.title}</p>
          <p>{addonLine.message}</p>
        </section>
      )}
    </>
  )
}
