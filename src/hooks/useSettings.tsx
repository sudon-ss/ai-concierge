import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'
import { getSession, hasBackend, putServerSettings } from '../lib/api'

export const WEEKDAY_OPTIONS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type WeekdayCode = (typeof WEEKDAY_OPTIONS)[number]
export const WEEKDAY_LABEL: Record<WeekdayCode, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日',
}

export interface AppSettings {
  briefingTime: string // "HH:MM" 24h
  reminderMinutes: number
  notificationEnabled: boolean
  briefingEnabled: boolean
  aiMemoJudgeEnabled: boolean
  /** 会議が終わったあと、メモを残すかをPushで尋ねる（既定オフ） */
  meetingNotePromptEnabled: boolean
  calendarConnected: {
    google: boolean
    outlook: boolean
  }
  // 業務時間外ブロック: 空き時間提案から既定で除外する曜日・時間帯（接待等は別途AIが考慮）
  blockingEnabled: boolean
  blockedWeekdays: WeekdayCode[]
  blockedStartHour: number
  blockedEndHour: number
}

export const BRIEFING_TIME_OPTIONS = [
  '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00',
] as const

export const formatBriefingTime = (v: string): string => v.replace(/^0/, '')

export const DEFAULT_SETTINGS: AppSettings = {
  briefingTime: '07:00',
  reminderMinutes: 5,
  notificationEnabled: true,
  briefingEnabled: true,
  aiMemoJudgeEnabled: true,
  meetingNotePromptEnabled: false,
  calendarConnected: {
    google: false,
    outlook: false,
  },
  blockingEnabled: true,
  blockedWeekdays: ['sat', 'sun'],
  blockedStartHour: 22,
  blockedEndHour: 8,
}

interface SettingsContextValue {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  updateCalendar: (provider: 'google' | 'outlook', connected: boolean) => void
  resetSettings: () => void
  onboarded: boolean
  setOnboarded: (value: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const loadSettings = (): AppSettings => {
  const stored = getStorageItem<Partial<AppSettings> | null>(STORAGE_KEYS.settings, null)
  if (!stored) return DEFAULT_SETTINGS
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    calendarConnected: {
      ...DEFAULT_SETTINGS.calendarConnected,
      ...stored.calendarConnected,
    },
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [onboarded, setOnboardedState] = useState<boolean>(() =>
    getStorageItem<boolean>(STORAGE_KEYS.onboarded, false),
  )

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.settings, settings)
  }, [settings])

  // 通知まわりの設定はサーバー側の配信ジョブも参照するため、端末だけでなくDBにも反映する。
  // 初回マウント時は送らない（サーバーの値を端末の初期値で上書きしないため）。
  const syncedOnce = useRef(false)
  useEffect(() => {
    if (!hasBackend() || !getSession()) return
    if (!syncedOnce.current) {
      syncedOnce.current = true
      return
    }
    putServerSettings({
      briefing_enabled: settings.briefingEnabled,
      briefing_time: settings.briefingTime,
      notification_enabled: settings.notificationEnabled,
      reminder_minutes: settings.reminderMinutes,
      blocking_enabled: settings.blockingEnabled,
      blocked_weekdays: settings.blockedWeekdays,
      blocked_start_hour: settings.blockedStartHour,
      blocked_end_hour: settings.blockedEndHour,
      meeting_note_prompt_enabled: settings.meetingNotePromptEnabled,
    }).catch(() => {})
  }, [
    settings.briefingEnabled,
    settings.briefingTime,
    settings.notificationEnabled,
    settings.reminderMinutes,
    settings.blockingEnabled,
    settings.blockedWeekdays,
    settings.blockedStartHour,
    settings.blockedEndHour,
    settings.meetingNotePromptEnabled,
  ])

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.onboarded, onboarded)
  }, [onboarded])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      calendarConnected: {
        ...prev.calendarConnected,
        ...(patch.calendarConnected ?? {}),
      },
    }))
  }, [])

  const updateCalendar = useCallback((provider: 'google' | 'outlook', connected: boolean) => {
    setSettings((prev) => ({
      ...prev,
      calendarConnected: {
        ...prev.calendarConnected,
        [provider]: connected,
      },
    }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSettings,
      updateCalendar,
      resetSettings,
      onboarded,
      setOnboarded: setOnboardedState,
    }),
    [settings, updateSettings, updateCalendar, resetSettings, onboarded],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within <SettingsProvider>')
  return ctx
}
