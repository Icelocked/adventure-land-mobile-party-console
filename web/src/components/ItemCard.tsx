import { GameBox, GameLine, GameText } from '@/components/GameBox'
import { itemCardLines, type ItemCardLine } from '@/lib/itemCardLines'
import type { Item, ItemMeta } from '@/models'

function CardLine({ line, skillHint, onSkill }: { line: ItemCardLine; skillHint: (id: string) => string | undefined; onSkill: (id: string) => void }) {
  if (line.kind === 'text') return <GameText line={line.key} text={line.text} color={line.color} />
  const skill = line.skill
  const value = skill ? (
    <button
      type="button"
      title={skillHint(skill)}
      onClick={() => onSkill(skill)}
      className="underline decoration-dotted underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1924D]"
    >
      {line.value}
    </button>
  ) : (
    line.value
  )
  return <GameLine line={line.key} label={line.label} value={value} color={line.color} valueColor={line.valueColor} />
}

// The game's stat lines for the item. The sheet header already shows the name and
// explanation, so the box starts at the first stat. Console: item-card.tsx ItemCard.
export function ItemCard({
  meta,
  item,
  level,
  properties,
  setName,
  usable,
  skillName,
  skillHint,
  onSkill,
}: {
  meta: ItemMeta | null | undefined
  item: Item
  level: number
  properties: Record<string, unknown>
  setName?: string
  usable: boolean
  skillName: (id: string) => string | undefined
  skillHint: (id: string) => string | undefined
  onSkill: (id: string) => void
}) {
  const lines = itemCardLines({ meta, item, level, properties, setName, usable, skillName }).filter((line) => line.key !== 'explanation')
  return (
    <GameBox label="Item card" className="min-w-[min(100%,16rem)] flex-1">
      {lines.map((line) => (
        <CardLine key={line.key} line={line} skillHint={skillHint} onSkill={onSkill} />
      ))}
    </GameBox>
  )
}

// Colors for the stats-table fields, in the game's palette.
const EXTRA_COLORS: Record<string, string> = {
  equip_slot: '#7AC0F5',
  stackable: '#7AC0F5',
  max_stack_size: '#7AC0F5',
  tier: '#56A244',
  scroll: '#B484E5',
  extra_stat: '#B484E5',
  exclusive: '#FC5F39',
  id: '#808080',
  quantity: '#C3C3C3',
  stat_type: '#B484E5',
}
const EXTRA_LABELS: Record<string, string> = { stat_type: 'Stat Scroll' }
const extraLabel = (key: string) =>
  EXTRA_LABELS[key] ||
  key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

// Fields from the old stats table that have no line on the game's card.
export function ItemExtraStats({ entries }: { entries: [key: string, value: string][] }) {
  return (
    <GameBox label="Item extras" className="min-w-[min(100%,14rem)] flex-1">
      {entries.map(([key, value]) => (
        <GameLine key={key} line={key} label={extraLabel(key)} value={value} color={EXTRA_COLORS[key] || '#808080'} />
      ))}
    </GameBox>
  )
}
