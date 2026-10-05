import { useState } from 'react'
import { activityLine } from '@/lib/activityLine'
import { CharacterPortrait } from '@/components/CharacterPortrait'
import { SpriteIcon } from '@/components/SpriteIcon'
import { CharacterStatsSheet } from './CharacterStatsSheet'
import type { BestiaryMonster, CharacterDiagnostics, CharacterVitals, EquippedEntry, Sprite } from '@/models'

/** The sticky top of the character detail screen, kept out of the
 *  scrollable body so vitals stay visible while browsing equipment and
 *  inventory below. */
export function VitalsHeader({
  name,
  vitals,
  accountGold,
  bestiaryCatalog,
  resolvedTargetType,
  diagnostics = {},
  slots = {},
  online,
}: {
  name: string
  vitals: CharacterVitals
  accountGold?: number
  bestiaryCatalog: BestiaryMonster[]
  resolvedTargetType?: string | null
  diagnostics?: CharacterDiagnostics
  slots?: Record<string, EquippedEntry | null>
  online: boolean
}) {
  const [statsOpen, setStatsOpen] = useState(false)
  const tracktrix = diagnostics.tracktrix as { active?: boolean; sprite?: Sprite | null; bonuses?: Record<string, number> | null } | undefined
  const ping = vitals.ping ?? diagnostics.ping
  const flags = { ...diagnostics, ...vitals } as { banking?: boolean; bankQueued?: boolean; stocking?: boolean }
  // Instanced caves get a readable name.
  const mapLabel = /^zone_[a-f0-9]+_\d+$/.test(vitals.map) ? 'Cave of Many Dreams' : vitals.map
  const xpFraction = vitals.max_xp && vitals.max_xp > 0 ? Math.min(1, Math.max(0, (vitals.xp ?? 0) / vitals.max_xp)) : null

  return (
    <div className="flex flex-col gap-1.5 border-b border-border p-4">
      <div className="flex items-center gap-3">
        {/* The portrait opens the character's stats. */}
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          aria-label={`View ${name} stats`}
          title={`View ${name} stats`}
          className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-emerald-800/80 bg-[#07100f]"
        >
          <CharacterPortrait html={diagnostics.characterDollHtml} sprite={diagnostics.characterSprite} skin={diagnostics.skin} className="h-full w-full" />
          {tracktrix?.active && tracktrix.sprite && Object.values(tracktrix.bonuses || {}).some((value) => value !== 0) && (
            <span role="img" aria-label="Tracktrix bonuses active" title="Tracktrix bonuses active" className="absolute right-0.5 top-0.5 h-5 w-5 overflow-hidden rounded border border-violet-600 bg-[#101724]">
              <SpriteIcon sprite={tracktrix.sprite} size={18} />
            </span>
          )}
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-label={online ? 'Online' : 'Offline'} className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="truncate text-lg font-semibold">{name}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Lv {vitals.level} {vitals.ctype}
            {vitals.primaryStat ? ` ${vitals.primaryStat}` : ''} · {vitals.server ?? 'realm unknown'} ·{' '}
            {online && typeof ping === 'number' && Number.isFinite(ping) && ping >= 0 ? `${Math.round(ping)}ms` : '—ms'}
          </div>
          {flags.banking ? (
            <span className="rounded bg-amber-300/10 px-2 py-0.5 font-mono text-xs text-amber-400">BANKING</span>
          ) : flags.bankQueued ? (
            <span className="rounded bg-cyan-300/10 px-2 py-0.5 font-mono text-xs text-cyan-400">BANK QUEUED</span>
          ) : flags.stocking ? (
            <span className="rounded bg-violet-300/10 px-2 py-0.5 font-mono text-xs text-violet-400">STOCKING UP</span>
          ) : null}
        </div>
      </div>
      {statsOpen && <CharacterStatsSheet name={name} vitals={vitals} diagnostics={diagnostics} slots={slots} onClose={() => setStatsOpen(false)} />}

      {xpFraction != null && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>XP</span>
            <span>
              {(vitals.xp ?? 0).toLocaleString()} / {vitals.max_xp!.toLocaleString()} ({(xpFraction * 100).toFixed(1)}%)
            </span>
          </div>
          <ProgressBar fraction={xpFraction} color="#FFD54A" />
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {mapLabel} ({Math.trunc(vitals.x)}, {Math.trunc(vitals.y)})
      </div>

      <VitalBar label="HP" current={vitals.hp} max={vitals.max_hp} color="#E05C5C" />
      <VitalBar label="MP" current={vitals.mp} max={vitals.max_mp} color="#5CA3E0" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Carrying {vitals.gold.toLocaleString()}g</span>
        {accountGold != null && <span>Account total {accountGold.toLocaleString()}g</span>}
      </div>

      <div className={`text-sm ${vitals.rip ? 'text-destructive' : ''}`}>{activityLine(vitals, bestiaryCatalog, resolvedTargetType)}</div>
    </div>
  )
}

function VitalBar({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {current} / {max}
        </span>
      </div>
      <ProgressBar fraction={fraction} color={color} />
    </div>
  )
}

function ProgressBar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${fraction * 100}%`, backgroundColor: color }} />
    </div>
  )
}
