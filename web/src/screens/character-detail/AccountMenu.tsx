import { useNavigate } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useMail, useDynamicState } from '@/data/PartyDataProvider'
import { occupiedStandSlots } from '@/lib/standInspection'
import { useStandMerchant } from '@/screens/account/StandScreen'
import { loadMenuLinks } from '@/lib/menuLinks'

/** The account-wide tools menu behind any character's hamburger icon:
 *  Mail, Catalog, Bestiary, Skills, Inspect Stand, View Market, Inspect
 *  Bank, Logs, Settings, then any links saved in Settings > Menu links. */
const ITEMS: { label: string; path: string }[] = [
  { label: 'Mail', path: '/mail' },
  { label: 'Catalog', path: '/catalog' },
  { label: 'Bestiary', path: '/bestiary' },
  { label: 'Skills', path: '/skills' },
  { label: 'Inspect stand', path: '/stand' },
  { label: 'View Market', path: '/market' },
  { label: 'Inspect Bank', path: '/bank' },
  { label: 'Merchant routines', path: '/routines' },
  { label: 'WTB orders', path: '/wtb' },
  { label: 'Logs', path: '/logs' },
  { label: 'Settings', path: '/settings' },
]

export function AccountMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  // "Mail (N)" while the inbox has messages.
  const mailCount = useMail().count
  // "Inspect stand · N/16" (occupied stand slots).
  const state = useDynamicState()
  const standCount = occupiedStandSlots(state.standListings, state.nativeStand, useStandMerchant())
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-4">
        <div className="mb-2 text-sm font-medium text-muted-foreground">Account</div>
        <div className="flex flex-col">
          {ITEMS.map((item) => (
            <button
              key={item.path}
              className="rounded-md px-2 py-2.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                navigate(item.path)
                onClose()
              }}
            >
              {item.label}
              {item.path === '/mail' && mailCount > 0 ? ` (${mailCount})` : ''}
              {item.path === '/stand' ? ` · ${standCount}/16` : ''}
            </button>
          ))}
          {/* A full page load, so the service worker hands pages outside this app to the server. */}
          {loadMenuLinks().map((link) => (
            <button key={link.path} className="rounded-md px-2 py-2.5 text-left text-sm hover:bg-accent" onClick={() => window.location.assign(link.path)}>
              {link.label}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
