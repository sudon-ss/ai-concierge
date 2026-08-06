import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'

export interface AppSettings {
  briefingTime: string // "HH:MM" 24h
  reminderMinutes: number
  notificationEnabled: boolean
  briefingEnabled: boolean
  aiMemoJudgeEnabled: boolean
  calendarConnected: {
    google: boolean
    outlook: boolean
  }
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
  calendarConnected: {
    google: false,
    outlook: false,
  },
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
