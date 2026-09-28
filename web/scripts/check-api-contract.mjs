#!/usr/bin/env node
/**
 * Drift detector: hits a REAL, LIVE party-console server (read-only GETs
 * only - never POSTs, never mutates anything) and checks that its
 * responses still have the shapes this app's models and the e2e mock
 * server (web/e2e/fixtures/mockPartyServer.ts) assume they have.
 *
 * Mocked e2e tests are only as good as the assumptions baked into the
 * mock. This is the check that those assumptions haven't quietly gone
 * stale - it complains loudly the moment a field this app depends on
 * disappears, changes shape, or changes type, rather than letting the
 * mocked test suite stay green while the real app silently breaks.
 *
 * This can only run from a machine that can actually reach the server
 * (e.g. on the same Tailscale network) - GitHub's hosted CI runners
 * cannot, so this is NOT wired into any workflow as a PR gate. It also
 * needs an already-paired browser's session cookie: party-console
 * redirects any unpaired /party-api/* request to a login page instead of
 * answering it (the same browser-pairing gate this project's mobile
 * clients pair against) - grab the "party" cookie's value from your
 * browser's devtools (Application/Storage -> Cookies) after pairing once
 * in a normal browser tab. Run it by hand whenever you want to sanity-
 * check the mock against reality:
 *
 *   node scripts/check-api-contract.mjs http://100.x.x.x:3010 <party-cookie-value>
 */

const baseUrl = process.argv[2]
const cookie = process.argv[3]
if (!baseUrl) {
  console.error('Usage: node scripts/check-api-contract.mjs <server base URL> <party cookie value>')
  console.error('Example: node scripts/check-api-contract.mjs http://100.125.193.9:3010 abc123...')
  console.error('(get the cookie value from your browser devtools after pairing once normally)')
  process.exit(2)
}

const failures = []
const checked = []

function check(label, condition) {
  checked.push(label)
  if (!condition) failures.push(label)
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'GET', headers: cookie ? { Cookie: `party=${cookie}` } : {} })
  if (!response.ok) throw new Error(`GET ${path} -> HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`GET ${path} -> got ${contentType || 'an unknown content type'}, not JSON (likely redirected to /setup - pass a valid pairing cookie as the 2nd argument)`)
  }
  return response.json()
}

async function main() {
  console.log(`Checking ${baseUrl} ...`)

  const state = await getJson('/party-api/state')

  check('state.roster is an array', Array.isArray(state.roster))
  for (const member of state.roster ?? []) {
    check(`roster member "${member?.name}" has name/ctype/level`, typeof member?.name === 'string' && typeof member?.ctype === 'string' && typeof member?.level === 'number')
  }

  check('state.bank is object or null', state.bank == null || isObject(state.bank))
  if (isObject(state.bank)) {
    check('state.bank.gold is a number', typeof state.bank.gold === 'number')
    check('state.bank.packs is an object', isObject(state.bank.packs))
    for (const [pack, entries] of Object.entries(state.bank?.packs ?? {})) {
      check(`bank pack "${pack}" is an array`, Array.isArray(entries))
      for (const entry of entries ?? []) {
        if (entry == null) continue
        check(`bank entry in "${pack}" has slot (number) + item.name (string)`, typeof entry.slot === 'number' && typeof entry.item?.name === 'string')
      }
    }
  }

  check('state.merchantCatalog is object or null', state.merchantCatalog == null || isObject(state.merchantCatalog))
  if (isObject(state.merchantCatalog)) {
    check('merchantCatalog.allItems is an array', Array.isArray(state.merchantCatalog.allItems))
    const sample = state.merchantCatalog.allItems?.[0]
    if (sample) check('a catalog item has id + name (string)', typeof sample.id === 'string' && typeof sample.name === 'string')
    check('merchantCatalog.craftable is an array', Array.isArray(state.merchantCatalog.craftable))
    const recipe = state.merchantCatalog.craftable?.[0]
    if (recipe) {
      check('a craft recipe has id/name/cost/materials(array)', typeof recipe.id === 'string' && typeof recipe.name === 'string' && typeof recipe.cost === 'number' && Array.isArray(recipe.materials))
      const material = recipe.materials?.[0]
      if (material) check('a craft material has id/name/quantity/level', typeof material.id === 'string' && typeof material.name === 'string' && typeof material.quantity === 'number' && typeof material.level === 'number')
    }
    check('merchantCatalog.exchangeable is an array', Array.isArray(state.merchantCatalog.exchangeable))
    const exchange = state.merchantCatalog.exchangeable?.[0]
    if (exchange) check('an exchange entry has key/id/level/required(number)', typeof exchange.key === 'string' && typeof exchange.id === 'string' && typeof exchange.level === 'number' && typeof exchange.required === 'number')
  }

  check('state.autoNpcSales is an object', isObject(state.autoNpcSales))
  for (const [key, rule] of Object.entries(state.autoNpcSales ?? {})) {
    check(`autoNpcSales["${key}"].item.name is a string`, typeof rule?.item?.name === 'string')
  }

  const mail = await getJson('/party-api/mail')
  check('mail.messages is an array', Array.isArray(mail.messages))
  check('mail.count is a number', typeof mail.count === 'number')
  const message = mail.messages?.[0]
  if (message) check('a mail message has an id (string)', typeof message.id === 'string')

  const escape = await getJson('/party-api/escape')
  check('escape response has an "escape" key (object or null)', 'escape' in escape)

  console.log(`\n${checked.length} checks run, ${failures.length} failed.`)
  if (failures.length) {
    console.log('\nFAILED - the mock or this app\'s assumptions have drifted from the real server:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log('All good - the mock still matches what the real server actually returns.')
}

main().catch((error) => {
  console.error('Contract check could not complete:', error.message)
  process.exit(2)
})
