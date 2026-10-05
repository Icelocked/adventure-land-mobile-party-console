import { useState } from 'react'
import { Plus } from 'lucide-react'
import { usePartyApi, useDynamicState, useRoster } from '@/data/PartyDataProvider'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

/** Choose who to load into an empty slot (headless or Steam), or - for slot 0 - switch the Steam
 *  character. Offline, inactive roster members only, plus Create character. */
export function RosterPickerSheet({ slot, onClose, onCreate }: { slot: number; onClose: () => void; onCreate: () => void }) {
  const api = usePartyApi()
  const state = useDynamicState()
  const roster = Object.values(useRoster())
  const [hosting, setHosting] = useState<'headless' | 'steam'>('headless')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = new Set((state.activeSlots || []).map((entry) => entry.character).filter(Boolean))
  const choices = roster.filter((member) => slot === 0 || (!active.has(member.name) && !member.online))

  const choose = async (name: string) => {
    setBusy(true)
    setError(null)
    // Slot 0 switches the Steam primary; otherwise
    // load headless (slot spawn) or into Steam.
    const result =
      slot === 0 ? await api.steamAction(name, 'primary') : hosting === 'steam' ? await api.steamAction(name, 'login') : await api.spawnSlot(slot, name)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message)
    else onClose()
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
        <h2 className="text-base font-semibold">{slot === 0 ? 'Switch Steam character' : 'Choose a roster member'}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {slot === 0
            ? 'The Steam bridge changes the primary view and restores the other Steam characters afterward.'
            : 'Choose an offline character, or create a new character.'}
        </p>
        {slot !== 0 && (
          <>
            <div className="flex gap-2" role="group" aria-label="Login hosting">
              {(['headless', 'steam'] as const).map((value) => (
                <Button key={value} size="sm" variant={hosting === value ? 'default' : 'outline'} aria-pressed={hosting === value} onClick={() => setHosting(value)}>
                  {value === 'steam' ? 'Steam' : 'Headless'}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {hosting === 'headless' ? 'Runs on the computer hosting Party Console, without a game window.' : 'Runs in your connected Adventure Land Steam client.'}
              {' Characters already online elsewhere are hidden; stop them there before loading them here.'}
            </p>
          </>
        )}
        <div className="mt-3 flex flex-col gap-1.5">
          {choices.map((member) => (
            <button
              key={member.name}
              type="button"
              disabled={busy}
              onClick={() => void choose(member.name)}
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium">{member.name}</span>
                <span className="text-xs uppercase text-muted-foreground">
                  Lv {member.level} {member.ctype}
                </span>
              </span>
              <Plus className="size-4 text-primary" />
            </button>
          ))}
          {!choices.length && <p className="py-6 text-center text-sm text-muted-foreground">No available roster members.</p>}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <Button variant="outline" className="mt-3 w-full" onClick={onCreate}>
          <Plus className="size-4" /> Create character
        </Button>
      </SheetContent>
    </Sheet>
  )
}
