import { useState } from 'react'
import { usePartyApi, useCharacterDiagnostics } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../SectionCard'
import type { CosmeticsReport, Sprite } from '@/models'

type Command = Parameters<ReturnType<typeof usePartyApi>['cosmeticCommand']>[1]

const rowClass = 'flex items-center gap-2 rounded-md border border-border px-2 py-1'
const jarState = (jar: CosmeticsReport['jars'][number]) => (jar.kind === 'empty' ? 'Empty' : jar.locked ? 'Locked' : jar.kind === 'unknown' ? 'Unknown cosmetic' : 'Usable')
const seconds = (ms: number) => (ms >= 60000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 1000)}s`)

/** The cosmetic's own sprite layer, or an emote's skill icon. An empty box when the game has no art for it. */
function Preview({ sprite, label }: { sprite?: Sprite | null; label: string }) {
  return (
    <span role="img" aria-label={sprite ? `${label} preview` : `${label} has no preview`} className="inline-block size-8 shrink-0 overflow-hidden rounded border border-border bg-muted">
      {sprite && <SpriteIcon sprite={sprite} size={32} />}
    </span>
  )
}

/** CX jars in the bag, emotes, what is worn and owned cosmetics; each action
 *  runs on the character's native client. Hidden until the character sends a
 *  cosmetics report. Console: cosmetics-panel.tsx. */
export function CosmeticsSection({ characterName }: { characterName: string }) {
  const api = usePartyApi()
  const cosmetics = useCharacterDiagnostics(characterName)?.cosmetics
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targets, setTargets] = useState<Record<string, string>>({})
  if (!cosmetics) return null
  const run = async (key: string, command: Command) => {
    setBusy(key)
    setError(null)
    const result = await api.cosmeticCommand(characterName, command)
    if (result.kind === 'failure') setError(result.message)
    setBusy(null)
  }
  const usable = cosmetics.jars.filter((jar) => jar.usable).length
  const worn = Object.entries(cosmetics.worn)
  const appearance = cosmetics.owned.filter((entry) => entry.kind !== 'emote')
  const emotes = cosmetics.owned.filter((entry) => entry.kind === 'emote')
  const last = cosmetics.lastEmote
  const lastLabel = last && (emotes.find((entry) => entry.name === last.name)?.label || last.name)
  const title =
    `Cosmetics · ${cosmetics.jars.length} CX jar${cosmetics.jars.length === 1 ? '' : 's'}${usable ? ` (${usable} usable)` : ''}` +
    (emotes.length ? ` · ${emotes.length} emote${emotes.length === 1 ? '' : 's'}` : '')
  const action = (key: string, label: string, pending: string, ariaLabel: string, command: Command, disabled = false) => (
    <Button size="xs" variant="outline" className="shrink-0" disabled={busy !== null || disabled} aria-label={ariaLabel} onClick={() => void run(key, command)}>
      {busy === key ? pending : label}
    </Button>
  )

  return (
    <SectionCard title={title} id="Cosmetics" defaultOpen={false}>
      <div className="flex flex-col gap-3 text-xs">
        <div>
          <p className="mb-1 font-semibold">CX jars in inventory</p>
          {cosmetics.jars.length ? (
            <ul className="grid gap-1">
              {cosmetics.jars.map((jar) => (
                <li key={jar.inventorySlot} className={rowClass}>
                  <Preview sprite={jar.sprite} label={jar.label || jar.data || 'empty jar'} />
                  <span className="min-w-0 flex-1">
                    Slot {jar.inventorySlot} · {jar.label || jar.data || 'empty'}
                    {jar.kind === 'emote' ? ' · emote' : jar.slot ? ` · ${jar.slot}` : ''}
                  </span>
                  <span className={jar.usable ? 'text-emerald-500' : 'text-muted-foreground'}>{jarState(jar)}</span>
                  {jar.usable && action(`jar${jar.inventorySlot}`, 'Open', 'Opening…', `Open CX jar in slot ${jar.inventorySlot}`, { type: 'cx-open-jar', inventorySlot: jar.inventorySlot })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No CX jars.</p>
          )}
          <p className="mt-1 text-muted-foreground">Opening adds the cosmetic to this character&apos;s collection and uses up the jar.</p>
        </div>
        <div>
          <p className="mb-1 font-semibold">Emotes</p>
          {emotes.length ? (
            <ul className="grid gap-1">
              {emotes.map((entry) => {
                const label = entry.label || entry.name
                const range = entry.range ?? null
                // Ranged emotes need a target: this character unless the emote forbids it, then nearby players within range.
                const options = range === null ? [] : [...(entry.noSelf ? [] : [{ name: characterName, distance: 0 }]), ...(cosmetics.nearbyPlayers || []).filter((player) => player.distance <= range)]
                const target = range === null ? null : options.some((option) => option.name === targets[entry.name]) ? targets[entry.name] : options[0]?.name
                const cooling = (entry.cooldownLeftMs || 0) > 0
                return (
                  <li key={entry.name} className={`${rowClass} flex-wrap`}>
                    <Preview sprite={entry.sprite} label={label} />
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block">{label}</span>
                      <span className="block text-muted-foreground">
                        {entry.explanation ? `${entry.explanation} · ` : ''}
                        {entry.mp ? `${entry.mp} MP · ` : ''}
                        {seconds(entry.cooldownMs || 0)} cooldown{range !== null ? ` · range ${range}` : ''}
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {range !== null && (
                        <select
                          aria-label={`Target for ${label}`}
                          value={target || ''}
                          disabled={!options.length || busy !== null}
                          onChange={(event) => setTargets({ ...targets, [entry.name]: event.target.value })}
                          className="rounded border border-border bg-background px-1 py-1 text-xs"
                        >
                          {options.length ? (
                            options.map((option) => (
                              <option key={option.name} value={option.name}>
                                {option.name === characterName ? `${characterName} (self)` : `${option.name} · ${option.distance}`}
                              </option>
                            ))
                          ) : (
                            <option value="">Nobody in range</option>
                          )}
                        </select>
                      )}
                      {action(
                        `emote${entry.name}`,
                        cooling ? `Ready in ${seconds(entry.cooldownLeftMs || 0)}` : 'Use',
                        'Using…',
                        `Use ${label}`,
                        { type: 'cx-emote', name: entry.name, target: target ?? null },
                        cooling || (range !== null && !target),
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">No emotes unlocked.</p>
          )}
          {last && (
            <p role="status" className={`mt-1 ${last.ok ? 'text-emerald-500' : 'text-amber-500'}`}>
              Last emote: {lastLabel}
              {last.target ? ` → ${last.target}` : ''} · {last.ok ? 'used' : last.reason === 'pending' ? 'sending…' : `refused: ${last.reason}`}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 font-semibold">Worn</p>
          {worn.length ? (
            <ul className="grid gap-1">
              {worn.map(([slot, item]) => (
                <li key={slot} className={rowClass}>
                  <Preview sprite={cosmetics.owned.find((entry) => entry.name === item)?.sprite} label={item} />
                  <span className="min-w-0 flex-1">
                    {slot} · {item}
                  </span>
                  {slot !== 'skin' && action(`remove${slot}`, 'Remove', 'Removing…', `Remove ${item} from ${slot}`, { type: 'cx-remove', slot })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nothing worn.</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-semibold">Owned</p>
          {appearance.length ? (
            <ul className="grid max-h-60 gap-1 overflow-auto">
              {appearance.map((entry) => {
                const wearing = !!entry.slot && cosmetics.worn[entry.slot] === entry.name
                return (
                  <li key={entry.name} className={rowClass}>
                    <Preview sprite={entry.sprite} label={entry.label || entry.name} />
                    <span className="min-w-0 flex-1">
                      {entry.label || entry.name}
                      {entry.count > 1 ? ` ×${entry.count}` : ''} · {entry.slot || entry.kind}
                    </span>
                    {entry.kind === 'appearance' && entry.slot
                      ? wearing
                        ? action(`wear${entry.name}`, 'Worn', 'Worn', `Wear ${entry.name}`, { type: 'cx-wear', name: entry.name, slot: entry.slot }, true)
                        : action(`wear${entry.name}`, 'Wear', 'Wearing…', `Wear ${entry.name}`, { type: 'cx-wear', name: entry.name, slot: entry.slot })
                      : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">No owned cosmetics reported.</p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </SectionCard>
  )
}
