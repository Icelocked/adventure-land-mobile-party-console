import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { ROUTINE_LABELS, hasEnableToggle } from '@/lib/routineLabels'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold } from './AccountScreenScaffold'

/** Routine priorities, reordered with up/down taps instead of drag. The
 *  renumbering follows the console's arrow-key `move()` so a reorder here
 *  produces the same priorities as the same move on the dashboard. */
export function RoutinesScreen() {
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const navigate = useNavigate()
  const configLoaded = useConfigLoaded()

  // Fishing/mining aren't automations - their
  // switches mirror the standing gathering modes.
  const priorities = dynamicState.merchantRoutinePriorities
  const enabled: Record<string, boolean> = {
    ...dynamicState.merchantAutomations,
    fishing: dynamicState.gatheringModes.includes('fishing'),
    mining: dynamicState.gatheringModes.includes('mining'),
  }
  const [draft, setDraft] = useState<Record<string, number>>(priorities)
  const [enabledDraft, setEnabledDraft] = useState<Record<string, boolean>>(enabled)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the draft from live state once (on mount / first data arrival) so
  // polling never overwrites an open draft; after that, only local edits
  // and Save change it.
  useEffect(() => {
    if (!seeded && configLoaded) {
      setDraft(priorities)
      setEnabledDraft(enabled)
      setSeeded(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, configLoaded, dynamicState.merchantRoutinePriorities, dynamicState.merchantAutomations, dynamicState.gatheringModes])

  const sortedKeys = Object.keys(ROUTINE_LABELS).sort(
    (a, b) => (draft[b] ?? 50) - (draft[a] ?? 50) || ROUTINE_LABELS[a].localeCompare(ROUTINE_LABELS[b]),
  )
  // Deliveries/withdrawals are switched on in Merchant settings; while off
  // their rows are locked.
  const disabledRoutine = (key: string) => ['deliveries', 'withdrawals'].includes(key) && enabled[key] === false
  const movableKeys = sortedKeys.filter((key) => !disabledRoutine(key))

  const move = (source: string, target: string, after: boolean) => {
    if (source === target || disabledRoutine(source) || disabledRoutine(target)) return
    const keys = movableKeys.filter((key) => key !== source)
    const index = keys.indexOf(target) + (after ? 1 : 0)
    keys.splice(index, 0, source)
    const next = { ...draft }
    next[source] = index ? (next[keys[index - 1]] ?? 50) - 1 : Math.min(100, (next[keys[1]] ?? 50) + 1)
    for (let i = 1; i < keys.length; i += 1) {
      next[keys[i]] = Math.min(next[keys[i]] ?? 50, (next[keys[i - 1]] ?? 50) - 1)
    }
    if (keys.some((key) => next[key] < 0)) keys.forEach((key, i) => { next[key] = 100 - i })
    setDraft(next)
  }

  const enabledCount = Object.keys(ROUTINE_LABELS).filter((key) => !disabledRoutine(key) && (!hasEnableToggle(key) || enabledDraft[key] !== false)).length

  return (
    <AccountScreenScaffold title={`Merchant routines · ${enabledCount}/${Object.keys(ROUTINE_LABELS).length} enabled`}>
      <p className="px-3 pb-2 text-xs text-muted-foreground">Higher priorities run first. Equal priorities run oldest first. Enabled controls only automatic scheduling.</p>
      {/* Edits made before the draft seeds from config would be overwritten. */}
      <fieldset disabled={!seeded} className="flex flex-col gap-1.5 px-3">
        {sortedKeys.map((key) => {
          const locked = disabledRoutine(key)
          const index = movableKeys.indexOf(key)
          return (
          <div key={key} aria-disabled={locked || undefined} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
            {hasEnableToggle(key) && (
              <input
                type="checkbox"
                aria-label={`Enable ${ROUTINE_LABELS[key]}`}
                checked={enabledDraft[key] !== false}
                onChange={(e) => setEnabledDraft((old) => ({ ...old, [key]: e.target.checked }))}
                className="size-4"
              />
            )}
            <span className={`min-w-0 flex-1 truncate text-sm ${locked ? 'text-muted-foreground' : ''}`}>
              {ROUTINE_LABELS[key]}
              {locked && <span className="block text-xs text-muted-foreground">Enable in Merchant settings</span>}
            </span>
            <Input
              aria-label={`${ROUTINE_LABELS[key]} priority`}
              disabled={locked}
              value={String(locked ? (priorities[key] ?? 90) : (draft[key] ?? priorities[key] ?? 50))}
              onChange={(e) => {
                const value = Math.max(0, Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0))
                setDraft((old) => ({ ...old, [key]: value }))
              }}
              className="h-8 w-16 text-right font-mono"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Move ${ROUTINE_LABELS[key]} up`}
              disabled={locked || index <= 0}
              onClick={() => move(key, movableKeys[index - 1], false)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Move ${ROUTINE_LABELS[key]} down`}
              disabled={locked || index === movableKeys.length - 1}
              onClick={() => move(key, movableKeys[index + 1], true)}
            >
              <ArrowDown className="size-4" />
            </Button>
          </div>
          )
        })}
      </fieldset>
      <div className="sticky bottom-0 border-t border-border bg-background p-3">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          disabled={!seeded || saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            // Save the seeded server maps with the user's edits, never
            // synthesised values.
            const nextPriorities = { ...draft }
            if (disabledRoutine('deliveries')) delete nextPriorities.deliveries
            if (disabledRoutine('withdrawals')) delete nextPriorities.withdrawals
            const nextEnabled = { ...enabledDraft }
            delete nextEnabled.deliveries // This toggle belongs to Merchant settings.
            delete nextEnabled.withdrawals
            const result = await api.saveRoutinePriorities(nextPriorities, nextEnabled)
            setSaving(false)
            if (result.kind === 'failure') setError(result.message)
            else {
              // A successful save closes the screen.
              await refreshNow()
              navigate(-1)
            }
          }}
        >
          {saving ? 'Saving...' : 'Save routines'}
        </Button>
        {/* Cancel discards the draft. */}
        <Button className="mt-2 w-full" variant="outline" disabled={saving} onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <ConfigLoadingNote />
      </div>
    </AccountScreenScaffold>
  )
}
