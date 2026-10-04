import { useEffect, useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
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
  const configLoaded = useConfigLoaded()
  const [dirty, setDirty] = useState(false)
  const [value, setValue] = useState(String(serverTarget))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          disabled={!configLoaded || !dirty || saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            const result = await api.sendCommand(characterName, { type: 'gold-target', amount: Number(value) || 0 })
            if (result.kind === 'failure') setError(result.message || 'Command failed')
            else setDirty(false)
            await refreshNow()
            setSaving(false)
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
      {/* gold-target-control.tsx: save the target, then have the merchant
       *  exchange gold and items with the bank for this character. */}
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={!configLoaded || saving}
        onClick={async () => {
          setSaving(true)
          setError(null)
          const saved = dirty ? await api.sendCommand(characterName, { type: 'gold-target', amount: Number(value) || 0 }) : null
          const banked = saved?.kind === 'failure' ? saved : await api.sendCommand(characterName, { type: 'bank' })
          if (banked.kind === 'failure') setError(banked.message || 'Command failed')
          else setDirty(false)
          await refreshNow()
          setSaving(false)
        }}
      >
        Exchange gold and items with bank
      </Button>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
      <ConfigLoadingNote />
    </SectionCard>
  )
}
