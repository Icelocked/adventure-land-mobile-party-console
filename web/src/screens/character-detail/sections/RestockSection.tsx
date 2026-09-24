import { useEffect, useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import type { RestockPolicy } from '@/models'

const digitsOnly = (value: string) => /^\d*$/.test(value)

/** Ports restock-controls.tsx's HP/MP min/max fields + Save button. Keeps
 *  a local "dirty" copy once the user starts typing so an incoming poll
 *  refresh (~6s) can't clobber an in-progress edit - only resets from the
 *  server value while untouched. */
export function RestockSection({ characterName, serverPolicy }: { characterName: string; serverPolicy: RestockPolicy }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [dirty, setDirty] = useState(false)
  const [hpMin, setHpMin] = useState(String(serverPolicy.hp.min))
  const [hpMax, setHpMax] = useState(String(serverPolicy.hp.max))
  const [mpMin, setMpMin] = useState(String(serverPolicy.mp.min))
  const [mpMax, setMpMax] = useState(String(serverPolicy.mp.max))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (dirty) return
    setHpMin(String(serverPolicy.hp.min))
    setHpMax(String(serverPolicy.hp.max))
    setMpMin(String(serverPolicy.mp.min))
    setMpMax(String(serverPolicy.mp.max))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPolicy])

  useEffect(() => {
    setDirty(false)
  }, [characterName])

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
      <Button
        className="mt-2"
        size="sm"
        disabled={!dirty || saving}
        onClick={async () => {
          setSaving(true)
          await api.saveRestock(characterName, Number(hpMin) || 0, Number(hpMax) || 0, Number(mpMin) || 0, Number(mpMax) || 0)
          await refreshNow()
          setDirty(false)
          setSaving(false)
        }}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </SectionCard>
  )
}
