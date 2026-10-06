import { useEffect } from 'react'
import { getCalendarNotices, getSession, hasBackend } from '../lib/api'
import { useSettings } from './useSettings'

/** 設定画面などの「連携中」表示は端末内の旗印（localStorage）で決まるため、トークンが
 * 失効して自動削除されても「連携中」のまま残り、再連携の入口（連携する）が出なかった。
 * アプリ起動時にサーバー側の実態（トークンの有無）へ旗印を合わせる。
 */
export function useSyncConnectionFlags() {
  const { updateCalendar } = useSettings()

  useEffect(() => {
    if (!hasBackend() || !getSession()) return
    getCalendarNotices()
      .then((res) => {
        if (!res.connected) return // 旧バージョンのサーバー応答では何もしない
        updateCalendar('google', res.connected.google)
        updateCalendar('outlook', res.connected.outlook)
      })
      .catch(() => {})
  }, [updateCalendar])
}
