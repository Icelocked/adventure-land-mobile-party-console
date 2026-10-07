import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

async function setup(page: import('@playwright/test').Page) {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 70, items: [] })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.buyable = [{ id: 'hpot0', name: 'Health Potion', cost: 20 }]
  await server.install(page)
}
const box = async (locator: import('@playwright/test').Locator) => (await locator.boundingBox())!

test('A turned phone or tablet: controls left, gear right; the cart beside the shop list', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await setup(page)
  await page.goto('/characters/Merchy')
  const formation = await box(page.getByRole('region', { name: 'Formation' }))
  const equipment = await box(page.getByRole('region', { name: 'Equipment' }))
  expect(equipment.x).toBeGreaterThan(formation.x + formation.width - 1)
  expect(equipment.y).toBeLessThan(formation.y + 300)

  await page.goto('/merchant/buy')
  const list = await box(page.getByText('Health Potion'))
  const cart = await box(page.getByRole('region', { name: 'Cart' }))
  expect(cart.x).toBeGreaterThan(list.x + list.width)
})

test('A phone held upright keeps one column', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/characters/Merchy')
  const formation = await box(page.getByRole('region', { name: 'Formation' }))
  const equipment = await box(page.getByRole('region', { name: 'Equipment' }))
  expect(Math.abs(equipment.x - formation.x)).toBeLessThan(2)
  expect(equipment.y).toBeGreaterThan(formation.y + formation.height)
})

test('The character switcher stays in view while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/characters/Merchy')
  await page.getByRole('region', { name: 'Combat log' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: /^Ranger1/ })).toBeInViewport()
  await page.getByRole('button', { name: /^Ranger1/ }).click()
  await expect(page).toHaveURL(/\/characters\/Ranger1$/)
})
