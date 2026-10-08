import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv } from 'vite'
import { APP_NAVIGATION_ALLOWLIST } from './src/lib/appRoutes.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // party-console sends no Access-Control-Allow-Origin header, so the PWA
  // must reach it same-origin. In production nginx proxies /party-api/; in
  // dev Vite's proxy does, pointed at VITE_DEV_PROXY_TARGET (set in the
  // gitignored web/.env.local).
  const proxyTarget = env.VITE_DEV_PROXY_TARGET

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Party Console Companion',
          short_name: 'Party Console',
          description: 'Companion app for adventureland-party-console - check on your party and act on it from your phone.',
          theme_color: '#0b1916',
          background_color: '#0b1916',
          display: 'standalone',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Only the app shell is cached, and it answers only this app's own
          // pages; API, notifier and other server paths always go to the network.
          navigateFallbackAllowlist: APP_NAVIGATION_ALLOWLIST,
          navigateFallbackDenylist: [/^\/party-api\//, /^\/notify\//],
          runtimeCaching: [],
          // Push and notification-click handlers for web/notifier.
          importScripts: ['push-sw.js'],
        },
      }),
    ],
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Reachable from a phone on the same Tailscale/LAN network.
      host: true,
      proxy: proxyTarget
        ? {
            '/party-api': {
              target: proxyTarget,
              // changeOrigin must stay false (the default): the console
              // checks the Host header against the browser's Origin and
              // rejects mutating commands with "Game origin required" when
              // they differ. nginx.conf keeps Host the same way.
            },
          }
        : undefined,
    },
  }
})
