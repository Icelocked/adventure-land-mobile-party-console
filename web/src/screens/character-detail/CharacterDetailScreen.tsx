import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Menu, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LatencyBadge } from '@/components/LatencyBadge'
import { useCharacters, useDynamicState, useRefreshDynamicStateNow, useCharacterDiagnosticsMap, useCharacterOnline } from '@/data/PartyDataProvider'
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
import { StatusesSection } from './sections/StatusesSection'
import { LuckySlotSection } from './sections/LuckySlotSection'
import { MapSection } from './sections/MapSection'
import { AccountMenu } from './AccountMenu'
import { SessionControls } from '@/components/SessionControls'
import { PartyGold } from '@/components/PartyGold'
import { ItemActionPanel, type ItemActionTarget } from '@/screens/itempanel/ItemActionPanel'

/** Character focus screen: a sticky vitals header over a scrollable body of
 *  section cards. Item taps (equipment/inventory) open the bottom
 *  item-action panel. */
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
  const diagnostics = useCharacterDiagnosticsMap()
  const online = useCharacterOnline(name)
  const resolvedTargetType = useTargetMonsterType(name, vitals?.target)
  const farming = resolveFarmingContext(dynamicState, name)
  const others = Object.keys(characters).filter((n) => n !== name)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col md:h-dvh md:min-h-0 md:max-w-6xl">
      {/* The title bar and the character switcher stay in view while the page scrolls. */}
      <div className="sticky top-0 z-20 bg-background">
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
      </div>

      {!vitals ? (
        <p className="p-6 text-sm text-muted-foreground">This character isn't reporting in right now.</p>
      ) : (
        // Wide screens (a turned phone, a tablet): the character and its
        // controls on the left, gear, inventory and rules on the right, each
        // scrolling on its own under the fixed title bar. A narrow screen
        // keeps one column in the same order.
        <div className="flex-1 pb-6 md:grid md:min-h-0 md:grid-cols-2 md:pb-0">
          <div className="min-w-0 md:overflow-y-auto md:pb-6">
          <VitalsHeader
            name={name}
            vitals={vitals}
            bestiaryCatalog={dynamicState.bestiaryCatalog}
            resolvedTargetType={resolvedTargetType}
            diagnostics={diagnostics[name]}
            slots={state?.inventory?.slots ?? {}}
            online={online}
          />
          {/* The live map sits under the card header. */}
          <MapSection name={name} map={vitals.map} x={vitals.x} y={vitals.y} />
            {/* Statuses sit under HP/MP for every class. */}
            <StatusesSection characterName={name} conditions={vitals.conditions ?? []} />
            <LeaderFollowerSection characterName={name} dynamicState={dynamicState} />
            <TravelSection
              characterName={name}
              isMerchant={isMerchant}
              travelPlaces={dynamicState.travelPlaces}
            />
            {/* Merchant-class characters can't run hunts (farming-scope.ts) - a class capability, not the merchant role. */}
            {(vitals.ctype !== 'merchant' || name !== dynamicState.merchantCharacter) && (
              <FarmingSection
                showModes={vitals.ctype !== 'merchant'}
                showFocus={name !== dynamicState.merchantCharacter}
                characterName={name}
                farmingPolicy={farming.savedMode}
                effectiveMode={farming.effectiveMode}
                followingLeader={farming.followingLeader}
                isLeader={dynamicState.leader === name}
                farmArea={farming.farmArea}
                // Per-character focus, falling back to the flat state.monsterFocus.
                // The server keeps monsterFocusByCharacter[leader] empty: the
                // leader's focus lives in the flat field, which others inherit
                // (navigation/focus.ts characterFocus()). An explicitly empty []
                // entry is kept (`||`, not `??`).
                monsterFocus={dynamicState.monsterFocusByCharacter[name] || (Array.isArray(dynamicState.monsterFocus) ? dynamicState.monsterFocus : [dynamicState.monsterFocus || 'goo'])}
                monsterSearchRadius={dynamicState.monsterSearchRadiusByCharacter[name] ?? 400}
                bestiaryCatalog={dynamicState.bestiaryCatalog}
                monsterChoices={dynamicState.monsterChoices}
                phoenixRouteOrder={dynamicState.phoenixRouteOrder}
                position={{ map: vitals.map, x: vitals.x, y: vitals.y }}
                target={vitals.target}
                resolvedTargetType={resolvedTargetType}
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
                localLucky={vitals.luckySlotTracking}
              />
            )}
          </div>
          <div className="min-w-0 md:overflow-y-auto md:pt-1.5 md:pb-6">
            <EquipmentSection
              slots={state?.inventory?.slots ?? {}}
              upgradeMarks={(dynamicState.upgrades[name] ?? []).filter((mark) => mark.equipped)}
              statScrollMarks={dynamicState.statScrolls[name] ?? []}
              // The class, not the configured merchant role.
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
              localLucky={vitals.luckySlotTracking}
            />
            <RestockSection characterName={name} serverPolicy={dynamicState.restockPolicies[name] ?? defaultRestockPolicy()} />
            {name === dynamicState.merchantCharacter && <GoldTargetSection characterName={name} serverTarget={dynamicState.goldTargets[name] ?? 0} gold={vitals.gold ?? 0} />}
            {isMerchant && <RuleConflictsSection />}
            <AutoMarksSection characterName={name} isMerchant={isMerchant} dynamicState={dynamicState} catalogFor={catalogFor} />
            <CombatLogSection characterName={name} />
          </div>
        </div>
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
