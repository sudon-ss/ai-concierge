import { useEffect, useState } from 'react'
import {
  dismissCalendarNotice,
  getCalendarNotices,
  getSession,
  hasBackend,
  type CalendarNotices,
} from '../lib/api'

const EMPTY: CalendarNotices = { google: false, outlook: false }

/** カレンダー連携（Google/Outlook）が壊れて再連携が必要な状態かどうか。
 * Chat/Home/Scheduleの各画面から呼ばれ、要再連携のプロバイダがあればバナーで案内する。
 */
export function useConnectionNotices() {
  const backendMode = hasBackend() && Boolean(getSession())
  const [notices, setNotices] = useState<CalendarNotices>(EMPTY)

  const refresh = () => {
    if (!backendMode) return
    getCalendarNotices()
      .then(setNotices)
      .catch(() => {})
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = async (provider: 'google' | 'outlook') => {
    setNotices((prev) => ({ ...prev, [provider]: false }))
    try {
      await dismissCalendarNotice(provider)
    } catch {
      refresh() // 失敗していたら実際の状態に戻す
    }
  }

  return { notices, dismiss }
}
