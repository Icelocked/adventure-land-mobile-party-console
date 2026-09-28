import { defineConfig, devices } from '@playwright/test'

/** E2E tests run entirely against a mocked /party-api and /setup backend
 *  (see e2e/fixtures/mockPartyServer.ts) - no live party-console server is
 *  needed or touched, so these are safe to run anywhere (including CI)
 *  and never mutate a real account. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
