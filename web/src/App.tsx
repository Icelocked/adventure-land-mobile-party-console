import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PartyDataProvider } from '@/data/PartyDataProvider'
import { loadServerSettings, saveServerSettings, clearServerSettings, SAME_ORIGIN_SETTINGS, type ServerSettings } from '@/config/serverConfig'
import { ServerSettingsDialogContext } from '@/lib/ServerSettingsDialogContext'
import { PairingGate } from '@/screens/PairingGate'
import { ActionToastHost } from '@/components/ActionToastHost'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CharacterListScreen } from '@/screens/CharacterListScreen'
import { CharacterDetailScreen } from '@/screens/character-detail/CharacterDetailScreen'
import { MailScreen } from '@/screens/account/MailScreen'
import { CatalogScreen } from '@/screens/account/CatalogScreen'
import { BestiaryScreen } from '@/screens/account/BestiaryScreen'
import { SkillsScreen } from '@/screens/account/SkillsScreen'
import { StandScreen } from '@/screens/account/StandScreen'
import { MarketScreen } from '@/screens/account/MarketScreen'
import { BankScreen } from '@/screens/account/BankScreen'
import { MerchantCommerceScreen } from '@/screens/account/MerchantCommerceScreen'
import { RoutinesScreen } from '@/screens/account/RoutinesScreen'
import { HuntSettingsScreen } from '@/screens/account/HuntSettingsScreen'
import { WtbScreen } from '@/screens/account/WtbScreen'
import { OfferingsScreen } from '@/screens/account/OfferingsScreen'
import { LogsScreen } from '@/screens/account/LogsScreen'
import { SettingsScreen } from '@/screens/account/SettingsScreen'

const queryClient = new QueryClient()

export default function App() {
  const [settings, setSettings] = useState<ServerSettings>(() => loadServerSettings())
  const [showOverride, setShowOverride] = useState(false)

  return (
    <QueryClientProvider client={queryClient}>
      <ActionToastHost />
      <PairingGate>
        <PartyDataProvider settings={settings} key={settings.baseUrl}>
          <ServerSettingsDialogContext.Provider value={() => setShowOverride(true)}>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<CharacterListScreen />} />
                <Route path="/characters/:name" element={<CharacterDetailScreen />} />
                <Route path="/mail" element={<MailScreen />} />
                <Route path="/catalog" element={<CatalogScreen />} />
                <Route path="/bestiary" element={<BestiaryScreen />} />
                <Route path="/skills" element={<SkillsScreen />} />
                <Route path="/stand" element={<StandScreen />} />
                <Route path="/market" element={<MarketScreen />} />
                <Route path="/bank" element={<BankScreen />} />
                <Route path="/merchant/:mode" element={<MerchantCommerceScreen />} />
                <Route path="/routines" element={<RoutinesScreen />} />
                <Route path="/hunt-settings" element={<HuntSettingsScreen />} />
                <Route path="/wtb" element={<WtbScreen />} />
                <Route path="/offerings" element={<OfferingsScreen />} />
                <Route path="/logs" element={<LogsScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />
              </Routes>
            </BrowserRouter>
          </ServerSettingsDialogContext.Provider>
        </PartyDataProvider>
      </PairingGate>
      {showOverride && (
        <OverrideDialog
          current={settings}
          onClose={() => setShowOverride(false)}
          onSave={(next) => {
            saveServerSettings(next)
            setSettings(next)
            setShowOverride(false)
          }}
          onReset={() => {
            clearServerSettings()
            setSettings(SAME_ORIGIN_SETTINGS)
            setShowOverride(false)
          }}
        />
      )}
    </QueryClientProvider>
  )
}

function OverrideDialog({
  current,
  onClose,
  onSave,
  onReset,
}: {
  current: ServerSettings
  onClose: () => void
  onSave: (settings: ServerSettings) => void
  onReset: () => void
}) {
  const [input, setInput] = useState(current.baseUrl)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Server address</h2>
        <p className="text-sm text-muted-foreground">
          Leave blank to use this same origin (the default, correct for the self-hosted setup - see DEPLOYMENT.md). Only set this if you know
          the target server sends CORS headers allowing this origin.
        </p>
        <Input placeholder="(same origin)" value={input} onChange={(event) => setInput(event.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset to same-origin
          </Button>
          <Button size="sm" onClick={() => onSave({ baseUrl: input.trim() })}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
