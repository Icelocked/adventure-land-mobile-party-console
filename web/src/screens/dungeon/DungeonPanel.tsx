import { useState } from 'react'
import { X } from 'lucide-react'
import { useClock } from '@/lib/duration'
import { dungeonCountdown, useDungeons } from '@/data/useDailyDungeon'
import { useDynamicState } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { dungeonButton } from './CaveEventRow'
import { CaveMap } from './CaveMap'

const exitButton = 'rounded border-2 border-red-500 bg-slate-950 px-3 py-2 text-red-100 hover:border-red-300 hover:bg-red-950 disabled:opacity-50'

/** The Cave of Many Dreams run controls at the top of
 *  the party screen while a visit is underway. Its dialogs (exit
 *  confirmation, encounter, shop item) are inline groups and sheets. */
export function DungeonPanel() {
  const state = useDynamicState()
  const query = useDungeons(),
    now = useClock(),
    view = query.data
  const [vote, setVote] = useState<{ choice: string; option: string; cost: number; amber: number } | null>(null)
  const [purchase, setPurchase] = useState<string | null>(null)
  const [inspectedChoice, setInspectedChoice] = useState<string | null>(null)
  const [requestedRoom, setRequestedRoom] = useState<string | null>(null)
  const [exitConfirm, setExitConfirm] = useState(false)
  const [itemInspection, setItemInspection] = useState<string | null>(null)
  if (!view || ['idle', 'held'].includes(view.state.phase)) return null
  const cave = view.members.find((m) => m.fresh && m.observation?.cave)?.observation?.cave,
    choice = cave?.choice
  const recovery = view.state.priestRecovery
  const priest = view.members.find((m) => m.name === recovery?.priest)
  const report = priest?.fresh && priest.observation?.recovery?.id === recovery?.id ? priest.observation?.recovery : undefined
  const channel = view.members.some((m) => !!m.observation?.recovery?.actor.c?.revival)
  const recoveryBusy = (!!recovery?.authorized && (!report || !['failed', 'complete'].includes(report.phase))) || channel
  const recoveryLabel =
    report?.reason ||
    {
      idle: 'Preparing priest recovery',
      healing: 'Healing gravestone',
      waiting: 'Waiting for priest recovery',
      ready: 'Preparing Revive',
      dispatched: 'Revive sent - awaiting confirmation',
      reviving: 'Reviving',
      uncertain: 'Revive outcome unknown - awaiting confirmation',
      failed: 'Priest revival failed - use Nera',
      complete: 'Revival complete',
    }[report?.phase || 'idle']
  const action = (body: Record<string, unknown>) => query.action({ run: cave?.run, ...body })
  const shopItem = state.merchantCatalog?.allItems?.find((item) => item.id === choice?.shop?.name)
  const travelling = view.state.progress?.enabled || !!view.state.travel || Object.values(view.state.commands).some((command) => command.action === 'move')
  const choiceOpen = !!choice && (!choice.resolved || inspectedChoice === choice.id || !!(choice.shop?.nearby && requestedRoom === choice.shop.room))
  const exitControls = (
    <>
      <button className={exitButton} disabled={query.busy || view.state.phase === 'exiting'} onClick={() => setExitConfirm(true)}>
        Exit dungeon
      </button>
      {exitConfirm && (
        <div role="group" aria-label="Exit the dungeon?" className="mt-2 rounded border border-slate-500 p-3">
          <p className="font-semibold">Exit the dungeon?</p>
          <p className="text-sm text-slate-300">The whole party will leave the cave and stop outside. Leave now?</p>
          <div className="mt-2 flex justify-end gap-2">
            <button className={dungeonButton} onClick={() => setExitConfirm(false)}>
              Stay in dungeon
            </button>
            <button
              className={exitButton}
              disabled={query.busy}
              onClick={() => {
                setExitConfirm(false)
                void action({ action: 'exit' })
              }}
            >
              Confirm exit
            </button>
          </div>
        </div>
      )}
    </>
  )
  return (
    <section aria-label="Cave of Many Dreams controls" className="mx-3 mt-3 rounded border border-slate-500 bg-[#101c1a] p-3 text-sm text-emerald-50">
      {!choiceOpen && <div className="mb-3 flex flex-col items-end">{exitControls}</div>}
      {view.state.error && (
        <button className={dungeonButton} disabled={query.busy} onClick={() => void action({ action: 'retry' })}>
          Retry failed preparation
        </button>
      )}
      {view.members.some((m) => m.fresh && !m.observation?.cave && m.observation?.visit?.resume) && (
        <button className={dungeonButton} disabled={query.busy} onClick={() => void action({ action: 'recover' })}>
          Return missing participants
        </button>
      )}
      <h2 className="font-semibold">Cave of Many Dreams</h2>
      <p>
        {cave
          ? `Floor ${cave.floor + 1} · ${dungeonCountdown(cave.paused ? now + cave.remainingMs : cave.expires, now)} remaining${cave.paused ? ' (paused' + (choice && !choice.resolved ? ' for ' + choice.title : '') + ')' : ''} · ${cave.gold} gold · ${cave.amber} Amber`
          : view.state.phase}
      </p>
      <p className="text-slate-300">{view.members.map((m) => m.name + (m.fresh ? '' : ' — awaiting connection')).join(' · ')}</p>
      {cave && <CaveMap key={cave.run + ':' + cave.floor} view={view} cave={cave} action={action} error={query.actionError} />}
      {view.state.phase === 'active' && (
        <div className="mt-3">
          <p className="text-slate-200">{view.state.progress?.message || 'Continue through the cave toward the next floor.'}</p>
          <button className={dungeonButton} disabled={query.busy || cave?.paused} onClick={() => void action({ action: 'progress', enabled: !travelling })}>
            {travelling ? 'Stop travel' : 'Start automatic exploration'}
          </button>
          <p className="mt-1 text-xs text-slate-300">Choose a room below to travel there. Automatic exploration visits required rooms and stairs. Stopping travel still allows defensive combat and healing.</p>
        </div>
      )}
      {recovery && (
        <p role="status" className="mt-2 text-emerald-100">
          {recovery.priest} reviving {recovery.target}: {recoveryLabel}
        </p>
      )}
      {!recovery && view.members.some((m) => m.observation?.alive === false) && (
        <p role="status" className="mt-2 text-slate-200">
          {view.state.manualRecovery ? 'Nera recovery requested' : 'Waiting for an available priest with an Essence of Life. Call Nera if needed.'}
        </p>
      )}
      {view.members.some((m) => m.observation?.alive === false) && (
        <button
          className={dungeonButton}
          disabled={query.busy || view.state.phase !== 'active' || recoveryBusy || (!!choice && !choice.resolved)}
          onClick={() => void action({ action: 'revival' })}
        >
          Call Nera — revival choices
        </button>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {cave?.points
          .filter((p) => !p.exit)
          .map((p) => (
            <button
              className={dungeonButton + (p.done ? ' !border-2 !border-green-500 disabled:!opacity-80' : p.required ? ' !border-2 !border-orange-500' : '')}
              key={p.id}
              disabled={query.busy || cave.paused || p.locked || p.done || view.state.phase !== 'active'}
              onClick={() => {
                setRequestedRoom(p.room || null)
                if (choice?.shop?.nearby && p.room === choice.shop.room) setInspectedChoice(choice.id)
                else void action({ action: 'move', target: p.id })
              }}
            >
              {p.label}
              {p.map !== 'zone_' + cave.run + '_' + cave.floor ? ' — different floor' : ''}
              {p.locked ? ' — locked' : p.done ? ' — complete' : ''}
            </button>
          ))}
      </div>
      {choice?.resolved && (
        <button className={dungeonButton + ' mt-3'} onClick={() => setInspectedChoice(choice.id)}>
          View encounter — {choice.title}
        </button>
      )}
      {choice && cave && choiceOpen && (
        <div role="group" aria-label="Cave choice" className="fixed inset-0 z-50 flex flex-col gap-2 overflow-auto bg-[#101c1a] p-4 text-sm text-emerald-50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold">{choice.title}</p>
              <p className="font-semibold text-amber-200">
                Party funds: {cave.gold.toLocaleString()} gold · {cave.amber.toLocaleString()} Amber
              </p>
              <p className="text-slate-300">{choice.resolved ? 'Encounter result' : 'The cave timer and route are paused until the party answers.'}</p>
            </div>
            {choice.resolved && (
              <button
                type="button"
                aria-label="Close encounter"
                className="rounded border border-slate-500 bg-slate-950 p-1"
                onClick={() => {
                  setInspectedChoice(null)
                  setRequestedRoom(null)
                }}
              >
                <X className="size-5" />
              </button>
            )}
          </div>
          <p>{choice.text}</p>
          {choice.resolved && (
            <p className="text-amber-200">
              {choice.resultLabel || 'This choice has ended.'} {choice.summary?.join(' ')}
            </p>
          )}
          {!choice.resolved && <p>Vote closes in {dungeonCountdown(choice.deadline, now)}</p>}
          {!choice.resolved && <p className="text-xs text-slate-300">The cave offers two replies for each encounter. Other gifts or replies mentioned in the story may not be offered on this visit.</p>}
          {!choice.resolved && (
            <div className="grid grid-cols-2 gap-2">
              {choice.options.map((o) => (
                <button
                  className={dungeonButton}
                  key={o.id}
                  disabled={query.busy || choice.resolved || now >= choice.deadline || !!o.unavailable}
                  onClick={() => {
                    if (o.cost || o.amber) setVote({ choice: choice.id, option: o.id, cost: o.cost || 0, amber: o.amber || 0 })
                    else void action({ action: 'vote', choice: choice.id, option: o.id })
                  }}
                >
                  {o.label}
                  {o.cost ? ` — ${o.cost} shared gold` : ''}
                  {o.amber ? ` — ${o.amber} Amber` : ''}
                  {o.unavailable ? ` — ${o.unavailable}` : ''}
                  <span className="block text-xs">
                    {Object.entries(choice.votes)
                      .filter(([, id]) => id === o.id)
                      .map(([name]) => name)
                      .join(', ')}
                  </span>
                </button>
              ))}
            </div>
          )}
          {vote?.choice === choice.id && !choice.resolved && (
            <div role="group" aria-label="Confirm paid dungeon choice" className="flex flex-col gap-2">
              <p>
                Spend {vote.cost} shared gold and {vote.amber} Amber if this choice wins?
              </p>
              <div className="flex gap-2">
                <button
                  className={dungeonButton}
                  disabled={query.busy}
                  onClick={() => {
                    void action({ action: 'vote', choice: vote.choice, option: vote.option, cost: vote.cost, amber: vote.amber, confirmed: true })
                    setVote(null)
                  }}
                >
                  Confirm vote
                </button>
                <button className={dungeonButton} onClick={() => setVote(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {choice.shop && (
            <div className="mt-2">
              <p>
                {shopItem?.name || choice.shop.name} — {choice.shop.price} shared gold
                {choice.shop.sold ? ' — sold' : ''}
              </p>
              <button className={dungeonButton + ' my-2 flex items-center gap-3'} aria-label="Inspect cave shop item" onClick={() => setItemInspection(choice.shop!.name)}>
                <SpriteIcon sprite={shopItem?.sprite} size={48} className="bg-black" />
                {shopItem?.name || choice.shop.name} — view details
              </button>
              <button
                className={dungeonButton}
                disabled={query.busy || choice.shop.sold || !choice.resolved || !choice.shop.nearby || cave.gold < choice.shop.price}
                onClick={() => setPurchase(choice.id)}
              >
                Buy…
              </button>
              {purchase === choice.id && (
                <div role="group" aria-label="Confirm dungeon purchase" className="mt-2 flex flex-col gap-2">
                  <p>
                    Spend {choice.shop.price} shared gold on {shopItem?.name || choice.shop.name}?
                  </p>
                  <div className="flex gap-2">
                    <button
                      className={dungeonButton}
                      onClick={() => {
                        setPurchase(null)
                        void action({ action: 'buy', choice: choice.id, cost: choice.shop!.price, confirmed: true })
                      }}
                    >
                      Confirm purchase
                    </button>
                    <button className={dungeonButton} onClick={() => setPurchase(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {query.actionError && (
            <p role="alert" className="text-rose-200">
              {query.actionError}
            </p>
          )}
          <div>{exitControls}</div>
        </div>
      )}
      {itemInspection && (
        <Sheet open onOpenChange={(open) => !open && setItemInspection(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={itemInspection} rootLevel={0} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} context={{ character: view.members[0]?.name || '', slot: -1 }} />
          </SheetContent>
        </Sheet>
      )}
      {(query.actionError || view.state.error) && (
        <p role="alert" className="mt-2 text-rose-200">
          {query.actionError || view.state.error}
        </p>
      )}
    </section>
  )
}
