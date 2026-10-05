// Imported into the generated service worker (vite.config.ts workbox.importScripts).
// Shows pushes from the notifier (web/notifier/server.mjs) and opens the
// matching screen when one is tapped.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Party Console', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Party Console'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === new URL(target).origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
