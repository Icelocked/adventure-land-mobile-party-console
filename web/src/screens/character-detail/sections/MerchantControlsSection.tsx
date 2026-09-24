import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'

/** Ports merchant-card-controls.tsx's Buy/Craft/Exchange navigation,
 *  Force stand, Mining/Fishing, Send to party, Donate, Join giveaway, and
 *  Clear job queue - the rest of the merchant character's card that
 *  wasn't just the job queue widget (MerchantQueueSection). Only ever
 *  rendered for the merchant character. */
export function MerchantControlsSection({ forceStand, gatheringModes }: { forceStand: boolean; gatheringModes: string[] }) {
  const api = usePartyApi()
  const navigate = useNavigate()
  const refreshNow = useRefreshDynamicStateNow()
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
        <Chip selected={forceStand} onClick={() => void run(() => api.setForceStand(!forceStand))}>
          Force stand · {forceStand ? 'On' : 'Off'}
        </Chip>
        <Chip selected={gatheringModes.includes('mining')} onClick={() => void run(() => api.setGathering('mining', !gatheringModes.includes('mining')))}>
          Mining · {gatheringModes.includes('mining') ? 'On' : 'Off'}
        </Chip>
        <Chip selected={gatheringModes.includes('fishing')} onClick={() => void run(() => api.setGathering('fishing', !gatheringModes.includes('fishing')))}>
          Fishing · {gatheringModes.includes('fishing') ? 'On' : 'Off'}
        </Chip>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <TapButton label="Send to party" onClick={() => void run(() => api.sendMerchantToParty())} />

        <TapButton label="Donate gold" onClick={() => toggle('donate')} />
        {expanded === 'donate' && <DonateForm onDonate={(amount) => run(() => api.donateGold(amount))} />}

        <TapButton label="Join giveaway" onClick={() => toggle('giveaway')} />
        {expanded === 'giveaway' && <GiveawayForm onJoin={(realm, seller) => run(() => api.joinGiveaway(seller, realm))} />}

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
          <TapButton label="Clear job queue" destructive onClick={() => setConfirmingClear(true)} />
        )}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </SectionCard>
  )
}

function TapButton({ label, onClick, destructive }: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full rounded-md py-1.5 text-left text-sm hover:bg-accent ${destructive ? 'text-destructive' : ''}`}>
      {label}
    </button>
  )
}

function DonateForm({ onDonate }: { onDonate: (amount: number) => void }) {
  const [amount, setAmount] = useState('')
  return (
    <div className="flex items-end gap-2 py-1 pl-3">
      <label className="flex-1 text-xs text-muted-foreground">
        Gold amount
        <Input value={amount} onChange={(e) => /^\d*$/.test(e.target.value) && setAmount(e.target.value)} className="mt-1" />
      </label>
      <Button size="sm" disabled={!Number(amount)} onClick={() => onDonate(Number(amount))}>
        Donate
      </Button>
    </div>
  )
}

function GiveawayForm({ onJoin }: { onJoin: (realm: string, seller: string) => void }) {
  const [realm, setRealm] = useState('')
  const [seller, setSeller] = useState('')
  return (
    <div className="flex flex-col gap-2 py-1 pl-3">
      <label className="text-xs text-muted-foreground">
        Server realm (e.g. US I)
        <Input value={realm} onChange={(e) => setRealm(e.target.value)} className="mt-1" />
      </label>
      <label className="text-xs text-muted-foreground">
        Merchant name
        <Input value={seller} onChange={(e) => setSeller(e.target.value)} className="mt-1" />
      </label>
      <Button size="sm" disabled={!realm.trim() || !seller.trim()} onClick={() => onJoin(realm.trim(), seller.trim())}>
        Join
      </Button>
    </div>
  )
}
