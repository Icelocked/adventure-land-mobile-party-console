import { useNavigate } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'

/** The account-wide tools menu, reachable from any character's hamburger
 *  icon - the web equivalent of the Android app's hamburger drawer
 *  (mobile-redesign plan's "Account" group): Mail, Catalog, Bestiary,
 *  Skills, Inspect Stand, View Market, Inspect Bank, Logs, Settings.
 *  Equipment/Inventory management stays inline on the character screen
 *  itself here, unlike Android's separate per-topic screens, since the
 *  web layout already shows everything in one scroll. */
const ITEMS: { label: string; path: string }[] = [
  { label: 'Mail', path: '/mail' },
  { label: 'Catalog', path: '/catalog' },
  { label: 'Bestiary', path: '/bestiary' },
  { label: 'Skills', path: '/skills' },
  { label: 'Inspect Stand', path: '/stand' },
  { label: 'View Market', path: '/market' },
  { label: 'Inspect Bank', path: '/bank' },
  { label: 'Logs', path: '/logs' },
  { label: 'Settings', path: '/settings' },
]

export function AccountMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
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
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
