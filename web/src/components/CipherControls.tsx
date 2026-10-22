import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SpriteIcon } from '@/components/SpriteIcon'
import { cipherCandidates, cipherIngredients, validMix, type CipherSettings, type CipherView } from '@/lib/cipher'

/** Console 2db4d763 cipher-controls.tsx: Witch's Cipher gathering targets,
 *  solving policy, the shared realm board and a manual solution entry. The
 *  manual entry is an inline group, matching the PWA's inline event settings. */

// cipher-controls.tsx `fallback`, used until the schedule feed sends `gathering`.
const fallback: [string, string[]][] = [
  ['verdantspore', ['goo', 'bee', 'spider', 'croc']],
  ['frostscale', ['arcticbee', 'boar', 'wolfie', 'iceroamer']],
  ['embercoal', ['plantoid', 'porcupine', 'fireroamer', 'gscorpion']],
  ['gloomfeather', ['snake', 'osnake', 'minimush', 'ghost']],
]
const ingredientNames: Record<string, string> = { verdantspore: 'Verdant Spore', frostscale: 'Frost Scale', embercoal: 'Ember Coal', gloomfeather: 'Gloom Feather' }
const selectClass = 'rounded border border-border bg-background p-2 text-foreground'

function ingredientName(id: string, view?: CipherView) {
  return view?.ingredients.find((item) => item.id === id)?.name ?? ingredientNames[id] ?? id
}

function Ingredient({ id, view, horizontal = false, onInspect }: { id: string; view?: CipherView; horizontal?: boolean; onInspect?: (id: string) => void }) {
  const name = ingredientName(id, view)
  const sprite = view?.ingredients.find((item) => item.id === id)?.sprite
  const content = (
    <span className={`inline-flex min-w-10 items-center gap-1 ${horizontal ? '' : 'flex-col'}`} title={name}>
      <span role="img" aria-label={name} className="block size-10 shrink-0">
        {sprite ? <SpriteIcon sprite={sprite} size={40} /> : <span className="block size-10 rounded border border-border bg-muted" />}
      </span>
      <span className={horizontal ? 'text-xs' : 'max-w-16 text-center text-[10px] text-muted-foreground'}>{name}</span>
    </span>
  )
  return onInspect ? (
    <button type="button" aria-label={`View ${name} details`} className="rounded border border-border p-1 hover:border-cyan-300" onClick={() => onInspect(id)}>
      {content}
    </button>
  ) : (
    content
  )
}

function monsterLabel(id: string, ingredient: string, view?: CipherView) {
  const source = view?.sources?.find((entry) => entry.id === id && entry.ingredient === ingredient)
  const rate = source && Number.isFinite(source.rate) ? `${(source.rate * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%` : 'Rate unavailable'
  return `${source?.name ?? id} (${rate})`
}

function Board({ view, onInspect }: { view?: CipherView; onInspect?: (id: string) => void }) {
  const candidates = useMemo(() => (view?.board ? cipherCandidates(view.board) : []), [view])
  const board = view?.board
  return (
    <section aria-label="Shared realm board" className="flex flex-col gap-2 rounded border border-purple-700 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-purple-100">Shared realm board</h3>
        <span className="text-xs text-muted-foreground">Refreshes every 5 seconds</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {board?.live ? `${board.mixes ?? board.board?.length ?? 0} clues · ${candidates.length} possible recipes · recipe ${(board.cracks ?? 0) + 1}` : 'No live cipher board is available.'}
      </p>
      {board?.cracked && (
        <div className="rounded border border-amber-700 p-2">
          <p className="mb-2 text-xs text-amber-200">Previous recipe solved by {board.cracked.by}</p>
          <div className="flex justify-around">
            {board.cracked.recipe.map((id, i) => (
              <Ingredient key={i} id={id} view={view} onInspect={onInspect} />
            ))}
          </div>
        </div>
      )}
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {!board?.board?.length && <p className="py-3 text-center text-xs text-muted-foreground">The current recipe has no clues yet.</p>}
        {board?.board
          ?.slice()
          .reverse()
          .map((row, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-border p-2">
              <div className="flex flex-1 justify-around">
                {row.mix.map((id, j) => (
                  <Ingredient key={j} id={id} view={view} onInspect={onInspect} />
                ))}
              </div>
              <strong className="w-12 shrink-0 text-center text-emerald-300">
                {row.right}/5
                <br />
                <span className="text-[10px] font-normal">in place</span>
              </strong>
            </div>
          ))}
      </div>
    </section>
  )
}

export function CipherControls({
  value,
  onChange,
  view,
  disabled,
  onManual,
  onInspectIngredient,
}: {
  value: CipherSettings
  onChange: (value: CipherSettings) => void
  view?: CipherView
  disabled: boolean
  onManual: (mix: string[]) => Promise<unknown>
  onInspectIngredient?: (id: string) => void
}) {
  const [manual, setManual] = useState(false)
  const [mix, setMix] = useState<string[]>(Array(5).fill('verdantspore'))
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  // The board samples the polled feed every 5 seconds, and at once when the round changes.
  const latestView = useRef(view)
  const [boardView, setBoardView] = useState(view)
  useEffect(() => {
    latestView.current = view
  }, [view])
  useEffect(() => {
    const timer = setInterval(() => setBoardView(latestView.current), 5000)
    return () => clearInterval(timer)
  }, [])
  const round = view?.board?.id
  useEffect(() => setBoardView(latestView.current), [round])
  const candidates = useMemo(() => (view?.board ? cipherCandidates(view.board) : []), [view])
  const fits = validMix(mix) && candidates.some((recipe) => recipe.join(',') === mix.join(','))
  const tried = view?.board?.board?.some((row) => row.mix.join(',') === mix.join(','))
  const plan = view?.gatheringPlan
  return (
    <div className="flex flex-col gap-3 rounded border border-purple-700 p-3">
      <p className="text-xs text-muted-foreground">
        Have all four ingredients? Head to the witch. Otherwise farm the lowest stock, with ties resolved top to bottom. If a solution needs more of an ingredient, farm that
        ingredient for the remaining gathering window. The merchant brews up to five mixes per account per UTC day, on one realm.
      </p>
      <p className="text-xs text-amber-200">
        Gathering stops after 20 minutes. Then go to the witch only with all four ingredient types; otherwise resume normal farming. A selected gathering target stays fixed
        until that cutoff.
      </p>
      <p className="text-xs text-muted-foreground">
        Counts include usable carried ingredients across the party and merchant. Drop rates below are base chances per kill during gathering; Luck can increase them.
      </p>
      {(view?.gathering ?? fallback).map(([ingredient, monsters], i) => {
        const selected = value.gatherMonsters?.[i] ?? monsters[0]
        return (
          <div key={ingredient} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-2">
            <span className="min-w-0">
              <Ingredient id={ingredient} view={view} horizontal onInspect={onInspectIngredient} />
              <span className="block text-xs text-muted-foreground">Carried: {view?.stock?.[ingredient] ?? 'Waiting for inventory'}</span>
            </span>
            <select
              aria-label={`${ingredient} farming monster`}
              className={selectClass}
              value={selected}
              disabled={disabled}
              onChange={(e) => {
                const choices = [...(value.gatherMonsters ?? fallback.map((entry) => entry[1][0]))]
                choices[i] = e.target.value
                onChange({ ...value, gatherMonsters: choices })
              }}
            >
              {monsters.map((id) => (
                <option key={id} value={id}>
                  {monsterLabel(id, ingredient, view)}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      {plan && (
        <p className="text-xs text-purple-200">
          This event:{' '}
          {plan.mode === 'gathering'
            ? `farm ${plan.monster} for ${ingredientName(plan.ingredient ?? '', view)}`
            : plan.mode === 'finished'
              ? 'return to normal farming'
              : 'solve at the witch'}
          .
        </p>
      )}
      <label className="flex items-center justify-between gap-3">
        Only attempt with at least this many clues
        <Input
          aria-label="Minimum clues"
          className="w-20"
          type="number"
          min="0"
          max="1024"
          step="1"
          value={value.minClues}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, minClues: Number(e.target.value) })}
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value.automatic} disabled={disabled} onChange={(e) => onChange({ ...value, automatic: e.target.checked })} />
        Automatically try solutions
      </label>
      {!value.automatic && (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setManual(true)
            setError('')
          }}
        >
          Manually enter solution
        </Button>
      )}
      {view?.runtime && (
        <p role="status" className="text-xs text-purple-200">
          {view.merchant ?? 'Merchant'}: {view.runtime.phase}
          {view.runtime.detail ? ` · ${view.runtime.detail}` : ''}
          {view.runtime.day?.mixes_left !== undefined ? ` · ${view.runtime.day.mixes_left} mixes left` : ''}
        </p>
      )}
      <Board view={boardView} onInspect={onInspectIngredient} />
      {manual && (
        <div role="group" aria-label="Enter a five-ingredient solution" className="flex flex-col gap-2 rounded border border-purple-600 p-3">
          <p className="text-sm font-medium">Enter a five-ingredient solution</p>
          <p className="text-xs text-muted-foreground">Clues count correct positions only. Your mix must fit the current recipe.</p>
          <div className="grid grid-cols-5 gap-2">
            {mix.map((id, i) => (
              <label key={i} className="flex min-w-0 flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground">Slot {i + 1}</span>
                <Ingredient id={id} view={view} />
                <select
                  aria-label={`Ingredient ${i + 1}`}
                  className={`${selectClass} w-full text-xs`}
                  value={id}
                  onChange={(e) => setMix(mix.map((old, j) => (j === i ? e.target.value : old)))}
                >
                  {cipherIngredients.map((name) => (
                    <option key={name} value={name}>
                      {ingredientName(name, view)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className={fits && !tried ? 'text-emerald-300' : 'text-amber-200'}>
            {tried ? 'This mix was already tried.' : fits ? 'Fits every known clue.' : 'Does not fit the current clues, or complete clues are unavailable.'}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={sending} onClick={() => setManual(false)}>
              Close solution
            </Button>
            <Button
              size="sm"
              disabled={sending || !view?.board?.live || !fits || tried || !view?.merchant}
              onClick={async () => {
                setSending(true)
                try {
                  await onManual(mix)
                  setManual(false)
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : String(failure))
                } finally {
                  setSending(false)
                }
              }}
            >
              Send solution to merchant
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
