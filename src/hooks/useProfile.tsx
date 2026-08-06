import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProfileId } from '../types/profile'
import { DEFAULT_PROFILE_ID, PROFILES } from '../types/profile'
import { getProfileEvents, getProfileTasks } from '../data/profiles'
import type { CalendarEvent, Task } from '../types'
import { getStorageItem, removeStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'

interface ProfileContextValue {
  profileId: ProfileId
  setProfileId: (id: ProfileId) => void
  profile: typeof PROFILES[ProfileId]
  events: CalendarEvent[]
  tasks: Task[]
  addEvent: (event: CalendarEvent) => void
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void
  deleteEvent: (id: string) => void
  resetEvents: () => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  resetTasks: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

const isProfileId = (v: unknown): v is ProfileId =>
  v === 'ceo' || v === 'director' || v === 'cfo'

const loadInitialProfile = (): ProfileId => {
  const stored = getStorageItem<string>(STORAGE_KEYS.profileId, DEFAULT_PROFILE_ID)
  return isProfileId(stored) ? stored : DEFAULT_PROFILE_ID
}

const loadEvents = (profileId: ProfileId): CalendarEvent[] => {
  const stored = getStorageItem<CalendarEvent[] | null>(STORAGE_KEYS.events(profileId), null)
  return stored ?? getProfileEvents(profileId)
}

const loadTasks = (profileId: ProfileId): Task[] => {
  // 既存の overrides（done のみ）と新方式（events と同様の全タスク保存）の両方をサポート
  const fullStored = getStorageItem<Task[] | null>(STORAGE_KEYS.taskAdditions(profileId), null)
  if (fullStored) return fullStored
  // 初回 or 旧データ：profile から取得
  const base = getProfileTasks(profileId)
  const overrides = getStorageItem<Record<string, { done: boolean }>>(
    STORAGE_KEYS.taskOverrides(profileId),
    {},
  )
  return base.map((t) => ({ ...t, done: overrides[t.id]?.done ?? t.done }))
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profileId, setProfileIdState] = useState<ProfileId>(loadInitialProfile)
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadEvents(profileId))
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(profileId))

  // プロファイル選択を永続化
  useEffect(() => {
    setStorageItem(STORAGE_KEYS.profileId, profileId)
  }, [profileId])

  // プロファイル切替で events / tasks を入れ替え
  const prevProfileIdRef = useRef(profileId)
  useEffect(() => {
    if (prevProfileIdRef.current !== profileId) {
      prevProfileIdRef.current = profileId
      setEvents(loadEvents(profileId))
      setTasks(loadTasks(profileId))
    }
  }, [profileId])

  // events を永続化
  useEffect(() => {
    setStorageItem(STORAGE_KEYS.events(profileId), events)
  }, [profileId, events])

  // tasks を永続化（フル保存方式）
  useEffect(() => {
    setStorageItem(STORAGE_KEYS.taskAdditions(profileId), tasks)
  }, [profileId, tasks])

  const addEvent = useCallback((event: CalendarEvent) => {
    setEvents((prev) => {
      const filtered = prev.filter((e) => e.id !== event.id)
      const next = [...filtered, event]
      next.sort((a, b) => a.start.localeCompare(b.start))
      return next
    })
  }, [])

  const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
    setEvents((prev) =>
      prev
        .map((e) => (e.id === id ? { ...e, ...updates } : e))
        .sort((a, b) => a.start.localeCompare(b.start)),
    )
  }, [])

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const resetEvents = useCallback(() => {
    removeStorageItem(STORAGE_KEYS.events(profileId))
    setEvents(getProfileEvents(profileId))
  }, [profileId])

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => {
      const filtered = prev.filter((t) => t.id !== task.id)
      return [...filtered, task]
    })
  }, [])

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }, [])

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const resetTasks = useCallback(() => {
    removeStorageItem(STORAGE_KEYS.taskAdditions(profileId))
    removeStorageItem(STORAGE_KEYS.taskOverrides(profileId))
    setTasks(getProfileTasks(profileId))
  }, [profileId])

  const value = useMemo<ProfileContextValue>(
    () => ({
      profileId,
      setProfileId: setProfileIdState,
      profile: PROFILES[profileId],
      events,
      tasks,
      addEvent,
      updateEvent,
      deleteEvent,
      resetEvents,
      addTask,
      updateTask,
      deleteTask,
      resetTasks,
    }),
    [
      profileId,
      events,
      tasks,
      addEvent,
      updateEvent,
      deleteEvent,
      resetEvents,
      addTask,
      updateTask,
      deleteTask,
      resetTasks,
    ],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within <ProfileProvider>')
  return ctx
}
