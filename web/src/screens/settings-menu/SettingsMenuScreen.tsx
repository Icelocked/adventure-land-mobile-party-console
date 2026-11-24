import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDynamicState, useCharacters, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useAddons } from '@/data/useAddons'
import { addonTitle, consoleFeatures } from '@/models'
import { ACCOUNT_SECTIONS, characterSections, parseSettingsTarget, settingsMenuPath, type SettingsTarget } from '@/lib/settingsTarget'
import { cn } from '@/lib/utils'
import { AccountScreenScaffold, EmbeddedInMenu } from '@/screens/account/AccountScreenScaffold'
import { DashboardStateImport } from '@/screens/account/settings/DashboardStateImport'
import { ConsoleUpdateSettings, HostingSettings } from '@/screens/account/settings/ConsoleSettings'
import { AccountMembers } from '@/screens/account/settings/AccountMembers'
import { NotificationsSection } from '@/screens/account/settings/NotificationsSection'
import { MenuLinksSettings } from '@/screens/account/settings/MenuLinks'
import { PwaUpdateSettings } from '@/screens/account/settings/PwaUpdates'
import { About } from '@/screens/account/settings/About'
import { ALDataSection } from '@/screens/account/SettingsScreen'
import { RealmSection } from '@/screens/account/RealmSection'
import { BossChaseSetting, RealmHopBlacklistSetting } from '@/screens/account/RealmChaseSettings'
import { MarketplaceSettingsScreen } from '@/screens/account/MarketplaceSettingsScreen'
import { HuntSettingsScreen } from '@/screens/account/HuntSettingsScreen'
import { RoutinesScreen } from '@/screens/account/RoutinesScreen'
import { MerchantSettings } from '@/screens/merchant/MerchantSettings'
import { RestockSection } from '@/screens/character-detail/sections/RestockSection'
import { LeaderFollowerSection } from '@/screens/character-detail/sections/LeaderFollowerSection'
import { DungeonPanel } from '@/screens/dungeon/DungeonPanel'
import { CombatSettingsSection } from './CombatSettingsSection'
import { HomeRealmSetting } from './RealmSettings'
import { SettingsLock } from './SettingsLock'

const tab = (selected: boolean) =>
  cn('shrink-0 rounded-md border px-2 py-1 text-sm', selected ? 'border-primary bg-primary/15 text-primary' : 'border-border text-foreground')
const section = (selected: boolean) =>
  cn('shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] uppercase', selected ? 'border-emerald-500 bg-emerald-950 text-emerald-50' : 'border-border text-muted-foreground')

/** The one settings menu (console settings-menu.tsx), as a screen: a pinned header of two tab
 *  rows over the selected section. Row 1 is Account, Events, Addons and one tab per character;
 *  row 2 is the selected tab's sections. Every settings button links to its own tab and section
 *  (lib/settingsTarget.ts). */
export function SettingsMenuScreen() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const characters = useCharacters()
  const addons = useAddons()
  const names = Object.keys(characters)
  const target = parseSettingsTarget(search)
  // A character tab whose character left the party falls back to Account.
  const shown: SettingsTarget = target.tab === 'character' && !names.includes(target.character) ? { tab: 'account' } : target
  const merchant = (name: string) => name === state.merchantCharacter || characters[name]?.vitals?.ctype === 'merchant'
  const sections: { id: string; label: string }[] =
    shown.tab === 'account' ? [...ACCOUNT_SECTIONS]
      : shown.tab === 'events' ? [{ id: 'cave', label: 'Cave' }, ...names.map((name) => ({ id: name, label: name }))]
        : shown.tab === 'addons' ? [{ id: 'all', label: 'All add-ons' }, ...addons.addons.map((addon) => ({ id: addon.name, label: addonTitle(addon.name) }))]
          : characterSections(merchant(shown.character))
  const current = sections.find((entry) => entry.id === shown.section)?.id ?? sections[0]?.id
  // The menu replaces its own address, so Back leaves the menu.
  const go = (next: SettingsTarget) => navigate(settingsMenuPath(next), { replace: true })
  const choose = (id: string) => {
    if (shown.tab === 'character') go({ tab: 'character', character: shown.character, section: id as never })
    else if (shown.tab === 'account') go({ tab: 'account', section: id as never })
    else go({ tab: shown.tab, section: id })
  }
  const row1: { key: string; label: string; target: SettingsTarget }[] = [
    { key: 'account', label: 'Account', target: { tab: 'account' } },
    { key: 'events', label: 'Events', target: { tab: 'events' } },
    { key: 'addons', label: 'Addons', target: { tab: 'addons' } },
    ...names.map((name) => ({ key: `character:${name}`, label: name, target: { tab: 'character', character: name } as SettingsTarget })),
  ]
  const selected = shown.tab === 'character' ? `character:${shown.character}` : shown.tab
  return (
    <AccountScreenScaffold title="Settings" onRefresh={() => void refreshNow()}>
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background px-3 py-2">
        <div role="tablist" aria-label="Settings" className="flex flex-wrap gap-1.5">
          {row1.map((entry) => (
            <button key={entry.key} type="button" role="tab" aria-selected={selected === entry.key} onClick={() => go(entry.target)} className={tab(selected === entry.key)}>
              {entry.label}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-1.5">
          {sections.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={current === entry.id} onClick={() => choose(entry.id)} className={section(current === entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
      </header>
      <div role="tabpanel" className="flex flex-col gap-3 p-3 text-sm">
        <EmbeddedInMenu.Provider value>
          <SettingsLock>{current ? <Body target={shown} current={current} /> : null}</SettingsLock>
        </EmbeddedInMenu.Provider>
      </div>
    </AccountScreenScaffold>
  )
}

function Body({ target, current }: { target: SettingsTarget; current: string }): ReactNode {
  const state = useDynamicState()
  const characters = useCharacters()
  const features = consoleFeatures(state)
  switch (target.tab) {
    case 'account':
      switch (current) {
        case 'import': return <DashboardStateImport />
        case 'realm':
          return (
            <>
              <RealmSection control={state.realmControl ?? { split: false, characters: [], realms: [] }}>
                {features.bossChase && <BossChaseSetting chase={state.bossChase} />}
                {features.realmHopBlacklist && <RealmHopBlacklistSetting realms={state.realmControl?.realms || []} blacklist={state.realmHopBlacklist} />}
              </RealmSection>
              <HomeRealmSetting />
            </>
          )
        case 'characters': return <AccountMembers />
        case 'aldata': return <ALDataSection />
        case 'marketplace': return <MarketplaceSettingsScreen />
        // The dashboard's Display section holds its own display switch; the PWA's holds this app's own settings.
        case 'display':
          return (
            <>
              <NotificationsSection />
              <MenuLinksSettings />
              <PwaUpdateSettings />
              <About />
            </>
          )
        case 'hosting': return <HostingSettings />
        case 'console': return <ConsoleUpdateSettings />
      }
      return null
    case 'events':
      if (current === 'cave') return <DungeonPanel />
      return <LeaderFollowerSection key={current} characterName={current} dynamicState={state} />
    case 'addons':
      return null
    case 'character': {
      const name = target.character
      switch (current) {
        case 'farming': return <HuntSettingsScreen key={name} name={name} />
        case 'combat': return <CombatSettingsSection key={name} character={name} ctype={characters[name]?.vitals?.ctype ?? ''} />
        case 'restock': return <RestockSection key={name} characterName={name} serverPolicy={state.restockPolicies[name] ?? {}} />
        case 'merchant': return <MerchantSettings />
        case 'routines': return <RoutinesScreen />
      }
    }
  }
  return null
}
