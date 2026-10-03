import { useCharacterDiagnosticsMap, useCharacters, useDynamicState, useRoster } from '@/data/PartyDataProvider'
import { CharacterPortrait } from '@/components/CharacterPortrait'

/** account-settings.tsx's member grid: roster and bankbois with the live
 *  doll/sprite or the saved appearance, class and level, padded to eight
 *  dotted empty slots. */
export function AccountMembers() {
  const state = useDynamicState()
  const roster = useRoster()
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()
  const members = [
    ...Object.values(roster).map((member) => ({ name: member.name, ctype: member.ctype, level: member.level as number | undefined })),
    ...(state.bankbois || []).map((b) => ({ name: b.name, ctype: b.ctype || 'merchant', level: b.level })),
  ].filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i)
  return (
    <div className="grid grid-cols-2 gap-2">
      {members.map((member) => {
        const live = diagnostics[member.name]
        const look = (live?.characterSprite || live?.characterDollHtml ? live : state.characterAppearances?.[member.name]) as { characterSprite?: unknown; characterDollHtml?: string; skin?: string } | undefined
        const vitals = characters[member.name]?.vitals
        const characterClass = vitals?.ctype || member.ctype
        const level = vitals?.level ?? member.level
        return (
          <div key={member.name} aria-label={member.name} className="rounded border border-slate-600 p-2 text-center">
            <div className="relative mx-auto h-20 w-16">
              {look?.characterSprite || look?.characterDollHtml ? (
                <CharacterPortrait html={look.characterDollHtml} sprite={look.characterSprite} skin={look.skin} className="h-full w-full" />
              ) : (
                <span className="grid h-full place-items-center text-xs text-slate-400">Appearance saved after first connection</span>
              )}
            </div>
            <p className="break-all text-sm">{member.name}</p>
            <p className="text-xs text-slate-300">
              <span className="capitalize">{characterClass}</span> · Lv {level ?? '—'}
            </p>
          </div>
        )
      })}
      {Array.from({ length: Math.max(0, 8 - members.length) }, (_, index) => (
        <div key={`empty-${index}`} aria-label="Empty character slot" className="min-h-28 rounded border border-dotted border-slate-500 p-2" />
      ))}
    </div>
  )
}
