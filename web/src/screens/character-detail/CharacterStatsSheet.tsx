import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { CharacterDiagnostics, CharacterVitals, EquippedEntry } from '@/models'

/** display-character.ts displayRunSpeed, verbatim. */
export function displayRunSpeed(character: { ctype: string; speed?: number; unrestrictedSpeed?: number | null; standOpen?: boolean }): number | null {
  if (character.ctype === 'merchant') {
    if (typeof character.unrestrictedSpeed === 'number' && Number.isFinite(character.unrestrictedSpeed)) return character.unrestrictedSpeed
    if (character.standOpen) return null
  }
  return character.speed ?? null
}

/** character-stats-dialog.tsx: level, HP/MP, attack, speeds, armor and
 *  resistance with their damage reduction, STR/INT/DEX/VIT/FOR effects
 *  (primary stat marked), luck, and the combat stats. */
export function CharacterStatsSheet({
  name,
  vitals,
  diagnostics,
  slots,
  onClose,
}: {
  name: string
  vitals: CharacterVitals
  diagnostics: CharacterDiagnostics
  slots: Record<string, EquippedEntry | null>
  onClose: () => void
}) {
  const character = { ...diagnostics, ...vitals, ctype: vitals.ctype || diagnostics.ctype || '', level: vitals.level || Number(diagnostics.level || 0) }
  const combat = (diagnostics.combatStats ?? {}) as Record<string, number | undefined>
  const primary = String(character.primaryStat || '').toLowerCase()
  const equippedWeaponAttack = Object.entries(slots)
    .filter(([slot]) => slot === 'mainhand' || slot === 'offhand')
    .reduce((sum, [, entry]) => sum + Number(entry?.meta?.properties?.attack || 0), 0)
  const primaryAttack = (stat: string, value: number) => {
    if (character.ctype === 'paladin' && stat === 'int') return `weapon ATK × ${value}/40`
    if (primary === stat) return `weapon ATK × ${value}/20`
    return null
  }
  const attributeEffect = (stat: 'str' | 'int' | 'dex', value: number) => {
    const effects: string[] = []
    if (primaryAttack(stat, value)) {
      const divisor = character.ctype === 'paladin' && stat === 'int' ? 40 : 20
      effects.push(`+${((equippedWeaponAttack * value) / divisor).toFixed(1)} attack total · +${(equippedWeaponAttack / divisor).toFixed(2)} per point`)
    }
    if (stat === 'str') {
      effects.push(`+${Math.round(value * 21).toLocaleString()} max HP · +21 per point`)
      effects.push(`+${(Math.min(value, 160) + Math.max(0, value - 160) * 0.25).toLocaleString()} armor · +${value < 160 ? '1' : '0.25'} per next point`)
      effects.push(`+${(Math.min(value, 256) / 64).toFixed(2)} run speed · +${value < 256 ? '0.0156' : '0'} per next point`)
    } else if (stat === 'int') {
      effects.push(`+${Math.round(value * 15).toLocaleString()} max MP · +15 per point`)
      effects.push(`+${(Math.min(value, 180) + Math.max(0, value - 180) * 0.25).toLocaleString()} resistance · +${value < 180 ? '1' : '0.25'} per next point`)
      effects.push(`+${(value / 1575).toFixed(3)} attacks/sec · +0.000635 per point`)
    } else {
      effects.push(`+${(Math.min(value, 256) / 32).toFixed(2)} run speed · +${value < 256 ? '0.0313' : '0'} per next point`)
      effects.push(`+${(Math.min(160, value) / 640 + Math.max(value - 160, 0) / 925).toFixed(3)} attacks/sec · +${value < 160 ? '0.00156' : '0.00108'} per next point`)
    }
    return `${value.toLocaleString()}${primary === stat ? ' · PRIMARY' : ''}\n${effects.join(' · ')}`
  }
  const damageMultiplier = (defense: number) =>
    Math.min(
      1.32,
      Math.max(
        0.05,
        1 -
          (Math.max(0, Math.min(100, defense)) * 0.001 +
            Math.max(0, Math.min(100, defense - 100)) * 0.001 +
            Math.max(0, Math.min(100, defense - 200)) * 0.00095 +
            Math.max(0, Math.min(100, defense - 300)) * 0.0009 +
            Math.max(0, Math.min(100, defense - 400)) * 0.00082 +
            Math.max(0, Math.min(100, defense - 500)) * 0.0007 +
            Math.max(0, Math.min(100, defense - 600)) * 0.0006 +
            Math.max(0, Math.min(100, defense - 700)) * 0.0005 +
            Math.max(0, defense - 800) * 0.0004),
      ),
    )
  const vitality = Number(character.vit || 0)
  const fortitude = Number(character.fortitude || 0)
  const vitalityHp = vitality * (48 + character.level / 3)
  const fortitudeMultiplier = damageMultiplier(fortitude * 5)
  const armorMultiplier = damageMultiplier(Number(character.armor || 0))
  const resistanceMultiplier = damageMultiplier(Number(character.resistance || 0))
  const runSpeed = displayRunSpeed(character as Parameters<typeof displayRunSpeed>[0])
  const stats: [string, string | number][] = [
    ['Level', character.level],
    ['HP', `${vitals.hp.toLocaleString()} / ${vitals.max_hp.toLocaleString()}`],
    ['MP', `${vitals.mp.toLocaleString()} / ${vitals.max_mp.toLocaleString()}`],
    ['Attack', Number(character.attack || 0).toLocaleString()],
    ['Attack speed', Number(character.frequency || 0).toFixed(2)],
    ['Range', Number(character.range || 0).toLocaleString()],
    ['Run speed', runSpeed === null ? 'Waiting for speed data' : `${runSpeed.toFixed(2)}${character.ctype === 'merchant' ? ' · before movement restrictions' : ''}`],
    ['Armor', `${Number(character.armor || 0).toLocaleString()}\n${((1 - armorMultiplier) * 100).toFixed(2)}% physical damage reduction · a 100-damage physical hit becomes ${(100 * armorMultiplier).toFixed(1)}`],
    ['Resistance', `${Number(character.resistance || 0).toLocaleString()}\n${((1 - resistanceMultiplier) * 100).toFixed(2)}% magical damage reduction · a 100-damage magical hit becomes ${(100 * resistanceMultiplier).toFixed(1)}`],
    ['Strength', attributeEffect('str', Number(character.str || 0))],
    ['Intelligence', attributeEffect('int', Number(character.int || 0))],
    ['Dexterity', attributeEffect('dex', Number(character.dex || 0))],
    ['Vitality', `${vitality.toLocaleString()}\n+${Math.round(vitalityHp).toLocaleString()} max HP · ${(48 + character.level / 3).toFixed(2)} HP per VIT at level ${character.level}`],
    ['Fortitude', `${fortitude.toLocaleString()}\n${((1 - fortitudeMultiplier) * 100).toFixed(2)}% less incoming PvP damage · no PvE reduction`],
    ['Luck', `${Number(character.luck || 100).toLocaleString()}%`],
    ['Armor piercing', Number(combat.armorPiercing || 0).toLocaleString()],
    ['Resistance piercing', Number(combat.resistancePiercing || 0).toLocaleString()],
    ['Poison resistance', Number(combat.poisonResistance || 0).toLocaleString()],
    ['Fire resistance', Number(combat.fireResistance || 0).toLocaleString()],
    ['Freeze resistance', Number(combat.freezeResistance || 0).toLocaleString()],
    ['Physical resistance', Number(combat.physicalResistance || 0).toLocaleString()],
    ['Status resistance', Number(combat.statusResistance || 0).toLocaleString()],
    ['Blast resistance', Number(combat.blastResistance || 0).toLocaleString()],
    ['Critical chance', `${Number(combat.crit || 0).toLocaleString()}%`],
    ['Critical damage', `${(200 + Number(combat.critDamage || 0)).toLocaleString()}%`],
    ['Evasion', `${Number(combat.evasion || 0).toLocaleString()}%`],
    ['Miss chance', `${Number(combat.miss || 0).toLocaleString()}%`],
    ['Lifesteal', `${Number(combat.lifesteal || 0).toLocaleString()}%`],
    ['Manasteal', `${Number(combat.manasteal || 0).toLocaleString()}%`],
    ['Damage return', `${Number(combat.damageReturn || 0).toLocaleString()}%`],
    ['Reflection', `${Number(combat.reflection || 0).toLocaleString()}%`],
    ['MP cost', Number(combat.mpCost || 0).toLocaleString()],
    ['Heal', Number(combat.heal || 0).toLocaleString()],
    ['Output', `${Number(combat.output || 0).toLocaleString()}%`],
  ]
  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" aria-label={`${name} stats`} className="max-h-[88vh] overflow-y-auto p-4">
        <p className="text-base font-semibold">{name}</p>
        <p className="mb-3 text-sm uppercase text-muted-foreground">
          Level {character.level} {character.ctype} {character.primaryStat || ''}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {stats.map(([label, value]) => (
            <div key={label} role="group" aria-label={label} className="rounded border border-border p-2.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className={`mt-1 whitespace-pre-line font-mono font-semibold ${['Strength', 'Intelligence', 'Dexterity', 'Vitality', 'Fortitude'].includes(label) ? 'text-xs leading-5' : 'text-base'}`}>{value}</div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
