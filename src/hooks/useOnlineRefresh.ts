import { useEffect, useRef } from 'react'

/** 通信が戻ったとき（端末の「online」通知）に、画面の情報を取り直す。
 * 通信できない間に表示していた古い控えが、復帰後もそのまま残らないようにする。 */
export function useOnlineRefresh(refresh: () => void, enabled = true) {
  const ref = useRef(refresh)
  ref.current = refresh
  useEffect(() => {
    if (!enabled) return
    const handler = () => ref.current()
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [enabled])
}
