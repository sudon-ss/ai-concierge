import { useEffect, useRef, useState } from 'react'
import { useSettings } from './useSettings'
import { useProfile } from './useProfile'
import { getSession, hasBackend, listEvents } from '../lib/api'
import type { CalendarEvent } from '../types'

const FLASHED_KEY = 'concierge.flashedReminders.v1'

const loadFlashed = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FLASHED_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

const saveFlashed = (set: Set<string>) => {
  try {
    localStorage.setItem(FLASHED_KEY, JSON.stringify([...set]))
  } catch {
    // ignore
  }
}

/** アプリを開いている間、実際の予定時刻に基づいてリマインダー（フラッシュ通知）を自動発火する。
 *  アプリを閉じている間の配信（真のPush通知）はスコープ外（§10-4後続で検討）。
 */
export function useReminders() {
  const { settings } = useSettings()
  const { events: demoEvents } = useProfile()
  const backendMode = hasBackend() && Boolean(getSession())

  const [realEvents, setRealEvents] = useState<CalendarEvent[]>([])
  const [queue, setQueue] = useState<CalendarEvent[]>([])
  const flashedRef = useRef<Set<string>>(loadFlashed())

  // 実データ取得（5分ごとに最新化）
  useEffect(() => {
    if (!backendMode) return
    const load = () => {
      listEvents(2)
        .then((apiEvents) =>
          setRealEvents(
            apiEvents.map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              source: e.source,
              location: e.location,
            })),
          ),
        )
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [backendMode])

  // 通知タイミングのチェック（20秒ごと）
  useEffect(() => {
    if (!settings.notificationEnabled) return

    const check = () => {
      const events = backendMode ? realEvents : demoEvents
      const now = Date.now()
      const due = events.filter((e) => {
        if (flashedRef.current.has(e.id)) return false
        const minutesUntil = (new Date(e.start).getTime() - now) / 60000
        // 直前〜開始5分後までの間に、まだ知らせていなければ対象にする
        return minutesUntil <= settings.reminderMinutes && minutesUntil > -5
      })
      if (due.length > 0) {
        due.forEach((e) => flashedRef.current.add(e.id))
        saveFlashed(flashedRef.current)
        setQueue((prev) => [...prev, ...due])
      }
    }

    check()
    const id = setInterval(check, 20 * 1000)
    return () => clearInterval(id)
  }, [backendMode, realEvents, demoEvents, settings.notificationEnabled, settings.reminderMinutes])

  const current = queue[0] ?? null
  const minutesUntil = current
    ? Math.max(0, Math.round((new Date(current.start).getTime() - Date.now()) / 60000))
    : 0

  const dismiss = () => setQueue((prev) => prev.slice(1))

  return { current, minutesUntil, dismiss }
}
