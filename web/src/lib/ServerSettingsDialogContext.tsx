import { createContext, useContext } from 'react'

/** Lets any screen open the "server address" override dialog. */
export const ServerSettingsDialogContext = createContext<() => void>(() => {})

export const useOpenServerSettings = (): (() => void) => useContext(ServerSettingsDialogContext)
