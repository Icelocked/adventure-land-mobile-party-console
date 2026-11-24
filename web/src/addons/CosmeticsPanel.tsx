import { useState } from 'react'
import { useCharacterDiagnostics } from '@/data/PartyDataProvider'
import { useAddonEnabled, useAddons, useAddonWrites } from '@/data/useAddons'
import { SectionCard } from '@/screens/character-detail/SectionCard'

// The Cosmetics add-on's panel on a character (console runtime/addons/cosmetics/dashboard.tsx and
// panel.ts). It draws the character's `addonReports.cosmetics`: a worn look's chip takes it off, an
// owned look's chip puts it on and an emote's chip plays it, each through POST /addon-command. The
// line under the lists names the newest press and how it settled, from the party store.

const NAME = 'cosmetics'
type CosmeticsCommand = { wear: { slot: string; name: string } } | { takeOff: { slot: string } } | { emote: string }
interface Report {
  worn: Record<string, string>
  owned: { name: string; count: number; worn: boolean; slot: string | null }[]
  jars: { cell: number; look: string | null }[]
  emotes: { skill: string; name: string; targeted: boolean }[]
}
interface Chip {
  key: string
  label: string
  strong?: boolean
  title?: string
  press?: CosmeticsCommand
}

// A report from an older build of the add-on, or none yet, gives null, and the panel shows its empty line.
function isReport(value: unknown): value is Report {
  const v = value as Partial<Report> | null | undefined
  return !!v && typeof v.worn === 'object' && v.worn !== null && !Array.isArray(v.worn) && Array.isArray(v.owned) && Array.isArray(v.jars) && Array.isArray(v.emotes)
}

/** The line under the chips: the newest press that settled (panel.ts `lastLine`). */
function lastLine(last: unknown): string | null {
  const l = last as { label?: unknown; outcome?: string; detail?: string } | null | undefined
  if (!l || typeof l.label !== 'string' || !l.outcome) return null
  return l.outcome === 'sent' ? `${l.label}: sent` : `${l.label}: ${l.outcome}${l.detail ? ` (${l.detail})` : ''}`
}

/** The chip rows from a report (panel.ts `panelRows`). The game numbers bag cells from 0; the panel counts them from 1. */
function cosmeticsChips(report: unknown): { title: string; items: Chip[] }[] | null {
  if (!isReport(report)) return null
  return [
    { title: 'Wearing', items: Object.entries(report.worn).map(([slot, look]) => ({ key: slot, label: `${slot}: ${look}`, strong: true, title: `Take off ${look}`, press: { takeOff: { slot } } })) },
    {
      title: 'Owned',
      items: report.owned.map((look) => {
        const slot = !look.worn && typeof look.slot === 'string' ? look.slot : null
        return { key: look.name, label: look.count > 1 ? `${look.name} x${look.count}` : look.name, strong: look.worn, title: slot ? `Put on ${look.name}` : undefined, press: slot ? { wear: { slot, name: look.name } } : undefined }
      }),
    },
    { title: 'CX jars', items: report.jars.map((jar) => ({ key: String(jar.cell), label: `Bag ${jar.cell + 1}: ${jar.look ?? 'unknown look'}` })) },
    {
      title: 'Emotes',
      items: report.emotes.map((emote) => ({
        key: emote.skill,
        label: emote.targeted ? `${emote.name} (needs a target)` : emote.name,
        title: emote.targeted ? undefined : `Play ${emote.name}`,
        press: emote.targeted ? undefined : { emote: emote.skill },
      })),
    },
  ]
}

export function CosmeticsPanel({ character }: { character: string }) {
  const enabled = useAddonEnabled(NAME)
  const { stores } = useAddons()
  const writes = useAddonWrites()
  const report = useCharacterDiagnostics(character)?.addonReports?.[NAME]
  const [error, setError] = useState<string | null>(null)
  if (!enabled) return null
  const rows = cosmeticsChips(report)
  const last = lastLine(stores[NAME]?.party?.[`last.${character}`])
  const press = (body: CosmeticsCommand) => {
    setError(null)
    writes.command(NAME, character, body).then(
      (reply) => {
        if (reply && reply.ok === false) setError(reply.error ?? 'the console refused the press')
      },
      (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
    )
  }
  return (
    <SectionCard title="Cosmetics" id="addon-cosmetics" defaultOpen={false}>
      {rows ? (
        <div data-addon={NAME} className="flex flex-col gap-2 text-xs">
          {rows.map((row) => (
            <div key={row.title} className="flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.title}</p>
              {row.items.length ? (
                <div className="flex flex-wrap gap-1">
                  {row.items.map((chip) => {
                    const look = `rounded border px-1.5 py-0.5 ${chip.strong ? 'border-emerald-500 text-emerald-100' : 'border-border text-muted-foreground'}`
                    const body = chip.press
                    return body ? (
                      <button key={chip.key} type="button" title={chip.title} className={look} onClick={() => press(body)}>
                        {chip.label}
                      </button>
                    ) : (
                      <span key={chip.key} title={chip.title} className={look}>
                        {chip.label}
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground">None</p>
              )}
            </div>
          ))}
          {error ? <p className="text-rose-300">{error}</p> : last ? <p className="text-muted-foreground">{last}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No cosmetics report yet</p>
      )}
    </SectionCard>
  )
}
