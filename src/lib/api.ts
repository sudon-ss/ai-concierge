// Phase 1 実データ接続用の薄いAPIクライアント。
// バックエンド（backend/）が起動していない・セッションが無い場合は
// 呼び出し元がフォールバックできるよう null / エラーを返す設計にしている。

import { clearAllCache, clearStale, loadCache, markStale, saveCache } from './offlineCache'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined

const SESSION_KEY = 'concierge.session.v1'

export function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function setSession(token: string): void {
  localStorage.setItem(SESSION_KEY, token)
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  clearAllCache() // ログアウト後に、端末へ予定・タスクの控えを残さない
}

export function hasBackend(): boolean {
  return Boolean(API_BASE)
}

/** ?session=...&connected=google のようなOAuthコールバック結果をURLから拾ってセッションを保存する。
 *  App起動時に一度だけ呼ぶ想定。処理後はURLからクエリを消す。
 */
export function consumeAuthCallback(): { connected?: string; error?: string } {
  const params = new URLSearchParams(window.location.search)
  const session = params.get('session')
  const connected = params.get('connected') ?? undefined
  const error = params.get('error') ?? undefined

  if (session) setSession(session)

  if (session || connected || error) {
    params.delete('session')
    params.delete('connected')
    params.delete('error')
    const rest = params.toString()
    const newUrl = window.location.pathname + (rest ? `?${rest}` : '')
    window.history.replaceState({}, '', newUrl)
  }

  return { connected, error }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL が設定されていません')
  const token = getSession()

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 401) {
    clearSession()
    throw new Error('セッションが切れました。カレンダーを再連携してください')
  }
  // 期限が近いセッションは、サーバーが新しいトークンをヘッダーで返す。差し替えて、
  // 使い続けている間はログインが切れないようにする
  const renewed = res.headers.get('X-Session-Token')
  if (renewed) setSession(renewed)
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

/** 通信自体に失敗した（圏外・機内モード等）、またはサーバーが一時的に応答しない（502/503/504。再起動中など）場合 */
function isOfflineError(e: unknown): boolean {
  if (e instanceof TypeError) return true // fetchのネットワークエラー
  return e instanceof Error && /^API error (502|503|504):/.test(e.message)
}

/** 読み取り専用のAPI用。成功したら結果を端末に保存し、通信に失敗したときだけ最後に取得できた内容を返す
 * （画面には「◯時点の情報を表示しています」のバナーが出る）。401などの通常のエラーでは返さない。 */
async function cachedGet<T>(key: string, path: string, allowStale = true): Promise<T> {
  try {
    const data = await apiFetch<T>(path)
    saveCache(key, data)
    clearStale()
    return data
  } catch (e) {
    if (allowStale && isOfflineError(e)) {
      const cached = loadCache<T>(key)
      if (cached) {
        markStale(cached.savedAt)
        return cached.data
      }
    }
    throw e
  }
}

/** 遷移先（onboarding/settings）に加え、既にログイン中なら「追加連携用」の短命トークン（10分）を
 *  stateへ乗せる。Google/Outlookで登録メールアドレスが違う人は多く、メール一致だけでは同一人物の
 *  統合ができないため、ログイン中に「もう一方のカレンダーも連携する」操作では、メールではなく
 *  今のアカウントへ明示的に紐付ける。stateはURLを往復しログに残るため、30日有効のセッション
 *  トークンは載せない。stateは `"<target>"` または `"<target>|<追加連携用トークン>"`。
 */
async function buildAuthState(redirectTo?: 'onboarding'): Promise<string> {
  const target = redirectTo ?? 'settings'
  if (!getSession()) return target
  try {
    const { token } = await apiFetch<{ token: string }>('/api/auth/link-token')
    return `${target}|${token}`
  } catch {
    // 取得できなくても致命的ではない（従来どおりメールアドレスの一致で解決されるだけ）
    return target
  }
}

/** redirectTo='onboarding' を渡すと、認証後にオンボーディングのカレンダーステップへ戻る */
export async function googleLoginUrl(redirectTo?: 'onboarding'): Promise<string> {
  return `${API_BASE}/api/auth/google/login?state=${encodeURIComponent(await buildAuthState(redirectTo))}`
}

export async function outlookLoginUrl(redirectTo?: 'onboarding'): Promise<string> {
  return `${API_BASE}/api/auth/outlook/login?state=${encodeURIComponent(await buildAuthState(redirectTo))}`
}

export interface ChatApiResponse {
  reply: string
  tool_events: { name: string; input: unknown; result: unknown }[]
}

/** SSEストリームを1行ずつ読み、テキスト差分をonDeltaで即時通知しながら最終結果を返す。
 *  体感速度改善のため、Claudeの生成をトークン単位で表示する。
 */
/** 会話履歴リセット時に、Claudeへ渡す文脈（バックエンド保存分）も一緒に消す */
export function clearChatHistory() {
  return apiFetch<{ ok: boolean }>('/api/chat/history', { method: 'DELETE' })
}

export interface ToolStartInfo {
  name: string
  /** このターン内で同じツールが呼ばれた回数（2以上なら再検索・やり直し） */
  callIndex: number
  iteration: number
  maxIterations: number
}

export async function sendChatMessageStream(
  message: string,
  onDelta: (text: string) => void,
  onToolStart?: (info: ToolStartInfo) => void,
  profile?: 'ceo' | 'director' | 'cfo',
): Promise<ChatApiResponse> {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL が設定されていません')
  const token = getSession()

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, profile }),
  })

  if (res.status === 401) {
    clearSession()
    throw new Error('セッションが切れました。カレンダーを再連携してください')
  }
  if (!res.ok || !res.body) {
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalPayload: ChatApiResponse | null = null

  const handleEvent = (raw: string) => {
    let eventType = 'message'
    let data = ''
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) return
    const parsed = JSON.parse(data) as Record<string, unknown>

    if (eventType === 'delta') {
      onDelta(parsed.text as string)
    } else if (eventType === 'tool_start') {
      onToolStart?.({
        name: parsed.name as string,
        callIndex: (parsed.call_index as number) ?? 1,
        iteration: (parsed.iteration as number) ?? 1,
        maxIterations: (parsed.max_iterations as number) ?? 1,
      })
    } else if (eventType === 'done') {
      finalPayload = parsed as unknown as ChatApiResponse
    } else if (eventType === 'error') {
      throw new Error((parsed.message as string) ?? '不明なエラーが発生しました')
    }
  }

  while (!finalPayload) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sepIndex: number
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      handleEvent(rawEvent)
      if (finalPayload) break
    }
  }
  // 完了イベントを受け取った時点でレスポンスを確定させる。
  // 裏側の後始末（会話ログ保存）を待たずに済むよう、接続を早めに切る。
  void reader.cancel().catch(() => {})

  if (!finalPayload) throw new Error('ストリームが不完全に終了しました')
  return finalPayload
}

export interface ApiTask {
  id: string
  title: string
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  done: boolean
}

export function listTasks(): Promise<ApiTask[]> {
  return cachedGet<ApiTask[]>('tasks', '/api/tasks')
}

export function createTask(input: { title: string; due_date?: string; priority?: string }) {
  return apiFetch<ApiTask>('/api/tasks', { method: 'POST', body: JSON.stringify(input) })
}

export function completeTask(taskId: string) {
  return apiFetch<{ ok: boolean }>(`/api/tasks/${taskId}/done`, { method: 'PATCH' })
}

export interface TaskUpdateInput {
  title?: string
  due_date?: string
  priority?: 'low' | 'medium' | 'high'
  done?: boolean
}

export function updateTaskApi(taskId: string, updates: TaskUpdateInput) {
  return apiFetch<ApiTask>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(updates) })
}

export function deleteTaskApi(taskId: string) {
  return apiFetch<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE' })
}

export interface ApiEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  /** 一覧取得時は重複統合されるため、Google/Outlook 双方にある予定は 'both' になる */
  source: 'google' | 'outlook' | 'both'
  /** 削除時にどのカレンダーへ問い合わせるかの判別用（仮押さえの解除で使う） */
  calendar_id?: string | null
  /** 繰り返し予定（定例会など）のシリーズID */
  series_id?: string | null
  /** 同じ会議が複数カレンダーにある場合の、各コピーの識別情報 */
  copies?: { id: string; calendar_id?: string | null; source: 'google' | 'outlook' }[]
  /** 会議メモ（あれば）。本文は長いため要約だけ。全文は getNote で取得する */
  note?: { id: string; priority: 'normal' | 'high' | 'critical'; flagged: boolean; snippet: string }
}

/** 作成直後の予定。単一カレンダーへの登録結果なので source は必ず片方に定まる */
export interface CreatedEvent extends Omit<ApiEvent, 'source'> {
  source: 'google' | 'outlook'
}

export interface BriefingResponse {
  events: ApiEvent[]
  tasks: ApiTask[]
}

/** カレンダー画面用: デモデータではなく実際に連携済みのカレンダーの予定一覧を取得する */
/** allowStale=false：通信できないときに古い内容を返さない（リマインダーの判定など、最新が必須の用途） */
export function listEvents(days = 30, allowStale = true): Promise<ApiEvent[]> {
  return cachedGet<ApiEvent[]>(`events.${days}`, `/api/events?days=${days}`, allowStale)
}

const pad2 = (n: number) => String(n).padStart(2, '0')
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** 日／週／月表示用: 指定期間（両端の日を含む）の予定を取得する。過去や1か月より先も見られる */
export function listEventsRange(start: Date, end: Date): Promise<ApiEvent[]> {
  const qs = `start=${toDateStr(start)}&end=${toDateStr(end)}`
  return cachedGet<ApiEvent[]>(`range.${toDateStr(start)}_${toDateStr(end)}`, `/api/events/range?${qs}`)
}

// ---- 会議メモ（予定に紐付くメモ）----
export interface ApiNote {
  id: string
  title: string
  start: string
  end?: string | null
  priority: 'normal' | 'high' | 'critical'
  flagged: boolean
  series_key?: string | null
  updated_at?: string
  body: string
}

export interface SaveNoteInput {
  refs: string[]
  title: string
  start: string
  end?: string
  series_key?: string | null
  body: string
  flagged?: boolean
  use_ai?: boolean
}

/** 予定にメモを保存する（既にあれば更新）。本文が空で重要マークも無ければ、メモは削除される */
export function saveNote(input: SaveNoteInput) {
  return apiFetch<ApiNote | { deleted: true }>('/api/notes', { method: 'PUT', body: JSON.stringify(input) })
}

export function getNote(id: string) {
  return apiFetch<ApiNote>(`/api/notes/${id}`)
}

export function deleteNoteApi(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' })
}

/** メモをキーワード・期間（YYYY-MM-DD）で探す。新しい予定のメモから順に返る */
export function searchNotes(params: { q?: string; start?: string; end?: string }) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.start) qs.set('start', params.start)
  if (params.end) qs.set('end', params.end)
  // 検索結果の body は、一覧表示用に要約されている（全文は getNote で取得する）
  return apiFetch<ApiNote[]>(`/api/notes/search?${qs.toString()}`)
}

export function getBriefing(): Promise<BriefingResponse> {
  return cachedGet<BriefingResponse>('briefing', '/api/briefing')
}

export interface CreateEventInput {
  calendar: 'google' | 'outlook'
  title: string
  start: string
  end: string
  location?: string
  memo?: string
}

/** SlotPickerでユーザーが枠を確定した際に、会話を介さず直接カレンダーへ登録する。
 *  登録先が複数選択されている場合は、選んだ全カレンダーに同時登録されるため配列で返る。 */
export function confirmEvent(input: CreateEventInput): Promise<CreatedEvent[]> {
  return apiFetch<CreatedEvent[]>('/api/events', { method: 'POST', body: JSON.stringify(input) })
}

export interface DeleteEventInput {
  calendar: 'google' | 'outlook'
  event_id: string
}

/** チャットの削除確認カード「はい」ボタン、およびSchedule画面の編集モーダルの
 *  「削除」ボタンから、会話を介さず直接カレンダーから削除する。 */
export function deleteEventApi(input: DeleteEventInput): Promise<{ event_id: string; title: string }> {
  return apiFetch<{ event_id: string; title: string }>('/api/events/delete', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface UpdateEventInput {
  calendar: 'google' | 'outlook'
  event_id: string
  title?: string
  start?: string
  end?: string
  location?: string
  memo?: string
  memo_flagged?: boolean
}

/** Schedule画面の編集モーダルから、件名・時刻・場所・メモの変更を直接カレンダーへ反映する。 */
export function updateEventApi(input: UpdateEventInput): Promise<CreatedEvent> {
  return apiFetch<CreatedEvent>('/api/events/update', { method: 'POST', body: JSON.stringify(input) })
}

/** 仮押さえした枠を後から削除するために必要な最小情報 */
export interface TentativeRef {
  calendar: 'google' | 'outlook'
  event_id: string
  calendar_id?: string | null
}

export const toTentativeRef = (ev: CreatedEvent): TentativeRef => ({
  calendar: ev.source,
  event_id: ev.id,
  calendar_id: ev.calendar_id ?? null,
})

/** 候補枠を「[仮]」付き予定として実カレンダーへ押さえる（相手の返答待ちの間の埋まり防止） */
export function holdTentativeSlots(input: {
  calendar: 'google' | 'outlook'
  title: string
  slots: { start: string; end: string }[]
}): Promise<CreatedEvent[]> {
  return apiFetch<CreatedEvent[]>('/api/events/tentative', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** 仮押さえを解除する（予定確定時・キャンセル時の後片付け） */
export function releaseTentativeSlots(items: TentativeRef[]): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/api/events/tentative/release', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

/* ---------- プッシュ通知・サーバー側の通知設定 ---------- */

/** サーバー側に保存する通知設定。配信ジョブがこれを見て送信する */
export interface ServerSettings {
  briefing_enabled: boolean
  briefing_time: string
  notification_enabled: boolean
  reminder_minutes: number
  blocking_enabled: boolean
  blocked_weekdays: string[]
  blocked_start_hour: number
  blocked_end_hour: number
}

export function getServerSettings(): Promise<ServerSettings> {
  return apiFetch<ServerSettings>('/api/settings')
}

export function putServerSettings(patch: Partial<ServerSettings>): Promise<ServerSettings> {
  return apiFetch<ServerSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) })
}

export function getPushPublicKey(): Promise<{ publicKey: string; configured: boolean }> {
  return apiFetch<{ publicKey: string; configured: boolean }>('/api/push/public-key')
}

export function subscribePush(sub: { endpoint: string; p256dh: string; auth: string }) {
  return apiFetch<{ ok: boolean }>('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) })
}

export function unsubscribePush(endpoint: string) {
  return apiFetch<{ ok: boolean }>('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  })
}

export function sendTestPush() {
  return apiFetch<{ sent: number }>('/api/push/test', { method: 'POST' })
}

export interface CalendarOption {
  id: string
  name: string
  primary: boolean
  /** falseの場合、URL購読で取り込んだ他社カレンダー等の読み取り専用カレンダー。登録先には選べない */
  writable: boolean
}

export interface CalendarSelectionState {
  connected: boolean
  calendars: CalendarOption[]
  /** 空き時間チェック対象のカレンダー（最大3件）。空なら primary/既定カレンダーのみ */
  selectedIds: string[]
  /** 新規予定の登録先（最大3件）。空なら primary/既定カレンダーのみ */
  writeIds: string[]
}

export interface CalendarsResponse {
  google: CalendarSelectionState
  outlook: CalendarSelectionState
}

export const MAX_SELECTED_CALENDARS = 3

/** 1つのGoogle/Outlookアカウント内に複数カレンダーがある場合の一覧取得 */
export function listCalendars(): Promise<CalendarsResponse> {
  return apiFetch<CalendarsResponse>('/api/calendars')
}

/** 空き時間チェック対象（最大3件）と新規予定の登録先（最大3件）を設定する */
export function selectCalendars(
  provider: 'google' | 'outlook',
  calendarIds: string[],
  writeCalendarIds: string[],
) {
  return apiFetch<{ ok: boolean; selectedIds: string[]; writeIds: string[] }>(
    `/api/calendars/${provider}/selection`,
    {
      method: 'PUT',
      body: JSON.stringify({ calendar_ids: calendarIds, write_calendar_ids: writeCalendarIds }),
    },
  )
}

/** カレンダー連携を解除する（トークン・紐付けともにサーバー側から削除。セッションは維持） */
export function unlinkCalendar(provider: 'google' | 'outlook') {
  return apiFetch<{ ok: boolean }>(`/api/calendars/${provider}`, { method: 'DELETE' })
}

export interface CalendarNotices {
  google: boolean
  outlook: boolean
  /** 実際にトークンが保存されているか（端末内の「連携中」旗印ではなくサーバーの実態） */
  connected: { google: boolean; outlook: boolean }
}

/** 連携が壊れている（要再連携の）プロバイダをDBのみの軽量な問い合わせで返す。
 * Chat/Home/Schedule画面で都度呼ばれる想定のため、外部カレンダーAPIへはアクセスしない。
 */
export function getCalendarNotices(): Promise<CalendarNotices> {
  return apiFetch<CalendarNotices>('/api/calendars/notices')
}

/** 「このカレンダーはもう使わないので通知不要」という意思表示。再連携すれば自動的に解除される */
export function dismissCalendarNotice(provider: 'google' | 'outlook') {
  return apiFetch<{ ok: boolean }>(`/api/calendars/${provider}/dismiss-notice`, { method: 'POST' })
}
