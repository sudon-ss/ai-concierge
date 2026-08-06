import { useEffect } from 'react'

/** リマインダーが画面消灯中に見逃されないよう、有効な間はスマホの自動消灯を防ぐ。
 *  非対応ブラウザ（Safari含む一部）では黙って何もしない（ベストエフォート）。
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    if (!('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) {
            s.release().catch(() => {})
            return
          }
          sentinel = s
        })
        .catch(() => {
          // ユーザー拒否・非対応など。ベストエフォートなので静かに諦める
        })
    }

    acquire()

    // タブがバックグラウンドになるとロックは自動解除されるため、復帰時に再取得する
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
    }
  }, [enabled])
}
