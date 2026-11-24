import { useCharacterActivity } from '@/data/useCharacterActivity'
import { useCharacterDiagnostics } from '@/data/PartyDataProvider'
import { cardLine } from '@/api/ownersCards'
import type { CharacterVitals } from '@/models'

/** The character's task and phase as one line, e.g. "Travelling to Hunt
 *  target - Croc". The owners release sends the line in core's
 *  `characterDetails[name].activity` (connected-character-card.tsx
 *  data-testid="character-activity"), with the stuck notice beside it and
 *  each add-on's line under it. The fork console sends no such field, so
 *  the phone builds its label from `activityPhases` instead. */
export function CharacterActivity({ name, vitals, className = '' }: { name: string; vitals: CharacterVitals; className?: string }) {
  const fallback = useCharacterActivity(name, vitals)
  const line = cardLine(useCharacterDiagnostics(name))
  if (line === undefined)
    return (
      <div data-character-activity className={`${className} ${vitals.rip ? 'text-destructive' : ''}`} title={fallback}>
        {fallback}
      </div>
    )
  if (!line) return null
  return (
    <>
      <div data-character-activity className={`${className} ${vitals.rip ? 'text-destructive' : ''}`} title={line.text}>
        {line.text}
        {line.notice && (
          <span data-character-activity-notice className="ml-2 text-amber-300">
            {line.notice}
          </span>
        )}
      </div>
      {line.addons?.map(({ addon, label }) => (
        <div key={addon} data-character-addon-line className={`${className} text-sky-200/80`} title={`${addon}: ${label}`}>
          <span className="text-slate-400">{addon}:</span> {label}
        </div>
      ))}
    </>
  )
}
