import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded, useDynamicState, useCharacters, useCharacterDiagnostics } from '@/data/PartyDataProvider'
import { merchantPartyGroups } from '@/lib/partyGroups'
import { abbreviatedGold } from '@/lib/gold'
import { useClock } from '@/lib/duration'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'

/** Ports merchant-card-controls.tsx's Buy/Craft/Exchange navigation,
 *  Force stand, Mining/Fishing, Send to party, Donate, Join giveaway,
 *  Clear job queue, Clear stale orders, Clear activity history, and the
 *  Merchant collection settings (bank-sort mode, collect thresholds) -
 *  the rest of the merchant character's card that wasn't just the job
 *  queue widget (MerchantQueueSection) or Routines (its own screen, too
 *  big for an inline form). Only ever rendered for the merchant
 *  character. */
export function MerchantControlsSection({
  forceStand,
  gatheringModes,
  threshold,
  itemCollectionThreshold,
  bankSortMode,
}: {
  forceStand: boolean
  gatheringModes: string[]
  threshold: number
  itemCollectionThreshold: number
  bankSortMode?: 'automatic' | 'request'
}) {
  const api = usePartyApi()
  const navigate = useNavigate()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const state = useDynamicState()
  const characters = useCharacters()
  const now = useClock()
  const merchantDetails = useCharacterDiagnostics(state.merchantCharacter ?? '')
  const groups = merchantPartyGroups(state, Object.keys(characters))
  // party-reference-panels.tsx: the merchant's own XP-per-gold rate, 3.2 until known.
  const xpPerGold = Number(merchantDetails?.donationXpPerGold) || 3.2
  // merchant-card-controls.tsx readiness: the later of the merchant's and the party's cooldowns.
  const readiness = (mode: 'fishing' | 'mining') => {
    const ownCooldowns = merchantDetails?.gatheringCooldowns as Record<string, number> | undefined
    const remaining = Math.max(0, Math.max(Number(ownCooldowns?.[mode] || 0), Number(state.gatheringCooldowns?.[mode] || 0)) - now)
    if (!remaining) return <span className="text-emerald-500">✓ Ready</span>
    const totalSeconds = Math.ceil(remaining / 1000)
    return (
      <span className="font-mono">
        {Math.floor(totalSeconds / 60)}:{String(totalSeconds % 60).padStart(2, '0')}
      </span>
    )
  }
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const toggle = (key: string) => setExpanded((current) => (current === key ? null : key))

  const run = async (action: () => Promise<{ kind: string; message?: string }>) => {
    setError(null)
    const result = await action()
    if (result.kind === 'failure') setError(result.message ?? 'Request failed')
    else {
      await refreshNow()
      setExpanded(null)
    }
  }

  return (
    <SectionCard title="Merchant controls">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => navigate('/merchant/buy')}>
          Buy
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/merchant/craft')}>
          Craft
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/merchant/exchange')}>
          Exchange
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip selected={forceStand} disabled={!configLoaded} onClick={() => void run(() => api.setForceStand(!forceStand))}>
          Force stand · {forceStand ? 'On' : 'Off'}
        </Chip>
        {(['mining', 'fishing'] as const).map((mode) => (
          <Chip key={mode} selected={gatheringModes.includes(mode)} onClick={() => void run(() => api.setGathering(mode, !gatheringModes.includes(mode)))}>
            {mode === 'mining' ? 'Mining' : 'Fishing'} · {gatheringModes.includes(mode) ? 'On' : 'Off'} ·{' '}
            {state.gatheringNoTool?.[mode] && !gatheringModes.includes(mode) ? <span className="text-amber-500">No tool</span> : readiness(mode)}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate('/routines')}>
          Routines
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => (groups.length <= 1 ? void run(() => api.sendMerchantToParty(groups[0]?.id)) : toggle('party'))}
        >
          Send to party
        </Button>
        {expanded === 'party' && (
          // send-to-party-control.tsx: pick a party group when there's more than one.
          <div className="flex flex-col gap-1 py-1 pl-3">
            <p className="text-xs text-muted-foreground">Select party group</p>
            {groups.map((group) => (
              <Button key={group.id} variant="outline" size="sm" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => void run(() => api.sendMerchantToParty(group.id))}>
                {group.members.join(' · ')}
              </Button>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="justify-start" onClick={() => toggle('donate')}>
          Donate gold
        </Button>
        {expanded === 'donate' && <DonateForm merchant={state.merchantCharacter ?? null} xpPerGold={xpPerGold} onDonate={(amount) => run(() => api.donateGold(amount))} />}

        <Button variant="outline" size="sm" className="justify-start" onClick={() => toggle('giveaway')}>
          Join giveaway
        </Button>
        {expanded === 'giveaway' && (
          <GiveawayForm realms={state.giveawayRealms ?? []} players={state.giveawayPlayers ?? {}} onJoin={(realm, seller) => run(() => api.joinGiveaway(seller, realm))} />
        )}

        <Button variant="outline" size="sm" className="justify-start" onClick={() => toggle('settings')}>
          Collection settings
        </Button>
        {expanded === 'settings' && !configLoaded && <ConfigLoadingNote />}
        {expanded === 'settings' && configLoaded && (
          <CollectionSettingsForm
            threshold={threshold}
            itemCollectionThreshold={itemCollectionThreshold}
            bankSortMode={bankSortMode}
            onSetBankSortMode={(mode) => run(() => api.setBankSortMode(mode))}
            onSetThresholds={(t, i) => run(() => api.setThresholds(t, i))}
          />
        )}


        {confirmingClear ? (
          <div className="flex items-center gap-2 py-1">
            <span className="flex-1 text-sm text-destructive">Really clear the entire job queue?</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmingClear(false)
                void run(() => api.clearMerchantQueue())
              }}
            >
              Clear
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="justify-start text-destructive" onClick={() => setConfirmingClear(true)}>
            Clear job queue
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </SectionCard>
  )
}

function DonateForm({ merchant, xpPerGold, onDonate }: { merchant: string | null; xpPerGold: number; onDonate: (amount: number) => void }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2 py-1 pl-3">
      <p className="text-xs text-muted-foreground">{merchant || 'The merchant'} will withdraw any shortage, travel to the XP frog, and donate this amount.</p>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Donation amount
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} className="mt-1" />
        </label>
        <Button
          size="sm"
          onClick={() => {
            // use-party-console.tsx donateGold
            const value = Number(amount)
            if (!Number.isSafeInteger(value) || value < 1) return setError('Enter a positive whole-number donation')
            setError(null)
            onDonate(value)
          }}
        >
          Donate
        </Button>
      </div>
      <p className="font-mono text-xs text-violet-400">
        Preview: {abbreviatedGold(Math.floor((Number(amount) || 0) * xpPerGold))} XP <span className="text-[10px] opacity-70">({xpPerGold} XP/gold)</span>
      </p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function CollectionSettingsForm({
  threshold,
  itemCollectionThreshold,
  bankSortMode,
  onSetBankSortMode,
  onSetThresholds,
}: {
  threshold: number
  itemCollectionThreshold: number
  bankSortMode?: 'automatic' | 'request'
  onSetBankSortMode: (mode: 'automatic' | 'request') => void
  onSetThresholds: (threshold?: number, itemCollectionThreshold?: number) => void
}) {
  const [thresholdInput, setThresholdInput] = useState(String(threshold))
  const [slotsInput, setSlotsInput] = useState(String(itemCollectionThreshold))
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  // use-party-console.tsx: follow the server value until the user edits.
  const thresholdDirty = useRef(false)
  const slotsDirty = useRef(false)
  useEffect(() => {
    if (!thresholdDirty.current) setThresholdInput(String(threshold))
  }, [threshold])
  useEffect(() => {
    if (!slotsDirty.current) setSlotsInput(String(itemCollectionThreshold))
  }, [itemCollectionThreshold])

  const saveThreshold = () => {
    setThresholdError(null)
    const n = Number(thresholdInput)
    if (!Number.isSafeInteger(n) || n < 0) return setThresholdError('Enter a non-negative whole number')
    thresholdDirty.current = false
    onSetThresholds(n, undefined)
  }
  const saveSlots = () => {
    setSlotsError(null)
    const value = Number(slotsInput)
    if (!Number.isSafeInteger(value) || value < 1 || value > 42) return setSlotsError('Use an item-slot threshold from 1 to 42')
    slotsDirty.current = false
    onSetThresholds(undefined, value)
  }

  return (
    <div className="flex flex-col gap-3 py-1 pl-3">
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Bank sort</p>
        <div className="flex gap-1.5">
          <Chip selected={(bankSortMode ?? 'automatic') === 'automatic'} onClick={() => onSetBankSortMode('automatic')}>
            Sort every visit
          </Chip>
          <Chip selected={bankSortMode === 'request'} onClick={() => onSetBankSortMode('request')}>
            Request sorting
          </Chip>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Collect above (gold)
          <Input
            inputMode="numeric"
            value={thresholdInput}
            onChange={(e) => {
              thresholdDirty.current = true
              setThresholdInput(e.target.value.replace(/[^0-9]/g, ''))
            }}
            className="mt-1"
          />
        </label>
        <Button size="sm" onClick={saveThreshold}>
          Apply
        </Button>
      </div>
      {thresholdError && <p role="alert" className="-mt-2 text-sm text-destructive">{thresholdError}</p>}
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Marked slots required (1-42)
          <Input
            inputMode="numeric"
            value={slotsInput}
            onChange={(e) => {
              slotsDirty.current = true
              setSlotsInput(e.target.value.replace(/[^0-9]/g, ''))
            }}
            className="mt-1"
          />
        </label>
        <Button size="sm" onClick={saveSlots}>
          Apply
        </Button>
      </div>
      {slotsError && <p role="alert" className="-mt-2 text-sm text-destructive">{slotsError}</p>}
    </div>
  )
}

/** party-management-panels.tsx "Join giveaway": pick a realm, then a
 *  player online there (searchable). */
function GiveawayForm({
  realms,
  players,
  onJoin,
}: {
  realms: { key: string; label: string }[]
  players: Record<string, string[]>
  onJoin: (realm: string, seller: string) => void
}) {
  const [realm, setRealm] = useState('')
  const [seller, setSeller] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const online = players[realm] ?? []
  const matches = online.filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <div className="flex flex-col gap-2 py-1 pl-3">
      <p className="text-xs text-muted-foreground">The merchant will switch realms, travel to the main market, find this player, and enter every active giveaway they are hosting.</p>
      <label className="text-xs text-muted-foreground">
        Server realm
        <select
          aria-label="Server realm"
          value={realm}
          onChange={(e) => {
            setRealm(e.target.value)
            setSeller('')
          }}
          className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
        >
          <option value="">Select a realm</option>
          {realms.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Merchant name
        <Input disabled={!realm} placeholder={realm ? 'Search player name…' : 'Select a realm first'} value={seller || search} onChange={(e) => (setSeller(''), setSearch(e.target.value))} className="mt-1" />
      </label>
      {realm && !seller && (
        <div className="max-h-40 overflow-y-auto">
          {matches.map((name) => (
            <button key={name} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setSeller(name)}>
              {name}
            </button>
          ))}
          {!matches.length && <p className="px-2 text-xs text-muted-foreground">No online players loaded for this realm.</p>}
        </div>
      )}
      <span className="font-mono text-[10px] text-muted-foreground">{online.length} online players loaded</span>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button
        size="sm"
        onClick={() => {
          // use-party-console.tsx joinGiveaway
          if (!realm.trim() || !seller.trim()) return setError('Enter both a server realm and merchant name')
          setError(null)
          onJoin(realm.trim(), seller.trim())
        }}
      >
        Join
      </Button>
    </div>
  )
}
