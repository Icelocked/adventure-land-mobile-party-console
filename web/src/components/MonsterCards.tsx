import { useState } from 'react'
import { GameBox, GameLine, GameText } from '@/components/GameBox'
import { Slider } from '@/components/ui/slider'
import { monsterAtLevel, monsterCardLines, monsterExtras } from '@/lib/itemCardLines'

// Extras labels colored by meaning from the game's palette; anything else reads light gray.
const EXTRA_COLORS: Record<string, string> = {
  respawn: '#7AC0F5',
  aggro: '#E13758',
  rage: '#F36C6E',
  charge: '#36B89E',
  roam: '#36B89E',
  difficulty: 'orange',
  aa: '#E1924D',
  immune: '#A59FFF',
  abilities: '#FC5F39',
  special: 'gold',
  global: '#FFDE2F',
  announce: '#FFDE2F',
  humanoid: '#C6AA62',
  cute: '#FD82F0',
  hit: '#DB2900',
  slots: '#B484E5',
  cbuff: '#CB83AC',
  rbuff: '#CB83AC',
  stationary: '#9FA7B6',
  passive: '#9FA7B6',
}

// The game's monster card and its extras box, shared by the Bestiary sheet and item
// details. A spawn or skill line links to its details where the sheet can drill in.
// Console: dashboard/features/party/monster-card.tsx MonsterCards.
export function MonsterCards({
  definition,
  skillName,
  monsterName,
  onMonster,
  onSkill,
}: {
  definition: Record<string, unknown>
  skillName: (id: string) => string | undefined
  monsterName: (id: string) => string | undefined
  onMonster?: (id: string) => void
  onSkill?: (id: string) => void
}) {
  // A reference preview of a levelled copy; live monsters gain levels over time.
  const [level, setLevel] = useState(1)
  const lines = monsterCardLines(monsterAtLevel(definition, level), skillName, monsterName)
  const extras = monsterExtras(definition, skillName)
  const link = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="underline decoration-dotted underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#808080]">
      {label}
    </button>
  )
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-3">
      <div className="w-full rounded border border-violet-900/70 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] text-violet-200">
          <span className="uppercase text-violet-300">Level preview</span>
          <span>Level {level}</span>
        </div>
        <Slider min={1} max={20} step={1} value={level} aria-label="Monster level preview" onValueChange={(value) => setLevel(typeof value === 'number' ? value : value[0] || 1)} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {level > 1 ? `Gold and drop chance ×${level}. ` : ''}
          Monsters level up while nobody fights them. Damage, speed and attack speed stop growing at level 12, and grow more slowly on maps whose packs keep spawning.
        </p>
      </div>
      <GameBox label="Monster card" className="min-w-[min(100%,14rem)] flex-1">
        {lines.map((line) => {
          if (line.kind === 'text') return <GameText key={line.key} line={line.key} text={line.text} color={line.color} />
          const spawn = line.monster,
            skill = line.skill
          const value = spawn && onMonster ? link(line.value, () => onMonster(spawn)) : skill && onSkill ? link(line.value, () => onSkill(skill)) : line.value
          return <GameLine key={line.key} line={line.key} label={line.label} value={value} color={line.color} />
        })}
      </GameBox>
      {!!extras.length && (
        <GameBox label="Monster extras" className="min-w-[min(100%,14rem)] flex-1">
          {extras.map(([key, label, value]) => (
            <GameLine key={key} line={key} label={label} value={value} color={EXTRA_COLORS[key] || '#C3C3C3'} />
          ))}
        </GameBox>
      )}
    </div>
  )
}
