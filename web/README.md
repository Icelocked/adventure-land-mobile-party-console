# Party Console Companion: PWA

The React + TypeScript + Vite client, plus the files for its container:

- `src/`: the app.
- `notifier/`: the push notifier and the release check, run next to nginx
  in the container.
- `updater/`: the optional updater service (same image, different command).
- `nginx.conf`, `nginx-locations.conf`: serving the app and forwarding
  `/party-api/*` to party-console, with rate limits and security headers.
- `e2e/`: Playwright tests against a mock party-console.

Installing and updating: see [DEPLOYMENT.md](../DEPLOYMENT.md). Building and
testing: see the [README](../README.md#pwa).
