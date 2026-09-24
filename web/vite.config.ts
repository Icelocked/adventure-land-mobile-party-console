import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // party-console's coordinator sends no Access-Control-Allow-Origin
  // header at all (confirmed against a live server) - it was only ever
  // built to be served same-origin from itself, so ANY cross-origin
  // request from this PWA (a different origin/port) is blocked by CORS,
  // not just the http-vs-https mixed-content issue. The fix is the same
  // one party-console's own dashboard already benefits from: never be
  // cross-origin in the first place. In prod this is nginx's job (see
  // web/Dockerfile) proxying /party-api/* to the coordinator container;
  // in dev, Vite's own proxy does the same thing, pointed at
  // VITE_DEV_PROXY_TARGET (set in web/.env.local, gitignored - each
  // developer points this at their own test server).
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
          // Party data must always be fresh - only the app shell (JS/CSS/
          // icons) is cache-first; API calls to the user's own
          // party-console server are never intercepted by the service
          // worker at all.
          navigateFallbackDenylist: [/^\/party-api\//],
          runtimeCaching: [],
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
      // Reachable from a phone on the same Tailscale/LAN network during
      // dev, not just localhost - matches how this whole project is
      // actually used.
      host: true,
      proxy: proxyTarget
        ? {
            '/party-api': {
              target: proxyTarget,
              changeOrigin: true,
              // /dashboard-stream is a long-lived SSE response - Vite's
              // proxy (http-proxy under the hood) streams it through
              // fine by default, nothing extra needed here.
            },
          }
        : undefined,
    },
  }
})
