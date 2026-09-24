import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { AUTOMATIC_ROUTINE_KEYS, ROUTINE_LABELS, hasEnableToggle } from '@/lib/routineLabels'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold } from './AccountScreenScaffold'

/** routine-priorities-dialog.tsx ported as its own screen. The dashboard
 *  supports real pointer-drag reordering with live position animation -
 *  overkill for a touch list where up/down taps are just as fast and far
 *  simpler to get right. Ported the EXACT renumbering algorithm the
 *  dashboard's own arrow-key handler uses (its `move()` function), not a
 *  simplified version, so priorities after a reorder here match what the
 *  dashboard would have produced for the same move. */
export function RoutinesScreen() {
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()

  const [draft, setDraft] = useState<Record<string, number>>(dynamicState.merchantRoutinePriorities)
  const [enabledDraft, setEnabledDraft] = useState<Record<string, boolean>>(dynamicState.merchantAutomations)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the draft from live state once (on mount / first data arrival),
  // same as the dashboard's own "never overwrite a draft while open"
  // polling guard - after that, only local edits and Save change it.
  useEffect(() => {
    if (!seeded && Object.keys(dynamicState.merchantRoutinePriorities).length > 0) {
      setDraft(dynamicState.merchantRoutinePriorities)
      setEnabledDraft(dynamicState.merchantAutomations)
      setSeeded(true)
    }
  }, [seeded, dynamicState.merchantRoutinePriorities, dynamicState.merchantAutomations])

  const sortedKeys = Object.keys(ROUTINE_LABELS).sort(
    (a, b) => (draft[b] ?? 50) - (draft[a] ?? 50) || ROUTINE_LABELS[a].localeCompare(ROUTINE_LABELS[b]),
  )

  const move = (source: string, target: string, after: boolean) => {
    if (source === target) return
    const keys = sortedKeys.filter((key) => key !== source)
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

  const enabledCount = Object.keys(ROUTINE_LABELS).filter((key) => !hasEnableToggle(key) || enabledDraft[key] !== false).length

  return (
    <AccountScreenScaffold title={`Merchant routines · ${enabledCount}/${Object.keys(ROUTINE_LABELS).length} enabled`}>
      <p className="px-3 pb-2 text-xs text-muted-foreground">Higher priorities run first. Equal priorities run oldest first. Enabled controls only automatic scheduling.</p>
      <div className="flex flex-col gap-1.5 px-3">
        {sortedKeys.map((key, index) => (
          <div key={key} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
            {hasEnableToggle(key) && (
              <input
                type="checkbox"
                aria-label={`Enable ${ROUTINE_LABELS[key]}`}
                checked={enabledDraft[key] !== false}
                onChange={(e) => setEnabledDraft((old) => ({ ...old, [key]: e.target.checked }))}
                className="size-4"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{ROUTINE_LABELS[key]}</span>
            <Input
              aria-label={`${ROUTINE_LABELS[key]} priority`}
              value={String(draft[key] ?? 50)}
              onChange={(e) => {
                const value = Math.max(0, Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0))
                setDraft((old) => ({ ...old, [key]: value }))
              }}
              className="h-8 w-16 text-right font-mono"
            />
            <button
              aria-label={`Move ${ROUTINE_LABELS[key]} up`}
              disabled={index === 0}
              onClick={() => move(key, sortedKeys[index - 1], false)}
              className="disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              aria-label={`Move ${ROUTINE_LABELS[key]} down`}
              disabled={index === sortedKeys.length - 1}
              onClick={() => move(key, sortedKeys[index + 1], true)}
              className="disabled:opacity-30"
            >
              <ArrowDown className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 border-t border-border bg-background p-3">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            const priorities = Object.fromEntries(Object.keys(ROUTINE_LABELS).map((key) => [key, draft[key] ?? 50]))
            const enabled = Object.fromEntries([...AUTOMATIC_ROUTINE_KEYS, 'fishing', 'mining'].map((key) => [key, enabledDraft[key] !== false]))
            const result = await api.saveRoutinePriorities(priorities, enabled)
            setSaving(false)
            if (result.kind === 'failure') setError(result.message)
            else await refreshNow()
          }}
        >
          {saving ? 'Saving...' : 'Save routines'}
        </Button>
      </div>
    </AccountScreenScaffold>
  )
}
