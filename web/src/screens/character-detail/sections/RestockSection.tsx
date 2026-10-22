import { useEffect, useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded, useDynamicState } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import type { ElixirRestock, RestockPolicy } from '@/models'

const digitsOnly = (value: string) => /^\d*$/.test(value)
// restock-controls.tsx draftElixir(): the policy a first elixir pick starts from.
const blankElixir = (): ElixirRestock => ({ item: '', min: 1, max: 2, autoConsume: true, autoAcquire: false })

/** HP/MP restock min/max fields, the elixir policy, and Save. Keeps a local
 *  "dirty" copy once the user starts typing so a poll refresh (~6s) can't
 *  clobber an in-progress edit; only resets from the server value while untouched. */
export function RestockSection({ characterName, serverPolicy }: { characterName: string; serverPolicy: RestockPolicy }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const catalog = useDynamicState().merchantCatalog?.allItems ?? []
  const elixirs = catalog.filter((item) => item.meta?.definition?.type === 'elixir')
  const [dirty, setDirty] = useState(false)
  const [hpMin, setHpMin] = useState(String(serverPolicy.hp.min))
  const [hpMax, setHpMax] = useState(String(serverPolicy.hp.max))
  const [mpMin, setMpMin] = useState(String(serverPolicy.mp.min))
  const [mpMax, setMpMax] = useState(String(serverPolicy.mp.max))
  // The saved elixir until the user edits one, so a save keeps the saved policy.
  const [elixirDraft, setElixirDraft] = useState<ElixirRestock | undefined>(serverPolicy.elixir)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const elixir = elixirDraft ?? blankElixir()

  useEffect(() => {
    if (dirty) return
    setHpMin(String(serverPolicy.hp.min))
    setHpMax(String(serverPolicy.hp.max))
    setMpMin(String(serverPolicy.mp.min))
    setMpMax(String(serverPolicy.mp.max))
    setElixirDraft(serverPolicy.elixir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPolicy])

  useEffect(() => {
    setDirty(false)
  }, [characterName])

  const updateElixir = (patch: Partial<ElixirRestock>) => {
    setDirty(true)
    setElixirDraft({ ...elixir, ...patch })
  }

  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex-1 text-xs text-muted-foreground">
      {label}
      <Input
        value={value}
        onChange={(event) => {
          if (digitsOnly(event.target.value)) {
            onChange(event.target.value)
            setDirty(true)
          }
        }}
        className="mt-1"
      />
    </label>
  )

  return (
    <SectionCard title="Restock">
      <div className="flex gap-2">
        {field('HP min', hpMin, setHpMin)}
        {field('HP max', hpMax, setHpMax)}
      </div>
      <div className="mt-2 flex gap-2">
        {field('MP min', mpMin, setMpMin)}
        {field('MP max', mpMax, setMpMax)}
      </div>
      {/* Console 1.5 restock-controls.tsx:84-92. */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs">
        <label className="flex flex-col gap-1 text-muted-foreground">
          Select elixir type
          <select
            value={elixir.item}
            onChange={(event) => updateElixir({ item: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">None</option>
            {elixirs.map((item) => (
              <option key={item.id} value={item.id}>
                {String(item.meta?.definition?.name || item.name || item.id)}
              </option>
            ))}
          </select>
        </label>
        {elixir.item && (
          <Button size="sm" variant="outline" className="self-start" onClick={() => updateElixir({ item: '' })}>
            Disable elixir restock
          </Button>
        )}
        <div className="flex gap-2">
          {(['min', 'max'] as const).map((key) => (
            <label key={key} className="flex-1 text-muted-foreground">
              Elixir {key}
              <Input type="number" min={0} max={9999} value={elixir[key]} onChange={(event) => updateElixir({ [key]: Number(event.target.value) })} className="mt-1" />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={elixir.autoConsume} onChange={(event) => updateElixir({ autoConsume: event.target.checked })} />
          Automatically consume elixirs
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={elixir.autoAcquire} onChange={(event) => updateElixir({ autoAcquire: event.target.checked })} />
          Buy or craft elixir when out of stock
        </label>
        <p className="text-muted-foreground">
          Delivered from existing stock at the minimum threshold. Active elixirs finish before another is consumed. Buying or crafting uses available gold and materials only when enabled.
        </p>
      </div>
      <Button
        className="mt-2"
        size="sm"
        disabled={!configLoaded || saving}
        onClick={async () => {
          setSaving(true)
          setSaveError(null)
          // Digits only, so a cleared field is 0. An elixir with item "" turns it off (http/restock.ts).
          const result = await api.saveRestock(characterName, {
            hp: { ...serverPolicy.hp, min: Number(hpMin), max: Number(hpMax) },
            mp: { ...serverPolicy.mp, min: Number(mpMin), max: Number(mpMax) },
            elixir: elixirDraft,
          })
          if (result.kind === 'failure') setSaveError(result.message || 'Restock update failed')
          else setDirty(false)
          await refreshNow()
          setSaving(false)
        }}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
      {saveError && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {saveError}
        </p>
      )}
      <ConfigLoadingNote />
    </SectionCard>
  )
}
