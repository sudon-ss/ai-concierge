export function getStorageItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // QuotaExceeded など。永続化できなくても致命的ではないので無視
  }
}

export function removeStorageItem(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = {
  profileId: 'concierge.profileId.v1',
  messages: (profileId: string) => `concierge.messages.v1.${profileId}`,
  taskOverrides: (profileId: string) => `concierge.taskOverrides.v1.${profileId}`,
  eventFlags: (profileId: string) => `concierge.eventFlags.v1.${profileId}`,
  events: (profileId: string) => `concierge.events.v1.${profileId}`,
  taskAdditions: (profileId: string) => `concierge.taskAdditions.v1.${profileId}`,
  taskDeletions: (profileId: string) => `concierge.taskDeletions.v1.${profileId}`,
  taskEdits: (profileId: string) => `concierge.taskEdits.v1.${profileId}`,
  settings: 'concierge.settings.v1',
  onboarded: 'concierge.onboarded.v1',
} as const
