import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loadMenuLinks, MAX_LABEL, menuLinkProblem, saveMenuLinks, type MenuLink } from '@/lib/menuLinks'

/** Extra account-menu links to pages the same server hosts beside this app. Saved on this
 *  device only; with none saved, the menu shows nothing extra. */
export function MenuLinksSettings() {
  const [links, setLinks] = useState<MenuLink[]>(loadMenuLinks)
  const [label, setLabel] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const update = (next: MenuLink[]) => {
    saveMenuLinks(next)
    setLinks(next)
  }
  return (
    <section aria-label="Menu links" className="rounded-md border border-border bg-card p-4">
      <div className="mb-1 text-sm font-medium">Menu links</div>
      <p className="mb-2 text-xs text-muted-foreground">Add pages your server hosts beside this app to the account menu. Saved on this device only.</p>
      {links.map((link, index) => (
        <div key={`${link.path}-${index}`} className="flex items-center justify-between gap-2 py-1 text-sm">
          <span className="min-w-0 truncate">
            {link.label} <span className="font-mono text-xs text-muted-foreground">{link.path}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => update(links.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <div className="mt-2 flex gap-2">
        <Input aria-label="Link label" placeholder="Label" value={label} maxLength={MAX_LABEL} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
        <Input aria-label="Link path" placeholder="/path/" value={path} onChange={(e) => setPath(e.target.value)} className="flex-1 font-mono" />
        <Button
          onClick={() => {
            const link = { label: label.trim(), path: path.trim() }
            const problem = menuLinkProblem(link)
            setError(problem)
            if (problem) return
            update([...links, link])
            setLabel('')
            setPath('')
          }}
        >
          Add
        </Button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </section>
  )
}
