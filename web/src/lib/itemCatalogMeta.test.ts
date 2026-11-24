import { describe, expect, it } from 'vitest'
import { charactersWithCatalogMeta, stateWithCatalogMeta } from './itemCatalogMeta'
import { emptyPartyStateDynamic, type CharacterState, type MerchantCatalog } from '@/models'

// Entries as console v1.5.0 sends them: per-copy meta only
// (public-state-characters.ts metadataFields), world and usage in the catalog.
const catalog = {
  allItems: [
    {
      id: 'blade',
      name: 'Blade',
      meta: { definition: { name: 'Blade', g: 100 }, upgradeable: true, world: { suggestedPrices: [{ monsterId: 'goo', suggested: 900 }] }, usage: { classes: [{ id: 'rogue', name: 'Rogue', hands: 1 }], hands: [1] } },
    },
  ],
  buyable: [],
  craftable: [],
  exchangeable: [],
} as unknown as MerchantCatalog

describe('stateWithCatalogMeta', () => {
  it("joins the catalog's world and usage onto each bank entry, keeping the per-copy fields", () => {
    const state = {
      ...emptyPartyStateDynamic(),
      merchantCatalog: catalog,
      bank: { gold: 0, packs: { items0: [{ slot: 0, item: { name: 'blade', level: 3 }, meta: { definition: { name: 'Blade', g: 100 }, properties: { attack: 40 } } }, null] } },
    }
    const entry = stateWithCatalogMeta(state).bank!.packs.items0[0]!
    expect(entry.meta?.world?.suggestedPrices?.[0]?.suggested).toBe(900)
    expect(entry.meta?.usage?.hands).toEqual([1])
    expect(entry.meta?.properties).toEqual({ attack: 40 })
    expect(stateWithCatalogMeta(state)).toBe(stateWithCatalogMeta(state))
  })

  it('fills a null meta, which v1.5.0 sends before the catalog arrives, from the catalog', () => {
    const state = { ...emptyPartyStateDynamic(), merchantCatalog: catalog, bankbois: [{ name: 'Boi', state: 'ready', items: [{ slot: 0, item: { name: 'blade' }, meta: null }] }] }
    expect(stateWithCatalogMeta(state).bankbois[0].items![0]!.meta?.upgradeable).toBe(true)
  })
})

describe('charactersWithCatalogMeta', () => {
  it('joins inventory items and equipped slots, and returns the same record while nothing changes', () => {
    const characters: Record<string, CharacterState> = {
      Rogo: {
        vitals: null,
        inventory: {
          items: [{ slot: 0, item: { name: 'blade' }, meta: { definition: { name: 'Blade' }, upgradeable: true } }, null],
          slots: { mainhand: { item: { name: 'blade' }, meta: { definition: { name: 'Blade' }, properties: { attack: 10 } } }, offhand: null },
        },
      },
    }
    const joined = charactersWithCatalogMeta(catalog, characters)
    expect(joined.Rogo.inventory!.items[0]!.meta?.usage?.classes[0].id).toBe('rogue')
    expect(joined.Rogo.inventory!.slots.mainhand!.meta?.world?.suggestedPrices).toHaveLength(1)
    expect(joined.Rogo.inventory!.slots.mainhand!.meta?.properties).toEqual({ attack: 10 })
    expect(charactersWithCatalogMeta(catalog, characters)).toBe(joined)
  })
})
