import { useEffect, useState } from 'react'
import { hasBackend, listCalendars, type CalendarsResponse } from '../lib/api'

/** 連携済みカレンダー一覧（参照/登録先の選択状態込み）の取得。
 *  googleConnected/outlookConnected が変わるたびに再取得する。
 */
export function useCalendarsData(googleConnected: boolean, outlookConnected: boolean) {
  const backendConnected = hasBackend()
  const [calendarsData, setCalendarsData] = useState<CalendarsResponse | null>(null)

  const refreshCalendars = () => {
    if (!backendConnected) return
    listCalendars()
      .then(setCalendarsData)
      .catch(() => setCalendarsData(null))
  }

  useEffect(() => {
    refreshCalendars()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleConnected, outlookConnected])

  return { backendConnected, calendarsData, refreshCalendars }
}
