// オフライン（通信できない）時に、最後に取得できた予定・タスクを「見るだけ」で表示するための、
// 端末内（localStorage）の保存。サービスワーカーやAPIの通常の動作には一切手を加えない
// （通信できているときの挙動は従来どおり。通信に失敗したときだけ、ここに保存した内容を使う）。
//
// 注意：iPhoneにはバックグラウンドで自動同期する仕組みが無いため、あくまで「最後に開いたときの情報」の表示。
// 他のユーザーの情報が混ざらないよう、保存キーにはユーザーID（セッショントークンのsub）を含める。

const PREFIX = 'concierge.cache.v1.'
const SESSION_KEY = 'concierge.session.v1'
/** これより古い保存は使わない（古すぎる情報を、最新のように見せないため） */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** 期間指定の予定（月ごと）が増え続けないよう、残す件数 */
const MAX_RANGE_ENTRIES = 6

function currentUserId(): string | null {
  try {
    const token = localStorage.getItem(SESSION_KEY)
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

const fullKey = (uid: string, key: string) => `${PREFIX}${uid}.${key}`

export function saveCache(key: string, data: unknown): void {
  const uid = currentUserId()
  if (!uid) return
  try {
    localStorage.setItem(fullKey(uid, key), JSON.stringify({ savedAt: Date.now(), data }))
    if (key.startsWith('range.')) pruneRanges(uid)
  } catch {
    // 容量超過・プライベートブラウズなどで保存できなくても、通常の表示には影響させない
  }
}

export function loadCache<T>(key: string): { savedAt: number; data: T } | null {
  const uid = currentUserId()
  if (!uid) return null
  try {
    const raw = localStorage.getItem(fullKey(uid, key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: number; data: T }
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function pruneRanges(uid: string) {
  const prefix = fullKey(uid, 'range.')
  const entries: { k: string; savedAt: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(prefix)) continue
    try {
      entries.push({ k, savedAt: JSON.parse(localStorage.getItem(k) ?? '{}').savedAt ?? 0 })
    } catch {
      entries.push({ k, savedAt: 0 })
    }
  }
  entries
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(MAX_RANGE_ENTRIES)
    .forEach((e) => localStorage.removeItem(e.k))
}

/** ログアウト（セッション破棄）時に、端末に残る予定・タスクの控えも消す */
export function clearAllCache(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // 何もしない
  }
}

// ---- 「いま古い情報を表示している」状態の共有（バナー用） ----
let staleAt: number | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function markStale(savedAt: number): void {
  if (staleAt !== savedAt) {
    staleAt = savedAt
    notify()
  }
}
export function clearStale(): void {
  if (staleAt !== null) {
    staleAt = null
    notify()
  }
}
export const getStaleAt = () => staleAt
export function subscribeStale(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
