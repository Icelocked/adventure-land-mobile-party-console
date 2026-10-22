import { describe, expect, it } from 'vitest'
import { npcShopOffers, npcShopRows } from './npcShop'

// Cases follow the console's dashboard/features/party/npc-shop-dialog.tsx
// (live build 2db4d763). The Ponty listing shape is a live
// section=market read from 2026-10-22.

const ponty = (rid: string, name: string, level: number, unitPrice: number, quantity: number, realm = ['US', 'III']) => ({
  key: `${realm.join(':')}:${rid}`,
  rid,
  item: { name, level, rid },
  serverRegion: realm[0],
  serverIdentifier: realm[1],
  quantity,
  unitPrice,
  price: unitPrice * quantity,
})

describe('npcShopRows', () => {
  it('groups offers by item and level with the cheapest unit price, sorted by name then level', () => {
    const rows = npcShopRows([ponty('a', 'wbook0', 0, 500, 2), ponty('b', 'wbook0', 0, 400, 1), ponty('c', 'blade', 7, 9000, 1), ponty('d', 'blade', 0, 50, 3)])
    expect(rows).toEqual([
      { key: 'blade@0', name: 'blade', level: 0, copies: 3, low: 50 },
      { key: 'blade@7', name: 'blade', level: 7, copies: 1, low: 9000 },
      { key: 'wbook0@0', name: 'wbook0', level: 0, copies: 3, low: 400 },
    ])
  })
})

describe('npcShopOffers', () => {
  const listings = [ponty('a', 'wbook0', 0, 500, 1), ponty('b', 'wbook0', 0, 400, 1, ['EU', 'I'])]
  const ronListing = ponty('r', 'ringsj', 0, 2000, 1)
  const shop = { merchantRealm: 'USIII', ron: { listings: [ronListing] } }

  it('keeps only Ponty listings on the merchant realm', () => {
    expect(npcShopOffers('ponty', listings, shop).map((offer) => offer.rid)).toEqual(['a'])
  })

  it('shows Ron his own last read listings', () => {
    expect(npcShopOffers('ron', listings, shop)).toEqual([ronListing])
    expect(npcShopOffers('ron', listings, { merchantRealm: 'USIII', ron: null })).toEqual([])
  })
})
