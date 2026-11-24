import { useSettingsWrite } from '@/data/useSettingsWrite'
import { useDynamicState } from '@/data/PartyDataProvider'

const box = 'flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm'
const help = 'text-xs text-muted-foreground'

/** Account > Realm's home realm: the realm the console treats as the party's home, written
 *  through the settings route. "Follow the account" saves null, and the console then uses the one
 *  home every account character shares in the game. Console: home-realm-setting.tsx. */
export function HomeRealmSetting() {
  const state = useDynamicState()
  const settings = useSettingsWrite()
  const saved = settings.value('homeRealm')
  const chosen = typeof saved === 'string' ? saved : ''
  const accountHome = state.realmControl?.homeRealm || null
  const realms = (state.realmControl?.realms || []).filter((realm) => !realm.pvp)
  const label = (key: string) => state.realmControl?.realms.find((realm) => realm.key === key)?.label || key
  return (
    <section aria-label="Home realm" className={box}>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Home realm</span>
        <select
          aria-label="Home realm"
          value={chosen}
          disabled={!settings.ready || settings.pending}
          onChange={(event) => void settings.write([{ field: 'homeRealm', value: event.target.value || null }])}
          className="h-9 rounded-md border border-border bg-background px-2"
        >
          <option value="">Follow the account{accountHome ? ` (${label(accountHome)})` : ''}</option>
          {realms.map((realm) => (
            <option key={realm.key} value={realm.key}>{realm.label}</option>
          ))}
        </select>
      </label>
      <p className={help}>
        The realm the console treats as home: characters log in there unless a move or switch names another realm. Following the account uses the home every character
        shares in the game.
      </p>
      {chosen && accountHome && chosen !== accountHome && (
        <p className="text-xs text-amber-400">
          Your characters&apos; game home is {label(accountHome)}, so they get Hop Sickness on {label(chosen)}. Change realm with &quot;Set as home realm&quot; moves the game home too.
        </p>
      )}
      {settings.notice && <p role="alert" className="text-xs text-amber-400">{settings.notice}</p>}
    </section>
  )
}

/** The merchant's realm blacklist (`merchantRealmBlacklist`): automatic merchant work skips a
 *  listed realm, and an order you give for one asks your confirmation first. PVP realms are not
 *  listed, since every switch refuses them. Console: merchant-realm-blacklist-setting.tsx. */
export function MerchantRealmBlacklistSetting() {
  const state = useDynamicState()
  const settings = useSettingsWrite()
  const blacklist = state.merchantRealmBlacklist ?? []
  const save = (realm: string, listed: boolean) =>
    void settings.write([{ field: 'merchantRealmBlacklist', value: listed ? [...blacklist, realm] : blacklist.filter((key) => key !== realm) }])
  return (
    <fieldset disabled={!settings.ready || settings.pending} aria-busy={!settings.ready} aria-describedby="merchant-realm-blacklist-help" className={box}>
      <legend className="font-mono text-xs uppercase">Realm blacklist</legend>
      <p id="merchant-realm-blacklist-help" className={help}>
        Automatic merchant work never travels to a listed realm. An order you give for one asks you to confirm it first.
      </p>
      <div className="grid grid-cols-2 gap-1">
        {(state.realmControl?.realms || [])
          .filter((realm) => !realm.pvp)
          .map((realm) => (
            <label key={realm.key} className="flex items-center gap-2">
              <input type="checkbox" checked={blacklist.includes(realm.key)} onChange={(event) => save(realm.key, event.target.checked)} className="size-4" />
              {realm.label}
            </label>
          ))}
      </div>
      {settings.notice && <p role="alert" className="text-xs text-amber-400">{settings.notice}</p>}
    </fieldset>
  )
}
