import { defineConfig, devices } from '@playwright/test'

// The suite builds into dist-e2e and serves only that build. `npm run build` rewrites dist/, and
// a test whose page loads while the hashed assets are replaced fails, as bank.spec does when dist/
// is rebuilt beside a run. The pwa-owners worktrees serve their own builds on 4173, so a run never
// reuses a server it did not start, and E2E_PORT gives each worktree its own port.
const port = Number(process.env.E2E_PORT) || 4173

/** E2E tests run against a mocked /party-api and /setup backend
 *  (e2e/fixtures/mockPartyServer.ts), never a real party-console. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx tsc -b && npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
