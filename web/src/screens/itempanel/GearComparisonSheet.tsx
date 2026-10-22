import { sanitizeDollHtml } from '@/lib/safeHtml'
import { Fragment, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { useCharacterDiagnosticsMap, useCharacters, useDynamicState } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { statBadgeClass } from '@/lib/itemActionBanner'
import { comparisonSlotsFor, detailMeta, itemMaximumLevel, propertiesAtLevel, STAT_SCROLLS } from '@/lib/itemFormulas'
import { GameBox } from '@/components/GameBox'
import { titledName } from '@/lib/itemCardLines'
import { STAT_COLORS as S } from '@/lib/statColors'
import type { EquippedEntry, Item, ItemMeta, ItemSetInfo, OfflineCharacter } from '@/models'

type Props = Record<string, string | number | boolean>
type Stats = Record<string, number>

// Stat labels in their palette colors, and changes in the game's success and failure
// colors. Console: gear-comparison-dialog.tsx and docs/comparison-card.md.
const STAT_COLORS: Record<string, string> = {
  max_hp: S.hp,
  max_mp: S.mp,
  attack: S.attack,
  frequency: S.frequency,
  range: S.range,
  speed: S.speed,
  armor: S.armor,
  resistance: S.resistance,
  str: S.str,
  int: S.int,
  dex: S.dex,
  vit: S.vit,
  fortitude: S.for,
  luck: S.luck,
  goldBonus: S.gold,
  xpBonus: S.xp,
  evasion: S.evasion,
  reflection: S.reflection,
  lifesteal: S.lifesteal,
  manasteal: S.manasteal,
  apiercing: S.armor,
  rpiercing: S.resistance,
  crit: S.crit,
  dreturn: S.dreturn,
  mp_cost: S.mp,
  output: S.output,
}
const GAIN = '#85C76B',
  LOSS = '#E13758'

/** The character's projected totals (HP, MP,
 *  attack, speeds, armor, resistance, attributes, combat stats) with the
 *  current item and with this one, each side's level and stat-scroll
 *  preview, the character doll, and set changes (GAINED / LOST). The base
 *  stats are the character's diagnostics from the core fetch. */
export function GearComparisonSheet({
  item,
  meta: liveMeta,
  characterName,
  slot: pickedSlot,
  offline,
  onClose,
}: {
  item: Item
  meta: ItemMeta | undefined
  characterName: string
  slot?: string
  // A character that is not loaded: its saved equipment and stats stand in for the live ones.
  offline?: OfflineCharacter
  onClose: () => void
}) {
  const characters = useCharacters()
  const liveDiagnostics = useCharacterDiagnosticsMap()[characterName] ?? {}
  const diagnostics = (offline ?? liveDiagnostics) as typeof liveDiagnostics
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const vitals = offline ?? characters[characterName]?.vitals
  const slots = offline?.slots ?? characters[characterName]?.inventory?.slots ?? {}
  const metaOf = (value: { item: Item; meta?: ItemMeta | null }) => detailMeta(catalogFor(value.item.name)?.meta, value.meta)
  const entryMeta = detailMeta(catalogFor(item.name)?.meta, liveMeta)
  const ctype = vitals?.ctype || diagnostics.ctype || ''

  const candidates = comparisonSlotsFor(entryMeta, ctype)
  if (!candidates.length) candidates.push(String(entryMeta?.definition.type || ''))
  const replacementSlot = pickedSlot || candidates.find((slot) => slots[slot]?.item.name === item.name) || candidates.find((slot) => !slots[slot]) || candidates[0]
  const equipped = slots[replacementSlot] ?? null
  const equippedMeta = equipped ? metaOf(equipped) : undefined

  const [leftLevel, setLeftLevel] = useState(Math.max(0, Number(equipped?.item.level) || 0))
  const [rightLevel, setRightLevel] = useState(Math.max(0, Number(item.level) || 0))
  const [leftStatType, setLeftStatType] = useState(equipped?.item.stat_type || 'none')
  const [rightStatType, setRightStatType] = useState(item.stat_type || 'none')
  const [includeOffhand, setIncludeOffhand] = useState(true)

  const handsFor = (meta: ItemMeta | undefined) => meta?.usage?.classes.find((usage) => usage.id === ctype)?.hands
  const removesOffhand = replacementSlot === 'mainhand' && handsFor(entryMeta) === 2
  const offhand = slots.offhand ?? null
  // Only a one-handed main hand leaves the offhand a choice: the 2H swap
  // drops it, so the current side can be judged with or without it.
  const offerOffhandComparison = removesOffhand && !!equipped && !!offhand && handsFor(equippedMeta) === 1
  const oldProps: Props = equipped ? propertiesAtLevel(equippedMeta, equipped.item, leftLevel, leftStatType === 'none' ? null : leftStatType) : {}
  const newProps = propertiesAtLevel(entryMeta, item, rightLevel, rightStatType === 'none' ? null : rightStatType)
  const prop = (source: Props, key: string) => Number(source[key] || 0)
  const actualEquipment = Object.entries(slots)
    .filter(([slot, value]) => !slot.startsWith('trade') && !!value)
    .map(([slot, value]) => [slot, { ...value!, meta: metaOf(value!) }] as [string, EquippedEntry])
  const currentEquipment = actualEquipment
    .filter(([slot]) => slot !== 'offhand' || !offerOffhandComparison || includeOffhand)
    .map(([slot, value]) =>
    slot === replacementSlot ? ([slot, { ...value, item: { ...value.item, level: leftLevel }, meta: { ...value.meta!, properties: oldProps } }] as [string, EquippedEntry]) : ([slot, value] as [string, EquippedEntry]),
  )
  const proposedEquipment = actualEquipment
    .filter(([slot]) => slot !== replacementSlot && !(removesOffhand && slot === 'offhand'))
    .concat([[replacementSlot, { item: { ...item, level: rightLevel }, meta: { ...entryMeta!, properties: newProps } }]])
  const setDefinitions = new Map<string, ItemSetInfo>()
  ;[...actualEquipment.map(([, value]) => value), { item, meta: entryMeta }].forEach((value) => {
    const set = value.meta?.world?.set
    if (set) setDefinitions.set(set.id, set)
  })
  const setState = (equipment: [string, EquippedEntry][]) => {
    const totals: Stats = {},
      counts: Stats = {}
    setDefinitions.forEach((set, setId) => {
      const allowed = new Set(set.items.map((entry) => entry.id))
      const count = equipment.filter(([, value]) => allowed.has(value.item.name)).length
      counts[setId] = count
      set.bonuses
        // Native G.sets[count] is a total bonus, not cumulative tiers.
        .filter((bonus) => count === bonus.pieces)
        .forEach((bonus) =>
          Object.entries(bonus.stats).forEach(([key, value]) => {
            if (typeof value === 'number') totals[key] = (totals[key] || 0) + value
          }),
        )
    })
    return { totals, counts }
  }
  const actualSets = setState(actualEquipment),
    currentSets = setState(currentEquipment),
    proposedSets = setState(proposedEquipment)
  const equipmentTotals = (equipment: [string, EquippedEntry][]): Props => {
    const totals: Stats = {}
    equipment.forEach(([, value]) =>
      Object.entries(value.meta?.properties || {}).forEach(([key, amount]) => {
        const numeric = Number(amount)
        if (Number.isFinite(numeric)) totals[key] = (totals[key] || 0) + numeric
      }),
    )
    return totals
  }
  // The diagnostics already include the actual gear and its active sets.
  // Both previews anchor there, so dropping an offhand also drops its set share.
  const actualTotals = equipmentTotals(actualEquipment)

  const character: Stats & { level: number } = {
    level: Number(vitals?.level || diagnostics.level || 0),
    max_hp: Number(vitals?.max_hp || 0),
    max_mp: Number(vitals?.max_mp || 0),
  }
  const base = diagnostics as Record<string, unknown>
  const num = (key: string) => Number(base[key] || 0)
  const strArmor = (value: number) => Math.min(value, 160) + Math.max(0, value - 160) * 0.25
  const intRes = (value: number) => Math.min(value, 180) + Math.max(0, value - 180) * 0.25
  const statSpeed = (str: number, dex: number) => Math.min(str, 256) / 64 + Math.min(dex, 256) / 32
  const statFrequency = (intelligence: number, dexterity: number) => intelligence / 1575 + Math.min(160, dexterity) / 640 + Math.max(0, dexterity - 160) / 925
  const oldWeaponAttack = actualEquipment.filter(([slot]) => slot === 'mainhand' || slot === 'offhand').reduce((sum, [, value]) => sum + Number(value?.meta?.properties?.attack || 0), 0)
  const primary = String(diagnostics.primaryStat || '').toLowerCase()
  const divisor = ctype === 'paladin' && primary === 'int' ? 40 : 20
  const oldPrimary = num(primary)
  const combat = (diagnostics.combatStats || {}) as Record<string, unknown>
  const project = (totals: Props, setTotals: Stats): Stats => {
    const delta = (key: string) => prop(totals, key) - prop(actualTotals, key) + Number(setTotals[key] || 0) - Number(actualSets.totals[key] || 0)
    const result: Stats = {}
    result.str = num('str') + delta('str')
    result.int = num('int') + delta('int')
    result.dex = num('dex') + delta('dex')
    result.vit = num('vit') + delta('vit')
    result.luck = num('luck') + delta('luck')
    result.fortitude = num('fortitude') + delta('for')
    result.goldBonus = num('goldBonus') + delta('gold')
    result.xpBonus = num('xpBonus') + delta('xp')
    result.max_hp = character.max_hp + delta('hp') + delta('str') * 21 + delta('vit') * (48 + character.level / 3)
    result.max_mp = character.max_mp + delta('mp') + delta('int') * 15
    result.armor = num('armor') + delta('armor') + strArmor(result.str) - strArmor(num('str'))
    result.resistance = num('resistance') + delta('resistance') + intRes(result.int) - intRes(num('int'))
    result.speed =
      (ctype === 'merchant' ? ((base.unrestrictedSpeed as number | undefined) ?? (base.standOpen ? NaN : num('speed'))) : num('speed')) +
      delta('speed') +
      statSpeed(result.str, result.dex) -
      statSpeed(num('str'), num('dex'))
    // Equipment and set frequency use hundredths of an attack per second.
    result.frequency = num('frequency') + delta('frequency') / 100 + statFrequency(result.int, result.dex) - statFrequency(num('int'), num('dex'))
    result.range = num('range') + delta('range')
    const weaponAttack = Math.max(0, oldWeaponAttack + delta('attack'))
    const newPrimary = Number(result[primary] || 0)
    result.attack = num('attack') + weaponAttack * (1 + newPrimary / divisor) - oldWeaponAttack * (1 + oldPrimary / divisor)
    result.evasion = Number(combat.evasion || 0) + delta('evasion')
    result.reflection = Number(combat.reflection || 0) + delta('reflection')
    result.lifesteal = Number(combat.lifesteal || 0) + delta('lifesteal')
    result.manasteal = Number(combat.manasteal || 0) + delta('manasteal')
    result.rpiercing = Number(combat.resistancePiercing || 0) + delta('rpiercing')
    result.apiercing = Number(combat.armorPiercing || 0) + delta('apiercing')
    result.crit = Number(combat.crit || 0) + delta('crit')
    result.dreturn = Number(combat.damageReturn || 0) + delta('dreturn')
    result.mp_cost = Number(combat.mpCost || 0) + delta('mp_cost')
    result.output = Number(combat.output || 0) + delta('output')
    return result
  }
  const currentPreview = project(equipmentTotals(currentEquipment), currentSets.totals)
  const projected = project(equipmentTotals(proposedEquipment), proposedSets.totals)
  const rows: [string, string, (value: number) => string][] = [
    ['HP', 'max_hp', (v) => Math.round(v).toLocaleString()],
    ['MP', 'max_mp', (v) => Math.round(v).toLocaleString()],
    ['Attack', 'attack', (v) => v.toFixed(1)],
    ['Attack speed', 'frequency', (v) => v.toFixed(3)],
    ['Range', 'range', (v) => v.toFixed(1)],
    ['Run speed', 'speed', (v) => (Number.isFinite(v) ? v.toFixed(2) : 'Unavailable')],
    ['Armor', 'armor', (v) => v.toFixed(1)],
    ['Resistance', 'resistance', (v) => v.toFixed(1)],
    ['STR', 'str', (v) => v.toFixed(0)],
    ['INT', 'int', (v) => v.toFixed(0)],
    ['DEX', 'dex', (v) => v.toFixed(0)],
    ['VIT', 'vit', (v) => v.toFixed(0)],
    ['Fortitude', 'fortitude', (v) => v.toFixed(1)],
    ['Luck', 'luck', (v) => `${v.toFixed(1)}%`],
    ['Gold', 'goldBonus', (v) => `${v.toFixed(2)}%`],
    ['XP', 'xpBonus', (v) => `${v.toFixed(2)}%`],
    ['Evasion', 'evasion', (v) => `${v.toFixed(3)}%`],
    ['Reflection', 'reflection', (v) => `${v.toFixed(3)}%`],
    ['Lifesteal', 'lifesteal', (v) => `${v.toFixed(3)}%`],
    ['Manasteal', 'manasteal', (v) => `${v.toFixed(3)}%`],
    ['Armor piercing', 'apiercing', (v) => v.toFixed(2)],
    ['Resistance piercing', 'rpiercing', (v) => v.toFixed(2)],
    ['Critical hit', 'crit', (v) => `${v.toFixed(3)}%`],
    ['Damage return', 'dreturn', (v) => `${v.toFixed(2)}%`],
    ['MP cost reduction', 'mp_cost', (v) => `${v.toFixed(2)}%`],
    ['Output', 'output', (v) => `${v.toFixed(3)}%`],
  ]
  const changedSets = Array.from(setDefinitions.values()).filter((set) => currentSets.counts[set.id] !== proposedSets.counts[set.id])
  const nameOf = (value: Item, meta?: ItemMeta | null) => titledName(String(meta?.definition.name || catalogFor(value.name)?.name || value.name), value.p)
  const name = `${nameOf(item, entryMeta)} +${rightLevel}`

  const statButtons = (proposed: boolean) => {
    const meta = proposed ? entryMeta : equippedMeta
    if (!meta?.definition.stat) return null
    const selected = proposed ? rightStatType : leftStatType
    const select = proposed ? setRightStatType : setLeftStatType
    const primaryStats = ['str', 'int', 'dex', 'vit']
    const exoticSelected = selected !== 'none' && !primaryStats.includes(selected) ? selected : 'none'
    return (
      <div className="flex flex-wrap gap-1" aria-label="Preview with stat scroll">
        {['none', ...primaryStats].map((statType) => (
          <Button
            key={statType}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={selected === statType}
            onClick={() => select(statType)}
            className={`h-8 min-w-10 px-2 font-mono text-[9px] uppercase ${selected === statType ? (statType === 'none' ? 'bg-slate-800 text-white' : statBadgeClass(statType)) : ''}`}
          >
            {statType === 'none' ? 'No stat' : statType}
          </Button>
        ))}
        <select
          aria-label="Preview with exotic stat scroll"
          value={exoticSelected}
          onChange={(event) => {
            const value = event.target.value
            if (value !== 'none') select(value)
            else if (exoticSelected !== 'none') select('none')
          }}
          className="h-8 rounded-md border border-violet-700 bg-background px-2 text-xs"
        >
          <option value="none">Exotic stat…</option>
          {STAT_SCROLLS.filter((choice) => !choice.purchasable).map((choice) => (
            <option key={choice.stat} value={choice.stat}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // Each panel spans the same five shared rows (header, stat scroll buttons, notice, level
  // slider, stats), so a notice or slider on one side only never pushes its stats out of
  // line with the other. A row with content pads its own bottom, so an empty row adds no gap.
  const panel = (candidate: Stats, proposed: boolean) => {
    const meta = proposed ? entryMeta : equippedMeta
    const level = proposed ? rightLevel : leftLevel
    const buttons = statButtons(proposed)
    const notice =
      !proposed && offerOffhandComparison && offhand ? (
        <label className="flex items-center gap-2 rounded border border-border p-3 text-sm">
          <input type="checkbox" aria-label="include offhand weapon in comparison" checked={includeOffhand} onChange={(event) => setIncludeOffhand(event.target.checked)} className="h-4 w-4" />
          <span>
            include offhand weapon in comparison
            <span className="block text-xs text-muted-foreground">
              {nameOf(offhand.item, metaOf(offhand))} +{offhand.item.level || 0}
            </span>
          </span>
        </label>
      ) : proposed && removesOffhand && offhand ? (
        <p className="text-sm text-cyan-400">Two-handed weapon · unequips {nameOf(offhand.item, metaOf(offhand))}</p>
      ) : null
    const slider =
      meta?.upgradeable || meta?.compoundable ? (
        <div className="rounded border border-violet-900/70 p-3">
          <div className="mb-2 flex justify-between font-mono text-[10px] uppercase text-violet-400">
            <span>Preview level</span>
            <span>+{level}</span>
          </div>
          <Slider
            min={0}
            max={itemMaximumLevel(meta)}
            step={1}
            value={[level]}
            onValueChange={(value) => (proposed ? setRightLevel : setLeftLevel)(Array.isArray(value) ? value[0] || 0 : Number(value) || 0)}
          />
        </div>
      ) : null
    return (
      <section aria-label={proposed ? 'With this item' : 'Currently equipped'} className={`row-span-5 grid min-w-0 grid-rows-subgrid gap-y-0 rounded-lg border p-3 ${proposed ? 'border-cyan-800' : 'border-border'}`}>
        <div className="flex items-center gap-3 pb-3">
          {/* The game's own character doll markup. */}
          <div className="h-20 w-16 shrink-0 overflow-hidden" dangerouslySetInnerHTML={diagnostics.characterDollHtml ? { __html: sanitizeDollHtml(diagnostics.characterDollHtml) } : undefined} />
          <div className="min-w-0">
            <p className="font-semibold">{proposed ? name : equipped ? `${nameOf(equipped.item, equippedMeta)} +${leftLevel}` : 'Empty slot'}</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {proposed ? `Replaces ${replacementSlot}${equipped ? ` · ${nameOf(equipped.item, equippedMeta)}` : ' · empty slot'}` : characterName}
            </p>
          </div>
        </div>
        <div className={buttons ? 'pb-3' : undefined}>{buttons}</div>
        <div className={notice ? 'pb-3' : undefined}>{notice}</div>
        <div className={slider ? 'pb-3' : undefined}>{slider}</div>
        <GameBox group label={proposed ? 'Proposed stats' : 'Equipped stats'}>
          {rows.map(([label, key, format]) => {
            const value = Number(candidate[key] || 0)
            const original = Number(currentPreview[key] || 0)
            const change = value - original
            const changed = proposed && Math.abs(change) > 0.0001
            const percentChange = original === 0 ? null : (change / Math.abs(original)) * 100
            return (
              <div key={label} data-line={key} className="md:whitespace-nowrap">
                <span data-label style={{ color: STAT_COLORS[key] }}>
                  {label}
                </span>
                : {format(value)}
                {changed ? (
                  <span data-change className="ml-1 whitespace-nowrap" style={{ color: change > 0 ? GAIN : LOSS }}>
                    ({change > 0 ? '+' : '-'}
                    {format(Math.abs(change))} · {percentChange === null ? 'new' : `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`})
                  </span>
                ) : null}
              </div>
            )
          })}
        </GameBox>
      </section>
    )
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-4">
        <div className="mb-3">
          <div className="text-sm font-medium">Equipment comparison</div>
          <p className="text-xs text-muted-foreground">Move either slider independently. Green improves the left preview; red reduces it. Nothing in inventory is changed.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {panel(currentPreview, false)}
          {panel(projected, true)}
        </div>
        {changedSets.length ? (
          <GameBox label="Set changes" className="mt-3">
            <h3 className="inline-block border-b-2 border-dashed border-[#808080] font-semibold text-[#f1c054]">Set changes</h3>
            <div className="mt-2 space-y-2">
              {changedSets.map((set) => {
                const before = currentSets.counts[set.id] || 0,
                  after = proposedSets.counts[set.id] || 0
                return (
                  <div key={set.id}>
                    <p>
                      <span className="text-[#f1c054]">{set.name}</span>: {before}/{set.items.length} →{' '}
                      <span style={{ color: after > before ? GAIN : LOSS }}>
                        {after}/{set.items.length}
                      </span>
                    </p>
                    <p className="pl-3 text-[12px] text-[#C3C3C3]">
                      {set.bonuses.map((bonus, index) => {
                        const was = before === bonus.pieces,
                          becomes = after === bonus.pieces
                        const stats = Object.entries(bonus.stats)
                          .map(([key, value]) => `${key.toUpperCase()} +${value}`)
                          .join(', ')
                        const outcome = !was && becomes ? 'GAINED' : was && !becomes ? 'LOST' : null
                        return (
                          <Fragment key={bonus.pieces}>
                            {index ? ' · ' : ''}
                            {bonus.pieces} pieces: {stats}
                            {outcome ? (
                              <>
                                {' · '}
                                <span style={{ color: outcome === 'GAINED' ? GAIN : LOSS }}>{outcome}</span>
                              </>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </p>
                  </div>
                )
              })}
            </div>
          </GameBox>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
