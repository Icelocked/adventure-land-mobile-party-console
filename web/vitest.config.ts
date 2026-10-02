import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the verbatim ports of party-console's pure logic (F7).
// Kept separate from vite.config.ts so the PWA plugin isn't loaded.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
