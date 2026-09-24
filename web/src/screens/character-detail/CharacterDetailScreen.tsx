import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Menu, RefreshCw } from 'lucide-react'
import { useCharacters, useDynamicState, useRefreshDynamicStateNow, useRoster } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { VitalsHeader } from './VitalsHeader'
import { LeaderFollowerSection } from './sections/LeaderFollowerSection'
import { TravelSection } from './sections/TravelSection'
import { MerchantQueueSection } from './sections/MerchantQueueSection'
import { EquipmentSection } from './sections/EquipmentSection'
import { InventorySection } from './sections/InventorySection'
import { RestockSection } from './sections/RestockSection'
import { GoldTargetSection } from './sections/GoldTargetSection'
import { AutoMarksSection } from './sections/AutoMarksSection'
import { AccountMenu } from './AccountMenu'
import { ItemActionPanel, type ItemActionTarget } from '@/screens/itempanel/ItemActionPanel'

/** Character focus screen: a sticky vitals header (never scrolls out of
 *  view) over a scrollable body of section cards - ported from
 *  ui/characterdetail/CharacterDetailScreen.kt. Item taps (equipment/
 *  inventory) open the bottom item-action panel. */
export function CharacterDetailScreen() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const characters = useCharacters()
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const roster = useRoster()
  const [actionTarget, setActionTarget] = useState<ItemActionTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const state = characters[name]
  const vitals = state?.vitals
  const others = Object.keys(characters).filter((n) => n !== name)
  const accountGold = (dynamicState.bank?.gold ?? 0) + Object.values(characters).reduce((sum, c) => sum + (c.vitals?.gold ?? 0), 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <button onClick={() => navigate('/')} aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <span className="font-medium">{name}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => void refreshNow()} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </button>
          <button aria-label="Menu" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {others.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2">
          {others.map((otherName) => (
            <button
              key={otherName}
              onClick={() => navigate(`/characters/${encodeURIComponent(otherName)}`)}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40"
            >
              {otherName}
              {characters[otherName]?.vitals ? ` Lv${characters[otherName].vitals!.level}` : ''}
            </button>
          ))}
        </div>
      )}

      {!vitals ? (
        <p className="p-6 text-sm text-muted-foreground">This character isn't reporting in right now.</p>
      ) : (
        <>
          <VitalsHeader name={name} vitals={vitals} accountGold={accountGold} />
          <div className="flex-1 pb-6">
            <LeaderFollowerSection characterName={name} dynamicState={dynamicState} />
            <TravelSection
              characterName={name}
              isMerchant={vitals.ctype === 'merchant'}
              isLeader={dynamicState.leader === name}
              travelPlaces={dynamicState.travelPlaces}
            />
            {vitals.ctype === 'merchant' && <MerchantQueueSection current={dynamicState.merchantCurrent} queue={dynamicState.merchantQueue} />}
            <EquipmentSection
              slots={state?.inventory?.slots ?? {}}
              catalogFor={catalogFor}
              onSlotTap={(slotName, entry) => entry && setActionTarget({ kind: 'equipment', slotName, item: entry.item })}
            />
            <InventorySection
              items={state?.inventory?.items ?? []}
              merchantMarks={dynamicState.merchantMarked[name] ?? []}
              bankMarks={dynamicState.marked[name] ?? []}
              catalogFor={catalogFor}
              onItemTap={(index, entry) => entry && setActionTarget({ kind: 'inventory', slot: index, item: entry.item })}
            />
            <RestockSection characterName={name} serverPolicy={dynamicState.restockPolicies[name] ?? { hp: { min: 0, max: 0 }, mp: { min: 0, max: 0 } }} />
            <GoldTargetSection characterName={name} serverTarget={dynamicState.goldTargets[name] ?? 0} />
            <AutoMarksSection characterName={name} isMerchant={vitals.ctype === 'merchant'} dynamicState={dynamicState} catalogFor={catalogFor} />
          </div>
        </>
      )}

      {actionTarget && (
        <ItemActionPanel
          target={actionTarget}
          characterName={name}
          isMerchant={vitals?.ctype === 'merchant'}
          roster={roster}
          catalog={dynamicState.merchantCatalog}
          monsters={dynamicState.bestiaryCatalog}
          onClose={() => setActionTarget(null)}
        />
      )}
      {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
