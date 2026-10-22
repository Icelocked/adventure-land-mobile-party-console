import { useState } from 'react'
import { useDynamicState } from '@/data/PartyDataProvider'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CharacterPortrait } from '@/components/CharacterPortrait'
import { ItemCard } from '@/components/ItemCard'
import { SpriteIcon } from '@/components/SpriteIcon'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { comparisonSlotsFor, detailMeta } from '@/lib/itemFormulas'
import { CharacterStatsSheet } from '@/screens/character-detail/CharacterStatsSheet'
import { GearComparisonSheet } from '@/screens/itempanel/GearComparisonSheet'
import type { CharacterDiagnostics, EquippedEntry, ItemMeta, OfflineCharacter } from '@/models'

type Shown = EquippedEntry & { label: string; meta: ItemMeta | undefined }

/** Console 1.5 offline-character-view.tsx: a saved character's equipment and
 *  inventory, each item's card and a comparison against its saved gear, and its
 *  stats in "Offline snapshot" mode. */
export function OfflineCharacterSheet({ character, onClose }: { character: OfflineCharacter; onClose: () => void }) {
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const [stats, setStats] = useState(false)
  const [item, setItem] = useState<Shown | null>(null)
  const [comparison, setComparison] = useState<Shown | null>(null)
  const skillName = (id: string) => state.skillCatalog.flatMap((entry) => entry.skills).find((skill) => skill.id === id)?.name
  // Saved entries carry per-copy meta (properties); the catalog supplies the rest.
  const shown = (entry: EquippedEntry, label: string): Shown => ({ ...entry, label, meta: detailMeta(catalogFor(entry.item.name)?.meta, entry.meta) })
  const sections = [
    { title: 'Equipment', entries: Object.entries(character.slots).flatMap(([slot, entry]) => (entry ? [shown(entry, slot)] : [])) },
    { title: 'Inventory', entries: character.items.flatMap((entry) => (entry ? [shown(entry, `Slot ${entry.slot}`)] : [])) },
  ]
  const nameOf = (entry: Shown) => `${String(entry.meta?.definition?.name || entry.item.name)} +${entry.item.level || 0}`
  const comparable = (entry: Shown) => comparisonSlotsFor(entry.meta, character.ctype).length > 0
  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" aria-label={`${character.name} inventory and equipment`} className="max-h-[88vh] overflow-y-auto p-4">
          <h2 className="text-lg font-semibold">{character.name} inventory and equipment</h2>
          <p className="text-sm text-muted-foreground">
            Offline · saved observation{character.updatedAt ? ` · ${new Date(character.updatedAt).toLocaleString()}` : ''}
          </p>
          {character.inspection && (
            <p className="text-sm text-muted-foreground">
              {character.inspection.note}
              <br />
              Last game sync: {character.inspection.synchronizedAt ? new Date(character.inspection.synchronizedAt).toLocaleString() : 'unknown'}
            </p>
          )}
          <button type="button" aria-label={`View ${character.name} stats`} onClick={() => setStats(true)} className="relative my-2 h-24 w-20 rounded border border-border">
            <CharacterPortrait html={character.characterDollHtml} sprite={character.characterSprite} skin={character.skin} className="h-full w-full" />
          </button>
          <p>
            Level {character.level} {character.ctype} · {character.gold.toLocaleString()} gold
          </p>
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="my-2 font-semibold">{section.title}</h3>
              <div className="grid grid-cols-3 gap-2">
                {section.entries.map((entry, index) => (
                  <div key={index} className="flex flex-col gap-1">
                    <button type="button" aria-label={`Inspect ${nameOf(entry)}`} onClick={() => setItem(entry)} className="rounded border border-border p-2 text-center text-xs">
                      <SpriteIcon sprite={entry.meta?.sprite ?? catalogFor(entry.item.name)?.sprite} size={40} className="mx-auto" />
                      {entry.label}
                      <br />
                      {nameOf(entry)}
                    </button>
                    {comparable(entry) && (
                      <Button size="sm" variant="outline" aria-label={`Compare ${nameOf(entry)}`} onClick={() => setComparison(entry)}>
                        Compare with equipped
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </SheetContent>
      </Sheet>
      {item && (
        <Sheet open onOpenChange={(open) => !open && setItem(null)}>
          <SheetContent side="bottom" aria-label={nameOf(item)} className="max-h-[85vh] overflow-y-auto p-4">
            <h3 className="mb-2 font-semibold">{nameOf(item)}</h3>
            <ItemCard
              item={item.item}
              meta={item.meta}
              level={item.item.level || 0}
              properties={item.meta?.properties || {}}
              usable={false}
              skillName={skillName}
              skillHint={() => undefined}
              onSkill={() => {}}
            />
            {comparable(item) && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setComparison(item)
                  setItem(null)
                }}
              >
                Compare
              </Button>
            )}
          </SheetContent>
        </Sheet>
      )}
      {stats &&
        (character.inspection && !character.inspection.calculated ? (
          <Sheet open onOpenChange={(open) => !open && setStats(false)}>
            <SheetContent side="bottom" aria-label={`${character.name} saved stats`} className="p-4 text-sm">
              <h3 className="mb-2 font-semibold">{character.name} saved stats</h3>
              <p>{character.inspection.note}</p>
              <p>Level: {character.level}</p>
              <p>XP: {Number(character.xp || 0).toLocaleString()}</p>
              <p>HP: {character.hp}</p>
              <p>MP: {character.mp}</p>
              <p>Gold: {character.gold.toLocaleString()}</p>
              <p>Maximum HP/MP, attack, armor, resistance and attributes: unavailable</p>
            </SheetContent>
          </Sheet>
        ) : (
          <CharacterStatsSheet name={character.name} vitals={character} diagnostics={character as CharacterDiagnostics} slots={character.slots} offline onClose={() => setStats(false)} />
        ))}
      {comparison && <GearComparisonSheet item={comparison.item} meta={comparison.meta} characterName={character.name} offline={character} onClose={() => setComparison(null)} />}
    </>
  )
}
