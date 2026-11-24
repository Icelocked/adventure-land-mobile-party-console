import type { BankSnapshot, Bankboi, CharacterState, ItemMeta, MerchantCatalog, PartyStateDynamic } from '@/models'

// Port of the console's dashboard/features/party/item-catalog-meta.ts (v1.5.0).
// Since v1.5.0 inventory, stream and bank entries carry only the per-copy
// meta fields (public-state-characters.ts metadataFields), and
// merchantCatalog.allItems carries the per-type meta (world, usage, bonuses).
// Readers see the two joined through this module.

type Entry = { item?: { name?: string } | null; meta?: ItemMeta | null }

// One index per catalog object; the catalog query replaces that object only
// on a new referenceRevision.
const indexes = new WeakMap<object, Map<string, ItemMeta>>()
// Joins are cached per live object, so memoized tiles see the same object
// until the report or the catalog changes.
const metaJoins = new WeakMap<object, { known: ItemMeta; joined: ItemMeta }>()
const entryJoins = new WeakMap<object, { known: ItemMeta; joined: Entry }>()
const bankJoins = new WeakMap<object, { catalog: unknown; joined: BankSnapshot }>()
const bankboiJoins = new WeakMap<object, { catalog: unknown; joined: Bankboi[] }>()
const characterJoins = new WeakMap<object, { catalog: unknown; joined: CharacterState }>()
const stateJoins = new WeakMap<object, PartyStateDynamic>()
const characterMapJoins = new WeakMap<object, { catalog: unknown; joined: Record<string, CharacterState> }>()

function catalogIndex(catalog: MerchantCatalog | null | undefined): Map<string, ItemMeta> | undefined {
  if (!catalog) return undefined
  let index = indexes.get(catalog)
  if (!index) {
    index = new Map()
    for (const entry of catalog.allItems || []) if (entry.meta) index.set(entry.id, entry.meta)
    indexes.set(catalog, index)
  }
  return index
}

/** Per-type meta for one item id. */
export function catalogItemMeta(catalog: MerchantCatalog | null | undefined, name: string | undefined): ItemMeta | undefined {
  return name ? catalogIndex(catalog)?.get(name) : undefined
}

/** Catalog meta with the live per-copy fields on top; full live meta from older consoles keeps its own world. */
export function joinItemMeta(catalog: MerchantCatalog | null | undefined, name: string | undefined, live: ItemMeta | null | undefined): ItemMeta | null | undefined {
  const known = catalogItemMeta(catalog, name)
  if (!known) return live
  if (!live) return known
  const cached = metaJoins.get(live)
  if (cached?.known === known) return cached.joined
  const joined = { ...known, ...live, world: live.world || known.world }
  metaJoins.set(live, { known, joined })
  return joined
}

/** The same entry with joined meta, or the entry itself when nothing joins. */
export function withCatalogMeta<T extends Entry | null | undefined>(catalog: MerchantCatalog | null | undefined, entry: T): T {
  if (!entry) return entry
  const known = catalogItemMeta(catalog, entry.item?.name || undefined)
  if (!known) return entry
  const cached = entryJoins.get(entry)
  if (cached?.known === known) return cached.joined as T
  const joined = { ...entry, meta: joinItemMeta(catalog, entry.item?.name || undefined, entry.meta) }
  entryJoins.set(entry, { known, joined })
  return joined as T
}

/** Bank packs with joined meta, recomputed only when the snapshot or catalog changes. */
export function bankWithCatalogMeta(catalog: MerchantCatalog | null | undefined, bank: BankSnapshot | null | undefined): BankSnapshot | null | undefined {
  if (!bank || !catalog) return bank
  const cached = bankJoins.get(bank)
  if (cached?.catalog === catalog) return cached.joined
  const packs = Object.fromEntries(
    Object.entries(bank.packs || {}).map(([pack, entries]) => [pack, Array.isArray(entries) ? entries.map((entry) => withCatalogMeta(catalog, entry)) : entries]),
  )
  const joined = { ...bank, packs }
  bankJoins.set(bank, { catalog, joined })
  return joined
}

/** Storage worker inventories, joined like the bank they hold. */
export function bankboisWithCatalogMeta(catalog: MerchantCatalog | null | undefined, bankbois: Bankboi[]): Bankboi[] {
  if (!catalog || !Array.isArray(bankbois)) return bankbois
  const cached = bankboiJoins.get(bankbois)
  if (cached?.catalog === catalog) return cached.joined
  const joined = bankbois.map((bankboi) => (bankboi.items ? { ...bankboi, items: bankboi.items.map((entry) => withCatalogMeta(catalog, entry)) } : bankboi))
  bankboiJoins.set(bankbois, { catalog, joined })
  return joined
}

/** A character's items and slots with joined meta, recomputed only when either input changes. */
export function characterWithCatalogMeta(catalog: MerchantCatalog | null | undefined, character: CharacterState): CharacterState {
  if (!catalog || !character?.inventory) return character
  const cached = characterJoins.get(character)
  if (cached?.catalog === catalog) return cached.joined
  const { items, slots } = character.inventory
  const joined = {
    ...character,
    inventory: {
      ...character.inventory,
      items: items.map((entry) => withCatalogMeta(catalog, entry)),
      slots: Object.fromEntries(Object.entries(slots).map(([slot, entry]) => [slot, withCatalogMeta(catalog, entry)])),
    },
  }
  characterJoins.set(character, { catalog, joined })
  return joined
}

/** Every character joined; the record object stays the same while nothing changes. */
export function charactersWithCatalogMeta(catalog: MerchantCatalog | null | undefined, characters: Record<string, CharacterState>): Record<string, CharacterState> {
  if (!catalog) return characters
  const cached = characterMapJoins.get(characters)
  if (cached?.catalog === catalog) return cached.joined
  const joined = Object.fromEntries(Object.entries(characters).map(([name, character]) => [name, characterWithCatalogMeta(catalog, character)]))
  characterMapJoins.set(characters, { catalog, joined })
  return joined
}

/** The dynamic state with its bank and storage worker entries joined. */
export function stateWithCatalogMeta(state: PartyStateDynamic): PartyStateDynamic {
  const catalog = state.merchantCatalog
  if (!catalog) return state
  const cached = stateJoins.get(state)
  if (cached) return cached
  const joined = { ...state, bank: bankWithCatalogMeta(catalog, state.bank) ?? state.bank, bankbois: bankboisWithCatalogMeta(catalog, state.bankbois) }
  stateJoins.set(state, joined)
  return joined
}
