import { useCharacterDiagnosticsMap } from '@/data/PartyDataProvider'

type TracktrixData = { active?: boolean; bonuses?: Record<string, number> | null }

/** The newest active character's reported bonuses (diagnostics `tracktrix`). */
export function SharedTracktrixBonuses({ names }: { names: string[] }) {
  const diagnostics = useCharacterDiagnosticsMap()
  const data = names
    .map((name) => diagnostics[name])
    .filter(Boolean)
    .sort((a, b) => Number(b.seenAt || 0) - Number(a.seenAt || 0))
    .map((record) => record.tracktrix as TracktrixData | undefined)
    .find((value) => value?.active && value.bonuses != null)
  return <TracktrixBonusList data={data && { ...data, active: true }} title="Current bonuses for holding a tracktrix" theme="rose" />
}

export function TracktrixBonusList({ data, title = 'Current Tracktrix bonuses', theme = 'violet' }: { data?: TracktrixData; title?: string; theme?: 'violet' | 'rose' }) {
  const bonuses = Object.entries(data?.bonuses || {}).filter(([, value]) => Number.isFinite(value) && value !== 0)
  return (
    <section aria-label={title} className={`mb-2 rounded border p-3 text-sm ${theme === 'rose' ? 'border-rose-800' : 'border-violet-700'}`}>
      <h4 className="mb-2 font-semibold">{title}</h4>
      {!data || (data.active && data.bonuses === null) ? (
        <p>Waiting for Tracktrix data.</p>
      ) : !data.active ? (
        <p>Inactive — this character is not receiving Tracktrix bonuses.</p>
      ) : !bonuses.length ? (
        <p>No stat bonuses unlocked yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {bonuses.map(([stat, value]) => (
            <div key={stat} className="flex justify-between gap-3">
              <dt>{stat.replaceAll('_', ' ').toUpperCase()}</dt>
              <dd className={`font-mono ${theme === 'rose' ? 'text-rose-200' : 'text-emerald-400'}`}>
                {value > 0 ? '+' : ''}
                {value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
