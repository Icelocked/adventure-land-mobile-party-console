import { useDynamicState, useGameLogs, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { ActivityEntry, GameLogEntry } from '@/models'

/** Read-only activity feed - ported from ui/account/LogsScreen.kt:
 *  merchant errand history, per-character combat log lines, and raw
 *  in-game chat/system messages. */
export function LogsScreen() {
  const dynamicState = useDynamicState()
  const gameLogs = useGameLogs()
  const refreshNow = useRefreshDynamicStateNow()

  const combatEntries = Object.entries(dynamicState.combatLogs)
    .flatMap(([name, entries]) => entries.map((entry) => [name, entry] as const))
    .sort((a, b) => b[1].at - a[1].at)
  const merchantEntries = [...dynamicState.merchantActivity].sort((a, b) => b.at - a.at)
  const gameEntries = Object.entries(gameLogs)
    .flatMap(([name, entries]) => entries.map((entry) => [name, entry] as const))
    .sort((a, b) => b[1].at - a[1].at)

  const empty = combatEntries.length === 0 && merchantEntries.length === 0 && gameEntries.length === 0

  return (
    <AccountScreenScaffold title="Logs" onRefresh={() => void refreshNow()}>
      {empty ? (
        <EmptyState message="No activity yet." />
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {gameEntries.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium">Game log</div>
              <div className="flex flex-col gap-1">
                {gameEntries.slice(0, 100).map(([name, entry], index) => (
                  <GameLogRow key={index} character={name} entry={entry} />
                ))}
              </div>
            </div>
          )}
          {merchantEntries.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium">Merchant activity</div>
              <div className="flex flex-col gap-1">
                {merchantEntries.map((entry, index) => (
                  <LogRow key={index} character={null} entry={entry} />
                ))}
              </div>
            </div>
          )}
          {combatEntries.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium">Combat</div>
              <div className="flex flex-col gap-1">
                {combatEntries.map(([name, entry], index) => (
                  <LogRow key={index} character={name} entry={entry} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function LogRow({ character, entry }: { character: string | null; entry: ActivityEntry }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-sm">
      {character ? `[${character}] ` : ''}
      {entry.message}
    </div>
  )
}

function GameLogRow({ character, entry }: { character: string; entry: GameLogEntry }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-sm">
      [{character}] {entry.message}
    </div>
  )
}
