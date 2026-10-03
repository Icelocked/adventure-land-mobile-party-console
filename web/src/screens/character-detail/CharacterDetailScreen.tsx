import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Menu, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LatencyBadge } from '@/components/LatencyBadge'
import { useCharacters, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useTargetMonsterType } from '@/data/useTargetMonsterType'
import { defaultRestockPolicy, resolveFarmingContext } from '@/models'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { VitalsHeader } from './VitalsHeader'
import { LeaderFollowerSection } from './sections/LeaderFollowerSection'
import { TravelSection } from './sections/TravelSection'
import { MerchantQueueSection } from './sections/MerchantQueueSection'
import { RuleConflictsSection } from './sections/RuleConflictsSection'
import { MerchantControlsSection } from './sections/MerchantControlsSection'
import { FarmingSection } from './sections/FarmingSection'
import { EquipmentSection } from './sections/EquipmentSection'
import { InventorySection } from './sections/InventorySection'
import { RestockSection } from './sections/RestockSection'
import { GoldTargetSection } from './sections/GoldTargetSection'
import { AutoMarksSection } from './sections/AutoMarksSection'
import { CombatLogSection } from './sections/CombatLogSection'
import { LuckySlotSection } from './sections/LuckySlotSection'
import { AccountMenu } from './AccountMenu'
import { SessionControls } from '@/components/SessionControls'
import { PartyGold } from '@/components/PartyGold'
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
  const isMerchant = name === dynamicState.merchantCharacter
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [actionTarget, setActionTarget] = useState<ItemActionTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [luckySlotOpen, setLuckySlotOpen] = useState(false)
  const [actionOnLucky, setActionOnLucky] = useState(false)

  const state = characters[name]
  const vitals = state?.vitals
  const resolvedTargetType = useTargetMonsterType(name, vitals?.target)
  const farming = resolveFarmingContext(dynamicState, name)
  const others = Object.keys(characters).filter((n) => n !== name)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/')} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <SessionControls name={name} />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PartyGold />
          <LatencyBadge />
          <Button variant="ghost" size="icon-sm" onClick={() => void refreshNow()} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Menu" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" />
          </Button>
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
          <VitalsHeader
            name={name}
            vitals={vitals}
            bestiaryCatalog={dynamicState.bestiaryCatalog}
            resolvedTargetType={resolvedTargetType}
          />
          <div className="flex-1 pb-6">
            <LeaderFollowerSection characterName={name} dynamicState={dynamicState} />
            <TravelSection
              characterName={name}
              isMerchant={isMerchant}
              travelPlaces={dynamicState.travelPlaces}
            />
            {/* Merchant-class characters can't run hunts (farming-scope.ts) - a class capability, not the merchant role. */}
            {vitals.ctype !== 'merchant' && (
              <FarmingSection
                characterName={name}
                farmingPolicy={farming.savedMode}
                effectiveMode={farming.effectiveMode}
                followingLeader={farming.followingLeader}
                isLeader={dynamicState.leader === name}
                farmArea={farming.farmArea}
                // connected-character-card.tsx: `monsterFocusByCharacter?.[char.name] || selectedFocus`
                // (selectedFocus falling back to the flat state.monsterFocus) -
                // not just a leader-specific case. The SERVER deliberately keeps
                // monsterFocusByCharacter[leader] empty (navigation/focus.ts's
                // characterFocus() writes the leader's own focus into the flat
                // monsterFocus field and deletes their per-character entry, since
                // that's what followers/others inherit from) - reading only
                // monsterFocusByCharacter here meant the leader's screen always
                // showed "No monsters selected" even with a real focus configured.
                // An explicitly empty [] entry is kept (`||`, as on the dashboard),
                // and selectedFocus is use-party-console.tsx's verbatim.
                monsterFocus={dynamicState.monsterFocusByCharacter[name] || (Array.isArray(dynamicState.monsterFocus) ? dynamicState.monsterFocus : [dynamicState.monsterFocus || 'goo'])}
                monsterSearchRadius={dynamicState.monsterSearchRadiusByCharacter[name] ?? 400}
                bestiaryCatalog={dynamicState.bestiaryCatalog}
                monsterChoices={dynamicState.monsterChoices}
                phoenixRouteOrder={dynamicState.phoenixRouteOrder}
                position={{ map: vitals.map, x: vitals.x, y: vitals.y }}
                target={vitals.target}
                resolvedTargetType={resolvedTargetType}
                conditions={vitals.conditions}
                monsterHunt={farming.hunt}
                characterHunt={dynamicState.characterHunt[name] ?? null}
                huntBlacklist={farming.blacklist}
              />
            )}
            {isMerchant && <MerchantQueueSection />}
            {isMerchant && (
              <MerchantControlsSection forceStand={dynamicState.merchantForceStand} gatheringModes={dynamicState.gatheringModes} />
            )}
            {isMerchant && (
              <LuckySlotSection
                characterName={name}
                streams={dynamicState.luckySlotTracking[name] ?? {}}
                verified={dynamicState.luckyUpgradeSlots[name]}
                open={luckySlotOpen}
                onOpenChange={setLuckySlotOpen}
              />
            )}
            <EquipmentSection
              slots={state?.inventory?.slots ?? {}}
              upgradeMarks={(dynamicState.upgrades[name] ?? []).filter((mark) => mark.equipped)}
              statScrollMarks={dynamicState.statScrolls[name] ?? []}
              // equipment.tsx: the class, not the configured merchant role.
              isMerchant={vitals.ctype === 'merchant'}
              catalogFor={catalogFor}
              onSlotTap={(slotName, entry) => setActionTarget({ kind: 'equipment', slotName, item: entry.item })}
            />
            <InventorySection
              characterName={name}
              isMerchant={isMerchant}
              items={state?.inventory?.items ?? []}
              inventorySize={vitals.inventorySize}
              loaded={!!state?.inventory}
              dynamicState={dynamicState}
              catalogFor={catalogFor}
              onItemTap={(entry, lucky) => {
                setActionTarget({ kind: 'inventory', slot: entry.slot, item: entry.item })
                setActionOnLucky(lucky)
              }}
              onLuckySlotData={() => setLuckySlotOpen(true)}
            />
            <RestockSection characterName={name} serverPolicy={dynamicState.restockPolicies[name] ?? defaultRestockPolicy()} />
            <GoldTargetSection characterName={name} serverTarget={dynamicState.goldTargets[name] ?? 0} />
            {isMerchant && <RuleConflictsSection />}
            <AutoMarksSection characterName={name} isMerchant={isMerchant} dynamicState={dynamicState} catalogFor={catalogFor} />
            <CombatLogSection characterName={name} />
          </div>
        </>
      )}

      {actionTarget && (
        <ItemActionPanel
          target={actionTarget}
          characterName={name}
          isMerchant={isMerchant}
          catalog={dynamicState.merchantCatalog}
          monsters={dynamicState.bestiaryCatalog}
          onLuckySlotData={actionOnLucky && actionTarget.kind === 'inventory' ? () => setLuckySlotOpen(true) : undefined}
          onClose={() => setActionTarget(null)}
        />
      )}
      {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
