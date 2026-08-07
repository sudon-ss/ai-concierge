// Phase 1 実データ接続用の薄いAPIクライアント。
// バックエンド（backend/）が起動していない・セッションが無い場合は
// 呼び出し元がフォールバックできるよう null / エラーを返す設計にしている。

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
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export function googleLoginUrl(): string {
  return `${API_BASE}/api/auth/google/login`
}

export function outlookLoginUrl(): string {
  return `${API_BASE}/api/auth/outlook/login`
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

export async function sendChatMessageStream(
  message: string,
  onDelta: (text: string) => void,
  onToolStart?: (toolName: string) => void,
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
      onToolStart?.(parsed.name as string)
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
  return apiFetch<ApiTask[]>('/api/tasks')
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
  source: 'google' | 'outlook'
}

export interface BriefingResponse {
  events: ApiEvent[]
  tasks: ApiTask[]
}

/** カレンダー画面用: デモデータではなく実際に連携済みのカレンダーの予定一覧を取得する */
export function listEvents(days = 30): Promise<ApiEvent[]> {
  return apiFetch<ApiEvent[]>(`/api/events?days=${days}`)
}

export function getBriefing(): Promise<BriefingResponse> {
  return apiFetch<BriefingResponse>('/api/briefing')
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
export function confirmEvent(input: CreateEventInput): Promise<ApiEvent[]> {
  return apiFetch<ApiEvent[]>('/api/events', { method: 'POST', body: JSON.stringify(input) })
}

export interface CalendarOption {
  id: string
  name: string
  primary: boolean
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
