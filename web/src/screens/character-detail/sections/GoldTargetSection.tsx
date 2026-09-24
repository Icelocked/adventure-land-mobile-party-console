import { useEffect, useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'

/** There is no manual "withdraw gold from the bank" action anywhere in
 *  party-console - gold moves automatically during the merchant's normal
 *  bank errands, toward whatever target each character is set to carry
 *  (POST /party-api/command type "gold-target"). This is that real
 *  mechanism, not a placeholder for a feature that doesn't exist. */
export function GoldTargetSection({ characterName, serverTarget }: { characterName: string; serverTarget: number }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [dirty, setDirty] = useState(false)
  const [value, setValue] = useState(String(serverTarget))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dirty) setValue(String(serverTarget))
  }, [serverTarget, dirty])

  useEffect(() => {
    setDirty(false)
  }, [characterName])

  return (
    <SectionCard title="Gold target">
      <p className="text-xs text-muted-foreground">The merchant's bank errands automatically move gold to keep this character at this amount.</p>
      <div className="mt-2 flex gap-2">
        <Input
          value={value}
          onChange={(event) => {
            if (/^\d*$/.test(event.target.value)) {
              setValue(event.target.value)
              setDirty(true)
            }
          }}
          className="flex-1"
        />
        <Button
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true)
            await api.sendCommand(characterName, { type: 'gold-target', amount: Number(value) || 0 })
            await refreshNow()
            setDirty(false)
            setSaving(false)
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </SectionCard>
  )
}
