import { classLook } from '@/lib/classLook'
import { activityLine } from '@/lib/activityLine'
import type { CharacterVitals } from '@/models'

/** The sticky, always-visible top of the character detail screen -
 *  ported from ui/characterdetail/sections/VitalsHeader.kt. Kept out of
 *  the scrollable body so vitals never scroll out of view while browsing
 *  equipment/inventory below. */
export function VitalsHeader({ name, vitals, accountGold }: { name: string; vitals: CharacterVitals; accountGold?: number }) {
  const { Icon, color } = classLook(vitals.ctype)
  const xpFraction = vitals.max_xp && vitals.max_xp > 0 ? Math.min(1, Math.max(0, (vitals.xp ?? 0) / vitals.max_xp)) : null

  return (
    <div className="flex flex-col gap-1.5 border-b border-border p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}33` }}>
          <Icon className="size-6" style={{ color }} />
        </div>
        <div>
          <div className="text-lg font-semibold">{name}</div>
          <div className="text-sm text-muted-foreground">
            Lv {vitals.level} {vitals.ctype}
            {vitals.primaryStat ? ` ${vitals.primaryStat}` : ''} · {vitals.server ?? 'realm unknown'}
          </div>
        </div>
      </div>

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
        {vitals.map} ({Math.trunc(vitals.x)}, {Math.trunc(vitals.y)})
      </div>

      <VitalBar label="HP" current={vitals.hp} max={vitals.max_hp} color="#E05C5C" />
      <VitalBar label="MP" current={vitals.mp} max={vitals.max_mp} color="#5CA3E0" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Carrying {vitals.gold.toLocaleString()}g</span>
        {accountGold != null && <span>Account total {accountGold.toLocaleString()}g</span>}
      </div>

      <div className={`text-sm ${vitals.rip ? 'text-destructive' : ''}`}>{activityLine(vitals)}</div>
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
