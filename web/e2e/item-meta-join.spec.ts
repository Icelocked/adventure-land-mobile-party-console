// Console v1.5.0 sends inventory, stream and bank entries with only the per-copy meta
// fields (public-state-characters.ts metadataFields) and keeps world, usage and bonuses
// in merchantCatalog.allItems. The dashboard joins the two (item-catalog-meta.ts); the
// PWA must too, or an equipped item loses its set.
import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test("Equipment: an equipped set piece shows its set count from the catalog's world meta", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  const set = { id: 'wanderers', name: "Wanderer's Set", items: [{ id: 'wcap', quantity: 1 }, { id: 'wshoes', quantity: 1 }, { id: 'wattire', quantity: 1 }] }
  server.addCatalogEntry({ id: 'wcap', name: "Wanderer's Cap", upgradeable: true, world: { set } })
  server.addCatalogEntry({ id: 'wshoes', name: "Wanderer's Shoes", upgradeable: true, world: { set } })
  server.addCharacter({
    name: 'Rogo',
    ctype: 'rogue',
    level: 60,
    slots: { helmet: { item: { name: 'wcap', level: 5 } }, shoes: { item: { name: 'wshoes', level: 4 } } },
  })
  await server.install(page)
  await page.goto('/characters/Rogo')
  await expect(page.getByText('2/3')).toHaveCount(2)
})
