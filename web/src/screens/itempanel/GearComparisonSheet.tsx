import { sanitizeDollHtml } from '@/lib/safeHtml'
import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { useCharacterDiagnosticsMap, useCharacters, useDynamicState } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { statBadgeClass } from '@/lib/itemActionBanner'
import { comparisonSlotsFor, detailMeta, itemMaximumLevel, propertiesAtLevel, STAT_SCROLLS } from '@/lib/itemFormulas'
import type { EquippedEntry, Item, ItemMeta, ItemSetInfo } from '@/models'

type Props = Record<string, string | number | boolean>
type Stats = Record<string, number>

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
  onClose,
}: {
  item: Item
  meta: ItemMeta | undefined
  characterName: string
  slot?: string
  onClose: () => void
}) {
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()[characterName] ?? {}
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const vitals = characters[characterName]?.vitals
  const slots = characters[characterName]?.inventory?.slots ?? {}
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

  const actualOldProps = (equippedMeta?.properties || {}) as Props
  const oldProps: Props = equipped ? propertiesAtLevel(equippedMeta, equipped.item, leftLevel, leftStatType === 'none' ? null : leftStatType) : {}
  const newProps = propertiesAtLevel(entryMeta, item, rightLevel, rightStatType === 'none' ? null : rightStatType)
  const prop = (source: Props, key: string) => Number(source[key] || 0)
  const actualEquipment = Object.entries(slots)
    .filter(([slot, value]) => !slot.startsWith('trade') && !!value)
    .map(([slot, value]) => [slot, { ...value!, meta: metaOf(value!) }] as [string, EquippedEntry])
  const currentEquipment = actualEquipment.map(([slot, value]) =>
    slot === replacementSlot ? ([slot, { ...value, item: { ...value.item, level: leftLevel }, meta: { ...value.meta!, properties: oldProps } }] as [string, EquippedEntry]) : ([slot, value] as [string, EquippedEntry]),
  )
  const proposedEquipment = actualEquipment
    .filter(([slot]) => slot !== replacementSlot)
    .concat([[replacementSlot, { item: { ...item, level: rightLevel }, meta: { ...entryMeta!, properties: newProps } }]])
  const setDefinitions = new Map<string, ItemSetInfo>()
  ;[...currentEquipment.map(([, value]) => value), { item, meta: entryMeta }].forEach((value) => {
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
        .filter((bonus) => count >= bonus.pieces)
        .forEach((bonus) =>
          Object.entries(bonus.stats).forEach(([key, value]) => {
            if (typeof value === 'number') totals[key] = (totals[key] || 0) + value
          }),
        )
    })
    return { totals, counts }
  }
  const currentSets = setState(currentEquipment),
    proposedSets = setState(proposedEquipment)

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
  const project = (replacement: Props, setTotals: Stats): Stats => {
    const delta = (key: string) => prop(replacement, key) - prop(actualOldProps, key) + Number(setTotals[key] || 0) - Number(currentSets.totals[key] || 0)
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
  const currentPreview = project(oldProps, currentSets.totals)
  const projected = project(newProps, proposedSets.totals)
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
  const nameOf = (value: Item, meta?: ItemMeta | null) => String(meta?.definition.name || catalogFor(value.name)?.name || value.name)
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

  const panel = (candidate: Stats, proposed: boolean) => {
    const meta = proposed ? entryMeta : equippedMeta
    const level = proposed ? rightLevel : leftLevel
    return (
      <section aria-label={proposed ? 'With this item' : 'Currently equipped'} className={`rounded-lg border p-3 ${proposed ? 'border-cyan-800' : 'border-border'}`}>
        <div className="mb-3 flex items-center gap-3">
          {/* The game's own character doll markup. */}
          <div className="h-20 w-16 shrink-0 overflow-hidden" dangerouslySetInnerHTML={diagnostics.characterDollHtml ? { __html: sanitizeDollHtml(diagnostics.characterDollHtml) } : undefined} />
          <div className="min-w-0">
            <p className="font-semibold">{proposed ? name : equipped ? `${nameOf(equipped.item, equippedMeta)} +${leftLevel}` : 'Empty slot'}</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {proposed ? `Replaces ${replacementSlot}${equipped ? ` · ${nameOf(equipped.item, equippedMeta)}` : ' · empty slot'}` : characterName}
            </p>
          </div>
        </div>
        <div className="mb-3">{statButtons(proposed)}</div>
        {meta?.upgradeable || meta?.compoundable ? (
          <div className="mb-3 rounded border border-violet-900/70 p-3">
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
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {rows.map(([label, key, format]) => {
            const value = Number(candidate[key] || 0)
            const original = Number(currentPreview[key] || 0)
            const change = value - original
            const changed = proposed && Math.abs(change) > 0.0001
            const percentChange = original === 0 ? null : (change / Math.abs(original)) * 100
            return (
              <div key={label} className="rounded border border-border p-2">
                <div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div>
                <div className={`font-mono font-semibold ${changed && change > 0 ? 'font-bold text-lime-400' : changed && change < 0 ? 'text-rose-400' : ''}`}>
                  {format(value)}
                  {changed ? (
                    <span className="ml-1 whitespace-nowrap text-[10px]">
                      ({change > 0 ? '+' : '-'}
                      {format(Math.abs(change))} · {percentChange === null ? 'new' : `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`})
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
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
          <section aria-label="Set changes" className="mt-3 rounded border border-violet-800 p-3">
            <h3 className="font-mono text-xs uppercase tracking-wider text-violet-400">Set changes</h3>
            <div className="mt-2 space-y-2">
              {changedSets.map((set) => {
                const before = currentSets.counts[set.id] || 0,
                  after = proposedSets.counts[set.id] || 0
                return (
                  <div key={set.id} className="rounded border border-border p-2">
                    <p className="text-sm font-semibold">
                      {set.name}: {before}/{set.items.length} → <span className={after > before ? 'text-emerald-400' : 'text-rose-400'}>{after}/{set.items.length}</span>
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {set.bonuses
                        .map((bonus) => {
                          const was = before >= bonus.pieces,
                            becomes = after >= bonus.pieces
                          const stats = Object.entries(bonus.stats)
                            .map(([key, value]) => `${key.toUpperCase()} +${value}`)
                            .join(', ')
                          return `${bonus.pieces} pieces: ${stats}${!was && becomes ? ' · GAINED' : was && !becomes ? ' · LOST' : ''}`
                        })
                        .join(' · ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
