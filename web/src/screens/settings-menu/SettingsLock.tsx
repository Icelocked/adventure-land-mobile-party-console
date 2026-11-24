import type { ReactNode } from 'react'
import { useSettingsWrite } from '@/data/useSettingsWrite'

/** The settings controls inside stay locked, showing loading, until the console's settings
 *  arrive (console settings-lock.tsx). */
export function SettingsLock({ children }: { children: ReactNode }) {
  const { ready } = useSettingsWrite()
  return (
    <fieldset disabled={!ready} aria-busy={!ready} className="contents">
      {children}
    </fieldset>
  )
}
