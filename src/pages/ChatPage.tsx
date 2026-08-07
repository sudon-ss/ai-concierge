import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, RotateCcw } from 'lucide-react'
import { MessageBubble } from '../components/MessageBubble'
import { InputBar } from '../components/InputBar'
import { FlashOverlay } from '../components/FlashOverlay'
import { useProfile } from '../hooks/useProfile'
import { useSettings } from '../hooks/useSettings'
import type { CalendarEvent, ChatMessage, ExtractedDraft, FreeSlot, MessageContent, Task } from '../types'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../lib/storage'
import { detectScheduleIntent, extractIntent, type ExtractedIntent } from '../lib/extract'
import {
  clearChatHistory,
  confirmEvent,
  getBriefing,
  getSession,
  hasBackend,
  sendChatMessageStream,
  type ApiEvent,
  type ApiTask,
  type ChatApiResponse,
} from '../lib/api'

const uid = () => Math.random().toString(36).slice(2, 9)

const TOOL_STATUS_LABELS: Record<string, string> = {
  get_free_slots: '🔍 空き時間を確認しています…',
  create_event: '📅 カレンダーに登録しています…',
  reschedule_event: '🔄 ご予定を変更しています…',
  create_task: '📝 タスクを登録しています…',
  judge_memo_importance: '📝 メモを確認しています…',
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sameLocalDate = (iso: string, dateStr: string) =>
  localDateStr(new Date(iso)) === dateStr

const apiEventToCalendarEvent = (e: ApiEvent): CalendarEvent => ({
  id: e.id,
  title: e.title,
  start: e.start,
  end: e.end,
  source: e.source,
  location: e.location,
})

const apiTaskToTask = (t: ApiTask): Task => ({
  id: t.id,
  title: t.title,
  dueDate: t.due_date ?? '',
  priority: t.priority,
  done: t.done,
})

const buildInitialMessages = (
  events: CalendarEvent[],
  tasks: Task[],
  greeting: string,
): ChatMessage[] => {
  const todayStr = localDateStr(new Date())
  const briefingTime = new Date()
  briefingTime.setHours(7, 0, 0, 0)
  return [
    {
      id: 'briefing-' + todayStr,
      role: 'assistant',
      createdAt: briefingTime.toISOString(),
      content: {
        type: 'briefing',
        date: todayStr,
        events: events.filter((e) => sameLocalDate(e.start, todayStr)),
        tasks: tasks.filter((t) => {
          const diff = (new Date(t.dueDate).getTime() - new Date(todayStr).getTime()) / 86400000
          return diff <= 3
        }),
      },
    },
    {
      id: 'greeting-' + todayStr,
      role: 'assistant',
      createdAt: new Date().toISOString(),
      content: { type: 'text', text: greeting },
    },
  ]
}

const loadMessages = (profileId: string, fallback: ChatMessage[]): ChatMessage[] => {
  const stored = getStorageItem<ChatMessage[] | null>(STORAGE_KEYS.messages(profileId), null)
  return stored && stored.length > 0 ? stored : fallback
}

const labelFromDates = (start: Date, end: Date): string => {
  const day = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
  const t = (d: Date) =>
    d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${t(start)}–${t(end)}`
}

const buildSlots = (intent: ExtractedIntent): FreeSlot[] => {
  const { targetDate, targetHour, durationMinutes } = intent

  let baseDate: Date
  if (targetDate) {
    const [y, m, d] = targetDate.split('-').map(Number)
    baseDate = new Date(y, m - 1, d)
  } else {
    baseDate = new Date()
    baseDate.setDate(baseDate.getDate() + 3)
  }

  let hours: number[]
  if (targetHour !== undefined) {
    // 指定時刻を中心に前後を提示。範囲外（0-23超）は除外
    const candidates = [targetHour, targetHour + 1, targetHour - 1].filter(
      (h) => h >= 0 && h < 24,
    )
    hours = candidates.slice(0, 3)
  } else {
    hours = [13, 15, 16]
  }

  return hours.map((h) => {
    const start = new Date(baseDate)
    start.setHours(h, 0, 0, 0)
    const end = new Date(start.getTime() + durationMinutes * 60000)
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label: labelFromDates(start, end),
    }
  })
}

const formatScheduleQuestion = (intent: ExtractedIntent): string => {
  const meta: string[] = []
  if (intent.targetDate) {
    const [y, m, d] = intent.targetDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    meta.push(
      date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
    )
  }
  if (intent.targetHour !== undefined) {
    meta.push(`${pad(intent.targetHour)}:00ごろ`)
  }
  if (intent.durationMinutes !== 60) {
    const h = Math.floor(intent.durationMinutes / 60)
    const m = intent.durationMinutes % 60
    const dur = h > 0 ? `${h}h${m ? m + 'm' : ''}` : `${m}m`
    meta.push(dur)
  }
  if (intent.location) {
    meta.push(`@${intent.location}`)
  }
  const tag = meta.length > 0 ? `（${meta.join(' / ')}）` : ''
  return `「${intent.title}」${tag} にてご用意いたします。下記候補からお選びくださいませ。`
}

const detectIntentKind = (text: string): 'slots' | 'reschedule' | 'schedule' | 'chat' => {
  if (/後ろ倒し|前倒し|リスケ|変更|延期|早める|遅らせる/.test(text)) return 'reschedule'
  if (/空いて|空き|候補|提案/.test(text)) return 'slots'
  if (detectScheduleIntent(text)) return 'schedule'
  return 'chat'
}

export function ChatPage() {
  const { profileId, profile, events, tasks, addEvent, updateEvent, deleteEvent } = useProfile()
  const { settings } = useSettings()
  const backendMode = hasBackend() && Boolean(getSession())

  const initial = useMemo(
    // 実バックエンド接続時はPhase 0のデモ予定を出さず、読み込み完了まで空のブリーフィングにする
    // （読み込み後、下のuseEffectで実データに差し替える）
    () => buildInitialMessages(backendMode ? [] : events, backendMode ? [] : tasks, profile.greeting),
    // events/tasksが変わるたびに briefing 再生成すると煩いので profileId と greeting だけに依存
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backendMode, profileId, profile.greeting],
  )

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(profileId, initial))
  const [showFlash, setShowFlash] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 実バックエンド接続時: 朝のブリーフィングを実際のカレンダー/タスクで差し替える
  useEffect(() => {
    if (!backendMode) return
    const todayStr = localDateStr(new Date())
    getBriefing()
      .then((res) => {
        const realEvents = res.events.filter((e) => sameLocalDate(e.start, todayStr)).map(apiEventToCalendarEvent)
        const realTasks = res.tasks.map(apiTaskToTask)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === 'briefing-' + todayStr
              ? { ...m, content: { type: 'briefing', date: todayStr, events: realEvents, tasks: realTasks } }
              : m,
          ),
        )
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode])

  const prevProfileIdRef = useRef(profileId)
  useEffect(() => {
    if (prevProfileIdRef.current !== profileId) {
      prevProfileIdRef.current = profileId
      setMessages(loadMessages(profileId, initial))
    }
  }, [profileId, initial])

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.messages(profileId), messages)
  }, [profileId, messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // 初回マウント時：履歴がある場合は最下部へ即移動（瞬時、アニメなし）
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // HomePage から渡された音声テキストを初回マウント時に送信
  useEffect(() => {
    const pending = sessionStorage.getItem('concierge.pendingMessage')
    if (pending) {
      sessionStorage.removeItem('concierge.pendingMessage')
      // 直接 sendUser を呼ぶには下で定義した後でないとならないので setTimeout で遅延
      setTimeout(() => sendUser(pending), 200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const append = (msg: ChatMessage) => setMessages((m) => [...m, msg])

  /** 実バックエンドからの応答に空き枠・作成済みイベントが含まれていれば、
   *  Phase 0と同じSlotPicker/承認カードUIの内容を組み立てる。それ以外はテキスト。 */
  const buildBackendReplyContent = (res: ChatApiResponse, userText: string): MessageContent => {
    // 期間を広げて複数回get_free_slotsを呼ぶことがあるため、全呼び出し分をまとめる
    const freeSlotsEvents = res.tool_events.filter(
      (e) =>
        e.name === 'get_free_slots' &&
        e.result &&
        typeof e.result === 'object' &&
        Array.isArray((e.result as { slots?: unknown }).slots),
    )
    const slots = freeSlotsEvents.flatMap((e) => (e.result as { slots: FreeSlot[] }).slots)

    if (slots.length > 0) {
      const intent = extractIntent(userText)
      // 「空いてる時間ある？」のような質問文がそのままタイトルになってしまうのを防ぐ
      const isLikelyQuestion = /[？?]/.test(intent.title) || intent.title.length > 20
      const draftTitle = isLikelyQuestion ? '新しいご予定' : intent.title
      return {
        type: 'slots',
        question: res.reply,
        slots,
        draft: {
          title: draftTitle,
          location: intent.location,
          durationMinutes: intent.durationMinutes,
          targetDate: intent.targetDate,
          targetHour: intent.targetHour,
        },
      }
    }

    const createdEvent = res.tool_events.find(
      (e) => e.name === 'create_event' && Array.isArray(e.result) && e.result.length > 0,
    )
    if (createdEvent) {
      const [result] = createdEvent.result as {
        id: string
        title: string
        start: string
        end: string
        location?: string
        source: 'google' | 'outlook'
      }[]
      return {
        type: 'approval',
        selectedSlot: { start: result.start, end: result.end, label: '' },
        title: result.title,
        location: result.location,
        eventId: result.id,
        status: 'done',
        calendar: result.source,
      }
    }

    return { type: 'text', text: res.reply }
  }

  const resetConversation = () => {
    if (window.confirm('会話履歴をリセットしてもよろしいでしょうか？')) {
      setMessages(initial)
      // 画面表示だけでなく、Claudeに渡されるバックエンド側の文脈もあわせて消す
      if (hasBackend() && getSession()) {
        clearChatHistory().catch(() => {})
      }
    }
  }

  const sendUser = (text: string) => {
    append({
      id: uid(),
      role: 'user',
      createdAt: new Date().toISOString(),
      content: { type: 'text', text },
    })

    // 実バックエンド（VITE_API_BASE_URL設定済み）にログイン済みなら本物のClaude Tool Useへ。
    // 未設定・未ログイン時はPhase 0からのローカル辞書ベースのデモ応答にフォールバックする。
    if (hasBackend() && getSession()) {
      const placeholderId = uid()
      append({
        id: placeholderId,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        content: { type: 'text', text: '' },
      })

      const updatePlaceholder = (content: MessageContent) =>
        setMessages((prev) => prev.map((m) => (m.id === placeholderId ? { ...m, content } : m)))

      // 道具（カレンダー確認など）の実行中は無音になりがちなので、状態表示で埋める。
      // 次のdeltaが来た時点でこの状態表示は取り除く。
      let statusSuffix = ''

      sendChatMessageStream(
        text,
        (delta) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== placeholderId || m.content.type !== 'text') return m
              const base =
                statusSuffix && m.content.text.endsWith(statusSuffix)
                  ? m.content.text.slice(0, -statusSuffix.length)
                  : m.content.text
              statusSuffix = ''
              return { ...m, content: { type: 'text', text: base + delta } }
            }),
          )
        },
        (toolName) => {
          const label = TOOL_STATUS_LABELS[toolName] ?? '処理しています…'
          statusSuffix = `\n\n${label}`
          const suffix = statusSuffix
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId && m.content.type === 'text'
                ? { ...m, content: { type: 'text', text: m.content.text + suffix } }
                : m,
            ),
          )
        },
        profileId,
      )
        .then((res) => updatePlaceholder(buildBackendReplyContent(res, text)))
        .catch(() => {
          updatePlaceholder({
            type: 'text',
            text: '恐れ入ります、通信エラーが発生いたしました。もう一度お試しくださいませ。',
          })
        })
      return
    }

    setTimeout(() => respond(text), 600)
  }

  const respond = (text: string) => {
    const kind = detectIntentKind(text)

    if (kind === 'reschedule') {
      const now = new Date().toISOString()
      const target = events.find((e) => e.start > now) ?? events[0]
      if (!target) {
        append({
          id: uid(),
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: {
            type: 'text',
            text: '恐れ入りますが、現在変更可能なご予定がございません。先にご予定をご登録くださいませ。',
          },
        })
        return
      }
      const shiftMatch = text.match(/(\d+)\s*(時間|分)/)
      const shiftMinutes = shiftMatch
        ? shiftMatch[2] === '時間'
          ? parseInt(shiftMatch[1]) * 60
          : parseInt(shiftMatch[1])
        : 30
      const direction = /前倒し|早める/.test(text) ? -1 : 1
      const newStart = new Date(
        new Date(target.start).getTime() + shiftMinutes * direction * 60000,
      )
      const newEnd = new Date(
        new Date(target.end).getTime() + shiftMinutes * direction * 60000,
      )

      updateEvent(target.id, { start: newStart.toISOString(), end: newEnd.toISOString() })

      append({
        id: uid(),
        role: 'assistant',
        createdAt: new Date().toISOString(),
        content: {
          type: 'reschedule',
          eventId: target.id,
          eventTitle: target.title,
          oldStart: target.start,
          newStart: newStart.toISOString(),
          status: 'done',
        },
      })
      return
    }

    if (kind === 'slots' || kind === 'schedule') {
      const intent = extractIntent(text)
      const draft: ExtractedDraft = {
        title: intent.title,
        location: intent.location,
        durationMinutes: intent.durationMinutes,
        targetDate: intent.targetDate,
        targetHour: intent.targetHour,
      }
      const question =
        kind === 'slots' && !intent.targetDate && !intent.targetHour
          ? '空いておりますお時間を3つご提案いたします。お選びくださいませ。'
          : formatScheduleQuestion(intent)
      append({
        id: uid(),
        role: 'assistant',
        createdAt: new Date().toISOString(),
        content: {
          type: 'slots',
          question,
          slots: buildSlots(intent),
          draft,
        },
      })
      return
    }

    append({
      id: uid(),
      role: 'assistant',
      createdAt: new Date().toISOString(),
      content: {
        type: 'text',
        text: '承知いたしました。「明日15時から1時間、田中様とMTG、場所はZoom」のようにお申し付けくださいませ。',
      },
    })
  }

  const onConfirmSlot = (
    id: string,
    slot: FreeSlot,
    calendar: CalendarEvent['source'],
    location: string,
  ) => {
    if (hasBackend() && getSession()) {
      const msg = messages.find((m) => m.id === id)
      const title =
        (msg?.content.type === 'slots' && msg.content.draft?.title?.trim()) || '新しいご予定'
      const targets: ('google' | 'outlook')[] = calendar === 'both' ? ['google', 'outlook'] : [calendar]

      Promise.allSettled(
        targets.map((cal) =>
          confirmEvent({ calendar: cal, title, start: slot.start, end: slot.end, location: location || undefined }),
        ),
      ).then((results) => {
        // 各プロバイダの登録が複数カレンダー同時登録（配列）で返るため、まとめて1段フラット化する
        const succeeded = results
          .filter(
            (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof confirmEvent>>> => r.status === 'fulfilled',
          )
          .flatMap((r) => r.value)
        const failedCalendars = targets.filter((_, i) => results[i].status === 'rejected')

        if (succeeded.length === 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id && m.content.type === 'slots'
                ? {
                    ...m,
                    content: {
                      type: 'text',
                      text: '恐れ入ります、カレンダーへの登録に失敗いたしました。もう一度お試しくださいませ。',
                    },
                  }
                : m,
            ),
          )
          return
        }

        const primary = succeeded[0]
        const note =
          failedCalendars.length > 0
            ? `（${failedCalendars.map((c) => (c === 'google' ? 'Google' : 'Outlook')).join('・')}への登録には失敗しております。連携状況をご確認くださいませ）`
            : ''
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id && m.content.type === 'slots'
              ? {
                  ...m,
                  content: {
                    type: 'approval',
                    selectedSlot: slot,
                    title: note ? `${primary.title} ${note}` : primary.title,
                    location: primary.location || undefined,
                    eventId: primary.id,
                    status: 'done',
                    calendar: failedCalendars.length > 0 ? primary.source : calendar,
                  },
                }
              : m,
          ),
        )
      })
      return
    }

    // --- ここから下はPhase 0のローカルデモ用フォールバック ---
    let createdEventId: string | undefined
    let createdTitle = '新しいご予定'
    let tentativeGroupId: string | undefined

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id || m.content.type !== 'slots') return m
        const title = m.content.draft?.title?.trim() || '新しいご予定'
        createdEventId = `usr-${uid()}`
        createdTitle = title
        tentativeGroupId = m.content.tentativeGroupId
        return {
          ...m,
          content: {
            type: 'approval',
            selectedSlot: slot,
            title,
            location: location || undefined,
            eventId: createdEventId,
            status: 'done',
            calendar,
          },
        }
      }),
    )

    if (createdEventId) {
      // 確定した予定を登録
      addEvent({
        id: createdEventId,
        title: createdTitle,
        start: slot.start,
        end: slot.end,
        source: calendar,
        location: location || undefined,
      })
    }

    // 仮押さえ済みの枠を全て削除（確定枠・未確定枠どちらも、確定済み予定に差し替え済みのため）
    if (tentativeGroupId) {
      const groupId = tentativeGroupId
      events
        .filter((e) => e.tentativeGroupId === groupId)
        .forEach((e) => deleteEvent(e.id))
    }
  }

  /** 全候補枠を仮押さえとしてカレンダーにブロックする */
  const onBlockAll = (id: string) => {
    const msg = messages.find((m) => m.id === id)
    if (!msg || msg.content.type !== 'slots') return

    const { slots, draft } = msg.content
    const groupId = `tent-${uid()}`
    const title = draft?.title?.trim() || '新しいご予定'

    // 全枠を仮予定としてカレンダーに追加
    slots.forEach((slot) => {
      addEvent({
        id: `tent-${uid()}`,
        title: `[仮] ${title}`,
        start: slot.start,
        end: slot.end,
        source: 'google',
        tentative: true,
        tentativeGroupId: groupId,
      })
    })

    // メッセージにグループIDを記録（SlotPickerで「仮押さえ済み」表示に使う）
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.content.type === 'slots'
          ? { ...m, content: { ...m.content, tentativeGroupId: groupId } }
          : m,
      ),
    )
  }

  const onCancelSlot = (id: string) => {
    // 仮押さえがあればカレンダーからも削除
    const msg = messages.find((m) => m.id === id)
    if (msg?.content.type === 'slots' && msg.content.tentativeGroupId) {
      const groupId = msg.content.tentativeGroupId
      events.filter((e) => e.tentativeGroupId === groupId).forEach((e) => deleteEvent(e.id))
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.content.type === 'slots'
          ? {
              ...m,
              content: {
                type: 'approval',
                selectedSlot: { start: '', end: '', label: '' },
                title: '',
                status: 'cancelled',
              },
            }
          : m,
      ),
    )
  }

  const onToggleFlag = (eventId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.content.type === 'briefing'
          ? {
              ...m,
              content: {
                ...m.content,
                events: m.content.events.map((e) =>
                  e.id === eventId ? { ...e, memoFlagged: !e.memoFlagged } : e,
                ),
              },
            }
          : m,
      ),
    )
    const target = events.find((e) => e.id === eventId)
    if (target) {
      updateEvent(eventId, { memoFlagged: !target.memoFlagged })
    }
  }

  const nowIso = new Date().toISOString()
  const flashTitle =
    events.find((e) => e.start > nowIso)?.title ?? events[0]?.title ?? '次のご予定'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-3 max-w-2xl mx-auto w-full"
      >
        {/* 補助アクション（スクロールで隠れる） */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={resetConversation}
            className="inline-flex items-center gap-1 text-xs text-navy-500 hover:text-gold-600 underline-offset-2 hover:underline"
          >
            <RotateCcw size={12} /> 会話をリセット
          </button>
          <button
            type="button"
            onClick={() => setShowFlash(true)}
            className="inline-flex items-center gap-1 text-xs text-navy-500 hover:text-gold-600 underline-offset-2 hover:underline"
          >
            <Bell size={12} /> リマインダーをプレビュー
          </button>
        </div>
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onConfirmSlot={onConfirmSlot}
            onCancelSlot={onCancelSlot}
            onToggleFlag={onToggleFlag}
            onBlockAll={onBlockAll}
            googleConnected={settings.calendarConnected.google}
            outlookConnected={settings.calendarConnected.outlook}
          />
        ))}
      </div>
      <InputBar onSend={sendUser} />
      {showFlash && (
        <FlashOverlay
          title={flashTitle}
          minutesUntil={5}
          onDismiss={() => setShowFlash(false)}
        />
      )}
    </div>
  )
}
