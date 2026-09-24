import { createContext, useContext } from 'react'

/** Lets any screen (not just the top-level App) open the "server
 *  address" override dialog - e.g. the account Settings screen (a later
 *  stage) reuses this instead of duplicating the dialog. */
export const ServerSettingsDialogContext = createContext<() => void>(() => {})

export const useOpenServerSettings = (): (() => void) => useContext(ServerSettingsDialogContext)
