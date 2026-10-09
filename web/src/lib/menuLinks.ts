/** Extra links the user adds to the account menu, stored on this device only. They open pages
 *  the same server hosts beside this app, such as a self-hosted add-on. With none saved, the
 *  menu shows nothing extra. */
export interface MenuLink {
  label: string
  /** A path on this same site, such as "/tools/"; never another site. */
  path: string
}

const STORAGE_KEY = 'party-console-companion:menu-links'
export const MAX_LABEL = 40

/** Why `link` can't be saved, or null when it can. */
export function menuLinkProblem(link: MenuLink): string | null {
  const label = link.label.trim(), path = link.path.trim()
  if (!label) return 'Enter a label'
  if (label.length > MAX_LABEL) return `Keep the label to ${MAX_LABEL} characters`
  // "//host" would leave this site, and a backslash can too in some browsers.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return 'Enter a path on this site, starting with /'
  return null
}

export const loadMenuLinks = (): MenuLink[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((l): l is MenuLink => !!l && typeof l.label === 'string' && typeof l.path === 'string')
      .map((l) => ({ label: l.label.trim(), path: l.path.trim() }))
      .filter((l) => menuLinkProblem(l) === null)
  } catch {
    return []
  }
}

export const saveMenuLinks = (links: MenuLink[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
  } catch {
    // Storage disabled: the links won't persist on this device.
  }
}
