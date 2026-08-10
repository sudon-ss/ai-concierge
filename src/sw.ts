/// <reference lib="webworker" />
// アプリを閉じている間にプッシュ通知を受け取るためのサービスワーカー。
// push イベントを扱うには自前のワーカーが必要なため、vite-plugin-pwa を
// generateSW から injectManifest に切り替えている。
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// 以前の registerType:'autoUpdate' と同じ挙動（新版を即座に適用）を維持する
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  url?: string
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title || 'THE CONCIERGE'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // 同じ予定のお知らせが重なった場合は最新の1件だけ残す
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? '/' },
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // 既に開いているウィンドウがあればそれを前面に出す（二重起動を避ける）
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && target !== '/') {
            await client.navigate(target).catch(() => {})
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
