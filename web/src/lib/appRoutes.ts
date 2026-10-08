// The pages this app owns. The service worker answers navigations to these with the cached app shell;
// every other path on the same address (party-console's /setup and /console-update, or anything else
// the server hosts there) goes to the network. Keep in sync with the routes in App.tsx
// (appRoutes.test.ts checks it).
export const APP_SECTIONS = [
  'anniversary', 'bank', 'bestiary', 'catalog', 'characters', 'logs', 'mail', 'market',
  'merchant', 'routines', 'settings', 'skills', 'stand', 'wtb',
]

export const APP_NAVIGATION_ALLOWLIST: RegExp[] = [
  /^\/(\?.*)?$/,
  new RegExp(`^/(${APP_SECTIONS.join('|')})(/|\\?|$)`),
]
