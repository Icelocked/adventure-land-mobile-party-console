import type { ReactNode } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { GameBox, GameLine } from '@/components/GameBox'
import { useStoredBoolean } from '@/hooks/useStoredBoolean'
import { STAT_COLORS as S } from '@/lib/statColors'
import type { CharacterDiagnostics, CharacterVitals, EquippedEntry } from '@/models'

export function displayRunSpeed(character: { ctype: string; speed?: number; unrestrictedSpeed?: number | null; standOpen?: boolean }): number | null {
  if (character.ctype === 'merchant') {
    if (typeof character.unrestrictedSpeed === 'number' && Number.isFinite(character.unrestrictedSpeed)) return character.unrestrictedSpeed
    if (character.standOpen) return null
  }
  return character.speed ?? null
}

// The console's character-stats-dialog.tsx and docs/character-card.md: the game's
// character panel (render_character in the game's js/html.js) beside every other entry.
type Effect = { key: string; value: string; color: string; detail?: string }
type Extra = { key: string; label: string; value: string; color: string; note?: ReactNode; effects?: Effect[] }

// The panel's lines take their stat colors instead of the game's gray.
const HP = S.hp,
  MP = S.mp,
  ARMOR = S.armor,
  RESISTANCE = S.resistance,
  SPEED = S.speed,
  ATTACK = S.attack

function ExtraEntry({ entry }: { entry: Extra }) {
  // Each breakdown starts open and keeps its open or closed state across characters and reloads.
  const [open, setOpen] = useStoredBoolean(`party-character-effects-${entry.key}`, true)
  const heading = (
    <>
      <span data-label style={{ color: entry.color }}>
        {entry.label}
      </span>
      : {entry.value}
      {entry.note}
    </>
  )
  if (!entry.effects?.length)
    return (
      <div data-line={entry.key} className="break-inside-avoid">
        {heading}
      </div>
    )
  return (
    <div data-line={entry.key} className="break-inside-avoid">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="-ml-3 text-left hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#808080]">
        <span aria-hidden className={`inline-block w-3 text-[#808080] transition-transform ${open ? 'rotate-90' : ''}`}>
          ▸
        </span>
        {heading}
      </button>
      {open &&
        entry.effects.map((effect) => (
          <div key={effect.key} data-effect={effect.key} className="pl-3 text-[12px]">
            <span data-value style={{ color: effect.color }}>
              {effect.value}
            </span>
            {effect.detail ? <span className="text-[#808080]"> {effect.detail}</span> : null}
          </div>
        ))}
    </div>
  )
}

/** The game's character panel beside an extras box: the attributes with their
 *  collapsible effects, armor and resistance with their damage reduction, the
 *  unrestricted run speed, luck and the combat stats. */
export function CharacterStatsSheet({
  name,
  vitals,
  diagnostics,
  slots,
  offline = false,
  onClose,
}: {
  name: string
  vitals: CharacterVitals
  diagnostics: CharacterDiagnostics
  slots: Record<string, EquippedEntry | null>
  // A saved observation of a character that is not loaded (character-stats-dialog.tsx:528).
  offline?: boolean
  onClose: () => void
}) {
  const character = { ...diagnostics, ...vitals, ctype: vitals.ctype || diagnostics.ctype || '', level: vitals.level || Number(diagnostics.level || 0) }
  const combat = (diagnostics.combatStats ?? {}) as Record<string, number | undefined>
  const primary = String(character.primaryStat || '').toLowerCase()
  const equippedWeaponAttack = Object.entries(slots)
    .filter(([slot]) => slot === 'mainhand' || slot === 'offhand')
    .reduce((sum, [, entry]) => sum + Number(entry?.meta?.properties?.attack || 0), 0)
  const attributeEffects = (stat: 'str' | 'int' | 'dex', value: number): Effect[] => {
    const effects: Effect[] = []
    const attackDivisor = character.ctype === 'paladin' && stat === 'int' ? 40 : primary === stat ? 20 : 0
    if (attackDivisor)
      effects.push({
        key: 'attack',
        color: ATTACK,
        value: `+${((equippedWeaponAttack * value) / attackDivisor).toFixed(1)} Attack`,
        detail: `+${(equippedWeaponAttack / attackDivisor).toFixed(2)} per point`,
      })
    if (stat === 'str') {
      effects.push({ key: 'max_hp', color: HP, value: `+${Math.round(value * 21).toLocaleString()} Max HP`, detail: '+21 per point' })
      effects.push({ key: 'armor', color: ARMOR, value: `+${(Math.min(value, 160) + Math.max(0, value - 160) * 0.25).toLocaleString()} Armor`, detail: `+${value < 160 ? '1' : '0.25'} per next point` })
      effects.push({ key: 'run_speed', color: SPEED, value: `+${(Math.min(value, 256) / 64).toFixed(2)} Run Speed`, detail: `+${value < 256 ? '0.0156' : '0'} per next point` })
    } else if (stat === 'int') {
      effects.push({ key: 'max_mp', color: MP, value: `+${Math.round(value * 15).toLocaleString()} Max MP`, detail: '+15 per point' })
      effects.push({
        key: 'resistance',
        color: RESISTANCE,
        value: `+${(Math.min(value, 180) + Math.max(0, value - 180) * 0.25).toLocaleString()} Resistance`,
        detail: `+${value < 180 ? '1' : '0.25'} per next point`,
      })
      effects.push({ key: 'attack_speed', color: S.frequency, value: `+${(value / 1575).toFixed(3)} Attacks/sec`, detail: '+0.000635 per point' })
    } else {
      effects.push({ key: 'run_speed', color: SPEED, value: `+${(Math.min(value, 256) / 32).toFixed(2)} Run Speed`, detail: `+${value < 256 ? '0.0313' : '0'} per next point` })
      effects.push({
        key: 'attack_speed',
        color: S.frequency,
        value: `+${(Math.min(160, value) / 640 + Math.max(value - 160, 0) / 925).toFixed(3)} Attacks/sec`,
        detail: `+${value < 160 ? '0.00156' : '0.00108'} per next point`,
      })
    }
    return effects
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
  const attribute = (key: 'str' | 'int' | 'dex', label: string, color: string): Extra => ({
    key,
    label,
    color,
    value: Number(character[key] || 0).toLocaleString(),
    effects: attributeEffects(key, Number(character[key] || 0)),
    note: primary === key ? <span className="text-[gold]"> Primary</span> : undefined,
  })
  const plain = (key: string, label: string, color: string, value: string): Extra => ({ key, label, color, value })
  const extras: Extra[] = [
    attribute('str', 'Strength', S.str),
    attribute('int', 'Intelligence', S.int),
    attribute('dex', 'Dexterity', S.dex),
    {
      key: 'vit',
      label: 'Vitality',
      color: HP,
      value: vitality.toLocaleString(),
      effects: [{ key: 'max_hp', color: HP, value: `+${Math.round(vitalityHp).toLocaleString()} Max HP`, detail: `${(48 + character.level / 3).toFixed(2)} HP per VIT at level ${character.level}` }],
    },
    {
      key: 'for',
      label: 'Fortitude',
      color: S.for,
      value: fortitude.toLocaleString(),
      effects: [{ key: 'pvp', color: S.for, value: `${((1 - fortitudeMultiplier) * 100).toFixed(2)}% less incoming PvP damage`, detail: 'no PvE reduction' }],
    },
    {
      key: 'armor',
      label: 'Armor',
      color: ARMOR,
      value: Number(character.armor || 0).toLocaleString(),
      effects: [
        { key: 'reduction', color: ARMOR, value: `${((1 - armorMultiplier) * 100).toFixed(2)}% physical damage reduction`, detail: `a 100-damage physical hit becomes ${(100 * armorMultiplier).toFixed(1)}` },
      ],
    },
    {
      key: 'resistance',
      label: 'Resistance',
      color: RESISTANCE,
      value: Number(character.resistance || 0).toLocaleString(),
      effects: [
        {
          key: 'reduction',
          color: RESISTANCE,
          value: `${((1 - resistanceMultiplier) * 100).toFixed(2)}% magical damage reduction`,
          detail: `a 100-damage magical hit becomes ${(100 * resistanceMultiplier).toFixed(1)}`,
        },
      ],
    },
    {
      key: 'run_speed',
      label: 'Run Speed',
      color: SPEED,
      value: runSpeed === null ? 'Waiting for speed data' : runSpeed.toFixed(2),
      note: runSpeed !== null && character.ctype === 'merchant' ? <span className="text-[#808080]"> before movement restrictions</span> : undefined,
    },
    plain('luck', 'Luck', S.luck, `${Number(character.luck || 100).toLocaleString()}%`),
    plain('crit', 'Crit', S.crit, `${Number(combat.crit || 0).toLocaleString()}%`),
    plain('critdamage', 'Crit Damage', S.critdamage, `${(200 + Number(combat.critDamage || 0)).toLocaleString()}%`),
    plain('evasion', 'Evasion', S.evasion, `${Number(combat.evasion || 0).toLocaleString()}%`),
    plain('miss', 'Miss', S.miss, `${Number(combat.miss || 0).toLocaleString()}%`),
    plain('lifesteal', 'Lifesteal', S.lifesteal, `${Number(combat.lifesteal || 0).toLocaleString()}%`),
    plain('manasteal', 'Manasteal', S.manasteal, `${Number(combat.manasteal || 0).toLocaleString()}%`),
    plain('dreturn', 'D.Return', S.dreturn, `${Number(combat.damageReturn || 0).toLocaleString()}%`),
    plain('reflection', 'Reflection', S.reflection, `${Number(combat.reflection || 0).toLocaleString()}%`),
    plain('apiercing', 'A.Piercing', ARMOR, Number(combat.armorPiercing || 0).toLocaleString()),
    plain('rpiercing', 'R.Piercing', RESISTANCE, Number(combat.resistancePiercing || 0).toLocaleString()),
    plain('pnresistance', 'Poison Res.', S.pnresistance, Number(combat.poisonResistance || 0).toLocaleString()),
    plain('firesistance', 'Fire Res.', S.firesistance, Number(combat.fireResistance || 0).toLocaleString()),
    plain('fzresistance', 'Freeze Res.', S.fzresistance, Number(combat.freezeResistance || 0).toLocaleString()),
    plain('phresistance', 'Physical Res.', S.phresistance, Number(combat.physicalResistance || 0).toLocaleString()),
    plain('stresistance', 'Status Res.', S.stresistance, Number(combat.statusResistance || 0).toLocaleString()),
    plain('blastresistance', 'Blast Res.', S.blastresistance, Number(combat.blastResistance || 0).toLocaleString()),
    plain('mp_cost', 'MP Cost', MP, Number(combat.mpCost || 0).toLocaleString()),
    plain('heal', 'Heal', S.heal, Number(combat.heal || 0).toLocaleString()),
    plain('output', 'Output', S.output, `${Number(combat.output || 0).toLocaleString()}%`),
  ]
  // The game tags ATT while cursed and ATTSPD while poisoned (info_line in js/html.js).
  const has = (id: string) => (vitals.conditions || []).some((condition) => condition.id === id)
  const tag = (text: string, color: string) => <span style={{ color }}> [{text}]</span>
  const heal = Number(combat.heal || 0)
  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" aria-label={`${name} stats`} className="max-h-[88vh] overflow-y-auto p-4">
        <p className="text-base font-semibold">{name}</p>
        <p className="mb-3 text-sm uppercase text-muted-foreground">
          Level {character.level} {character.ctype} {character.primaryStat || ''}
        </p>
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <GameBox label="Character card" className="w-full shrink-0 sm:w-[14rem]">
            <GameLine line="name" label="NAME" color="gray" value={name} />
            <GameLine line="level" label="LEVEL" color={S.level} value={character.level} />
            <GameLine line="hp" label="HP" color={HP} value={`${vitals.hp}/${vitals.max_hp}`} />
            <GameLine line="mp" label="MP" color={MP} value={`${vitals.mp}/${vitals.max_mp}`} />
            {heal > 0 && <GameLine line="heal" label="HEAL" color={S.heal} value={Math.round(heal)} />}
            <GameLine
              line="attack"
              label="ATT"
              color={ATTACK}
              value={
                <>
                  {Math.round(Number(character.attack || 0))}
                  {has('cursed') && tag('C', '#7D4DAA')}
                </>
              }
            />
            <GameLine
              line="frequency"
              label="ATTSPD"
              color={S.frequency}
              value={
                <>
                  {Math.round(Number(character.frequency || 0) * 100)}
                  {has('poisoned') && tag('P', '#45993F')}
                </>
              }
            />
            <GameLine line="range" label="RANGE" color={S.range} value={Number(character.range || 0)} />
            <GameLine line="speed" label="RUNSPD" color={SPEED} value={Math.round(Number(character.speed || 0))} />
            <GameLine line="armor" label="ARMOR" color={ARMOR} value={Number(character.armor || 0)} />
            <GameLine line="resistance" label="RESIST." color={RESISTANCE} value={Number(character.resistance || 0)} />
            <GameLine line="code" label="CODE" color="gold" value={offline ? 'Offline snapshot' : 'Active'} />
          </GameBox>
          <GameBox label="Character extras" className="min-w-[min(100%,20rem)] flex-1 columns-1 gap-6 pl-7 sm:columns-2">
            {extras.map((entry) => (
              <ExtraEntry key={entry.key} entry={entry} />
            ))}
          </GameBox>
        </div>
      </SheetContent>
    </Sheet>
  )
}
