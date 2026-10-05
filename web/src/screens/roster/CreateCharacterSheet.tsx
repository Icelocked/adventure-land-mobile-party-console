import { useState } from 'react'
import { usePartyApi, useDynamicState } from '@/data/PartyDataProvider'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CharacterPortrait } from '@/components/CharacterPortrait'

/** Name (4-12 letters, numbers, underscores), class, one of the class's
 *  official starting looks, then create and spawn. */
export function CreateCharacterSheet({ onClose }: { onClose: () => void }) {
  const api = usePartyApi()
  const state = useDynamicState()
  const classes = state.classChoices || []
  const [name, setName] = useState('')
  const [ctype, setCtype] = useState('ranger')
  const [look, setLook] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const appearances = state.appearanceChoices?.[ctype] || []

  const create = async () => {
    setError(null)
    if (!/^[A-Za-z0-9_]{4,12}$/.test(name)) return setError('Name must be 4-12 letters, numbers, or underscores')
    setBusy(true)
    const result = await api.createCharacter(name, ctype, look)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message)
    else onClose()
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !busy && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-4">
        <h2 className="text-base font-semibold">Create character</h2>
        <p className="mb-3 text-xs text-muted-foreground">Choose the class and one of its official starting appearances. The companion will never spend Shells.</p>
        <label className="block text-xs text-muted-foreground">
          Name
          <Input value={name} maxLength={12} placeholder="NewRanger" onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} className="mt-1" />
        </label>
        <label className="mt-3 block text-xs text-muted-foreground">
          Class
          <select
            aria-label="Class"
            value={ctype}
            onChange={(e) => {
              setCtype(e.target.value)
              setLook(0)
            }}
            className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2 text-sm capitalize text-foreground"
          >
            {classes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs text-muted-foreground">Appearance</legend>
          <div className="grid grid-cols-4 gap-2">
            {appearances.map((choice) => (
              <button
                type="button"
                key={choice.index}
                aria-label={`Appearance ${choice.index + 1}`}
                aria-pressed={look === choice.index}
                onClick={() => setLook(choice.index)}
                className={`h-24 rounded-md border ${look === choice.index ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
              >
                {choice.html ? <CharacterPortrait html={choice.html} className="h-full w-full" /> : <span className="text-xs text-muted-foreground">Loading preview…</span>}
              </button>
            ))}
          </div>
          {!appearances.length && <p className="text-xs text-amber-500">Waiting for an active character to provide current appearance data…</p>}
        </fieldset>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || name.length < 4 || !appearances.length} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create and spawn'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
