import { useCharacterActivity } from '@/data/useCharacterActivity'
import type { CharacterVitals } from '@/models'

/** The character's task and phase as one line, e.g. "Travelling to Hunt
 *  target - Croc". Console: card-name-strip.tsx data-card-activity. */
export function CharacterActivity({ name, vitals, className = '' }: { name: string; vitals: CharacterVitals; className?: string }) {
  const activity = useCharacterActivity(name, vitals)
  return (
    <div data-character-activity className={`${className} ${vitals.rip ? 'text-destructive' : ''}`} title={activity}>
      {activity}
    </div>
  )
}
