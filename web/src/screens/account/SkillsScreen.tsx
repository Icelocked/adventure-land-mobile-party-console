import { useState } from 'react'
import { useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { DefinitionGrid } from '@/components/DefinitionGrid'
import { displayValue } from '@/lib/statusDuration'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { SkillEntry } from '@/models'
import { skillRangeLabel } from '@/lib/skillRange'

/** skills-dialog.tsx as a screen: search across class and skill, a sprite
 *  grid per class, and the selected skill's full definition in a sheet. */
export function SkillsScreen() {
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SkillEntry | null>(null)
  const filteredClasses = dynamicState.skillCatalog
    .map((entry) => ({ ...entry, skills: entry.skills.filter((skill) => `${skill.name} ${skill.id} ${entry.name}`.toLowerCase().includes(search.toLowerCase())) }))
    .filter((entry) => entry.skills.length)

  return (
    <AccountScreenScaffold title="Class skills" onRefresh={() => void refreshNow()}>
      {dynamicState.skillCatalog.length === 0 ? (
        <EmptyState message="No skill data yet." />
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <p className="text-xs text-muted-foreground">Browse every class-bound skill and the shared game actions. Click any skill for its complete definition.</p>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search classes or skills…" />
          {filteredClasses.map((entry) => (
            <section key={entry.id} aria-label={entry.name}>
              <h3 className="sticky top-0 z-10 mb-2 border-b border-violet-900 bg-background py-2 font-mono text-xs uppercase tracking-widest text-violet-300">{entry.name}</h3>
              <div className="grid grid-cols-3 gap-2">
                {entry.skills.map((skill) => (
                  <button key={skill.id} type="button" onClick={() => setSelected(skill)} className="min-w-0 rounded border border-violet-800 p-2 text-center">
                    <SpriteIcon sprite={skill.sprite} size={44} className="mx-auto" />
                    <p className="mt-1 truncate text-[11px]" title={skill.name}>
                      {skill.name}
                    </p>
                    <p className="truncate font-mono text-[9px] text-muted-foreground">{skill.id}</p>
                    <p className="mt-2 text-xs leading-4 text-violet-200">Range: {skillRangeLabel(skill)}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {selected && (
        <Sheet open onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <div role="group" aria-label="Skill details">
              <div className="mb-3 flex items-center gap-3">
                <SpriteIcon sprite={selected.sprite} size={48} />
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <p className="font-mono text-[10px] text-violet-300">G.skills.{selected.id}</p>
                </div>
              </div>
              {selected.definition?.explanation ? <p className="mb-4 text-sm leading-6">{displayValue(selected.definition.explanation)}</p> : null}
              <div className="mb-4 rounded border border-violet-800 p-3 text-sm text-violet-100">
                <p>
                  Range: <strong>{skillRangeLabel(selected)}</strong>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Base range in game distance units. Attack range depends on the character’s equipment. “Not specified” means the game definition does not supply a range.</p>
              </div>
              <DefinitionGrid value={selected.definition || {}} omit={['name', 'skin', 'explanation']} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}
