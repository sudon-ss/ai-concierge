import { useCallback, useEffect, useState } from 'react'
import {
  getPushPublicKey,
  getSession,
  hasBackend,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from '../lib/api'

/** base64url の VAPID 公開鍵を pushManager が要求する Uint8Array に変換する */
function toApplicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // ArrayBuffer を明示して作る（SharedArrayBuffer 由来だと BufferSource として受け付けられない）
  const view = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i)
  return view
}

/** ホーム画面から起動されているか（iOSはこの状態でないとプッシュを受け取れない） */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari は標準プロパティを実装していないため独自プロパティを見る
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export type PushState =
  | 'unsupported'      // ブラウザが対応していない
  | 'needs-install'    // iOSでホーム画面に追加されていない
  | 'denied'           // 通知を拒否済み
  | 'off'              // 未購読
  | 'on'               // 購読済み

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('off')
  const [busy, setBusy] = useState(false)
  const backendMode = hasBackend() && Boolean(getSession())

  const refresh = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iOSでSafariのタブのまま開いている場合もここに入る
      setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported')
      return
    }
    if (isIos() && !isStandalone()) {
      setState('needs-install')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setState(sub ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** 通知を有効にする。iOSでは必ずユーザー操作（タップ）から呼ぶこと */
  const enable = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!backendMode) return { ok: false, message: 'カレンダーを連携してからお試しください' }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return { ok: false, message: '通知が許可されませんでした' }
      }

      const { publicKey, configured } = await getPushPublicKey()
      if (!configured || !publicKey) {
        return { ok: false, message: 'サーバー側の通知設定が未完了です' }
      }

      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(publicKey),
        }))

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, message: '購読情報を取得できませんでした' }
      }
      await subscribePush({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
      setState('on')
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '設定に失敗しました' }
    } finally {
      setBusy(false)
    }
  }, [backendMode])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await unsubscribePush(sub.endpoint).catch(() => {})
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }, [])

  const test = useCallback(async () => {
    const res = await sendTestPush()
    return res.sent > 0
  }, [])

  return { state, busy, enable, disable, test, refresh }
}
