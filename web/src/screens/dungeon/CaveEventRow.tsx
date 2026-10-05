import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useClock } from '@/lib/duration'
import { dungeonEntryLabel, useDungeons } from '@/data/useDailyDungeon'
import { Sheet, SheetContent } from '@/components/ui/sheet'

export const dungeonButton =
  'rounded border border-slate-500 bg-slate-950 px-3 py-2 text-emerald-50 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50'

/** The Cave of Many Dreams row at the
 *  top of the Events list, with its settings as a sheet (manual entry,
 *  resume, event protection, release). */
export function CaveEventRow() {
  const [open, setOpen] = useState(false)
  const query = useDungeons(),
    now = useClock(),
    view = query.data
  // Closes when the visit becomes active (adjusted during render on the phase change).
  const [lastPhase, setLastPhase] = useState(view?.state.phase)
  if (view?.state.phase !== lastPhase) {
    setLastPhase(view?.state.phase)
    if (view?.state.phase === 'active') setOpen(false)
  }
  const resume = view?.members[0]?.observation?.visit?.resume
  const eligible =
    !!view?.members.length &&
    view.members.length <= 3 &&
    view.members.every(
      (m) =>
        m.fresh &&
        m.observation?.supported &&
        m.observation.visit &&
        now - m.observation.visit.checkedAt < 45000 &&
        (m.observation.visit.available || m.observation.visit.resume),
    )
  return (
    <div className="flex items-center gap-2 border-b border-slate-600 py-2">
      <span>Cave of Many Dreams — {dungeonEntryLabel(view, now)}</span>
      <button type="button" aria-label="Cave of Many Dreams settings" onClick={() => setOpen(true)} className={dungeonButton + ' ml-auto'}>
        <Settings className="size-4" />
      </button>
      {open && (
        <Sheet open onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-auto p-4">
            <div role="group" aria-label="Cave of Many Dreams" className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-base font-semibold">Cave of Many Dreams</p>
                <p className="text-slate-300">Manual entry and event protection</p>
              </div>
              <p>{dungeonEntryLabel(view, now)}</p>
              {resume && <p>Resume on {resume.server}. Realm changes are manual.</p>}
              <p>Participants: {view?.members.map((m) => m.name + (m.fresh ? '' : ' (offline)')).join(', ') || 'Select a leader and combat followers'}.</p>
              {view?.members
                .filter((m) => m.observation?.visitError)
                .map((m) => (
                  <p key={m.name} className="text-amber-200">
                    {m.name}: eligibility check failed ({m.observation?.visitError}); retrying.
                  </p>
                ))}
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-emerald-500"
                  checked={view?.state.protectFromEvents !== false}
                  disabled={!view || query.busy}
                  onChange={(e) => void query.action({ action: 'settings', protectFromEvents: e.target.checked })}
                />
                Don’t leave the Cave of Many Dreams for other events
              </label>
              <p className="text-slate-300">Disabling this allows enabled events, including Anniversary, to end your visit. You may not be able to enter again until the daily reset.</p>
              <button
                className={dungeonButton}
                disabled={!eligible || query.busy || (!!view && !['idle', 'held'].includes(view.state.phase))}
                onClick={() => void query.action({ action: resume ? 'resume' : 'enter' })}
              >
                {resume ? 'Resume visit' : 'Enter now'}
              </button>
              {view?.state.phase === 'held' && (
                <button className={dungeonButton} disabled={query.busy} onClick={() => void query.action({ action: 'release' })}>
                  Resume ordinary activity
                </button>
              )}
              {!eligible && <p className="text-amber-200">Entry needs fresh eligible characters: a leader and at most two combat followers, excluding the merchant.</p>}
              {(query.actionError || query.error || view?.state.error) && (
                <p role="alert" className="text-rose-200">
                  {query.actionError || query.error?.message || view?.state.error}
                </p>
              )}
              <button className={dungeonButton} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
