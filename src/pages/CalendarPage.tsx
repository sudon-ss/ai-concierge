import { useEffect, useState } from 'react'
import { Plus, RotateCcw, RefreshCw, Cloud, List, CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import { useProfile } from '../hooks/useProfile'
import { CalendarBadge } from '../components/CalendarBadge'
import { MemoBlock } from '../components/MemoBlock'
import { EventEditModal } from '../components/EventEditModal'
import { CalendarGridView, type GridViewMode } from '../components/CalendarGridView'
import { ConnectionNoticeBanner } from '../components/ConnectionNoticeBanner'
import { isOffline, OFFLINE_ACTION_MESSAGE } from '../lib/offlineCache'
import { useOnlineRefresh } from '../hooks/useOnlineRefresh'
import { NoteSearch } from '../components/NoteSearch'
import { useSettings } from '../hooks/useSettings'
import type { CalendarEvent } from '../types'
import {
  deleteEventApi,
  getSession,
  hasBackend,
  listEvents,
  listEventsRange,
  getNote,
  deleteNoteApi,
  saveNote,
  toDateStr,
  updateEventApi,
  type ApiEvent,
} from '../lib/api'

type ViewMode = 'list' | GridViewMode

const VIEW_LABELS: Record<ViewMode, string> = { list: '一覧', day: '日', week: '週', month: '月' }

const groupByDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

/** 日／週／月表示で取得する期間。表示中の月の前後8日ぶんを含める（月表示の6週間・週をまたぐ表示をカバー）。
 * この範囲内の移動（前へ／次へ）では再取得しない。 */
const windowFor = (d: Date) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  start.setDate(start.getDate() - 8)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  end.setDate(end.getDate() + 8)
  return { start, end }
}

const toCalendarEvent = (e: ApiEvent): CalendarEvent => ({
  id: e.id,
  title: e.title,
  start: e.start,
  end: e.end,
  source: e.source,
  location: e.location ?? undefined,
  // 会議メモ。一覧には要約だけが入る（編集画面を開くときに全文を取得する）
  memo: e.note?.snippet,
  memoPriority: e.note?.priority,
  memoFlagged: e.note?.flagged,
  noteId: e.note?.id,
  refs: (e.copies && e.copies.length > 0 ? e.copies : [{ id: e.id, source: e.source }]).map(
    (c) => `${c.source === 'both' ? 'google' : c.source}:${c.id}`,
  ),
  seriesId: e.series_id ?? null,
})

const newDraftEvent = (): CalendarEvent => {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return {
    id: `usr-${Math.random().toString(36).slice(2, 9)}`,
    title: '新しいご予定',
    start: start.toISOString(),
    end: end.toISOString(),
    source: 'google',
  }
}

export function CalendarPage() {
  const { events: demoEvents, profile, addEvent, updateEvent, deleteEvent, resetEvents } = useProfile()
  const { settings } = useSettings()
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [gridDate, setGridDate] = useState(new Date())

  // 実バックエンド接続時は、Phase 0のデモデータではなく実際に連携済みのカレンダーを表示する
  const backendMode = hasBackend() && Boolean(getSession())
  const [realEvents, setRealEvents] = useState<CalendarEvent[] | null>(null)
  const [loading, setLoading] = useState(backendMode)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 日／週／月表示用: 表示中の期間（過去・先の月を含む）の予定。一覧表示用の「今から30日」とは別に持つ
  const [rangeEvents, setRangeEvents] = useState<CalendarEvent[] | null>(null)
  const [rangeKey, setRangeKey] = useState('')
  const [rangeLoading, setRangeLoading] = useState(false)

  const loadReal = () => {
    setLoading(true)
    setLoadError(null)
    listEvents()
      .then((apiEvents) => setRealEvents(apiEvents.map(toCalendarEvent)))
      .catch(() => setLoadError('恐れ入ります、ご予定の取得に失敗いたしました。'))
      .finally(() => setLoading(false))
    setRangeKey('') // 登録・編集・削除のあとは、表示期間の予定も取り直す
  }

  useEffect(() => {
    if (backendMode) loadReal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode])

  // 日／週／月表示では、表示している日付を含む期間の予定を取得する（範囲内の移動では再取得しない）
  useEffect(() => {
    if (!backendMode || viewMode === 'list') return
    const { start, end } = windowFor(gridDate)
    const key = `${toDateStr(start)}_${toDateStr(end)}`
    if (key === rangeKey) return
    let cancelled = false
    setRangeLoading(true)
    listEventsRange(start, end)
      .then((apiEvents) => {
        if (cancelled) return
        setRangeEvents(apiEvents.map(toCalendarEvent))
        setRangeKey(key)
        setLoadError(null)
      })
      .catch(() => {
        if (!cancelled) setLoadError('恐れ入ります、ご予定の取得に失敗いたしました。')
      })
      .finally(() => {
        if (!cancelled) setRangeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [backendMode, viewMode, gridDate, rangeKey])

  // 通信が戻ったら、通信できない間に表示していた古い控えを取り直す
  useOnlineRefresh(loadReal, backendMode)

  const events = backendMode ? (realEvents ?? []) : demoEvents
  const gridEvents = backendMode ? (rangeEvents ?? []) : demoEvents

  // APIの返却順・追加順に依存せず、常に開始時刻の昇順で表示する。GoogleはUTCオフセット付き、
  // Outlookはオフセットなしの日時文字列を返すことがあり、文字列のまま比較すると正しい順序に
  // ならないため、Dateとしてパースしてから比較する
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  )

  const grouped = sortedEvents.reduce<Record<string, typeof sortedEvents>>((acc, e) => {
    const k = groupByDay(e.start)
    if (!acc[k]) acc[k] = []
    acc[k].push(e)
    return acc
  }, {})

  const openNew = () => {
    setEditing(newDraftEvent())
    setIsNew(true)
  }

  const openEdit = (e: CalendarEvent) => {
    setSaveError(null)
    setIsNew(false)
    if (backendMode && e.noteId) {
      // 一覧には要約しか入っていない。要約のまま編集画面を開いて保存すると、メモの後半が
      // 消えてしまうため、全文を取得してから開く（取得できなければ、開かない）
      getNote(e.noteId)
        .then((n) => setEditing({ ...e, memo: n.body, memoPriority: n.priority, memoFlagged: n.flagged }))
        .catch(() => window.alert('恐れ入ります、メモの読み込みに失敗いたしました。もう一度お試しくださいませ。'))
      return
    }
    setEditing(e)
  }

  const closeEdit = () => {
    setEditing(null)
    setIsNew(false)
    setSaveError(null)
  }

  // dedupe_events は常にcopiesを持たせて返すため、'both'（Google+Outlook両方に登録済み）の
  // 場合でもこの値は実際には使われない（copies側の各カレンダーが優先される）フォールバック用の値
  const calendarOf = (e: CalendarEvent): 'google' | 'outlook' => (e.source === 'both' ? 'google' : e.source)

  const handleSave = (updates: Partial<CalendarEvent>) => {
    if (!editing) return
    if (!backendMode) {
      if (isNew) {
        addEvent({ ...editing, ...updates })
      } else {
        updateEvent(editing.id, updates)
      }
      closeEdit()
      return
    }
    if (isOffline()) {
      setSaveError(OFFLINE_ACTION_MESSAGE)
      return
    }
    setSaveError(null)

    // 予定そのもの（件名・時刻・場所）の変更と、会議メモの保存は、別々に反映する。
    // メモはカレンダー本体ではなく、予定に紐付けて別に保存する。
    const sameInstant = (a?: string, b?: string) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime()
    const eventChanged =
      (updates.title ?? editing.title) !== editing.title ||
      !sameInstant(updates.start, editing.start) ||
      !sameInstant(updates.end, editing.end) ||
      (updates.location ?? '') !== (editing.location ?? '')
    const memoChanged =
      (updates.memo ?? '') !== (editing.memo ?? '') ||
      (updates.memoFlagged ?? false) !== (editing.memoFlagged ?? false)

    const title = updates.title ?? editing.title
    const start = updates.start ?? editing.start
    const end = updates.end ?? editing.end

    const run = async () => {
      if (eventChanged) {
        await updateEventApi({
          calendar: calendarOf(editing),
          event_id: editing.id,
          title: updates.title,
          start: updates.start,
          end: updates.end,
          location: updates.location,
        })
      }
      if (memoChanged) {
        await saveNote({
          refs: editing.refs ?? [`${calendarOf(editing)}:${editing.id}`],
          title,
          start,
          end,
          series_key: editing.seriesId ?? null,
          body: updates.memo ?? '',
          flagged: updates.memoFlagged ?? false,
          use_ai: settings.aiMemoJudgeEnabled,
        })
      }
    }
    run()
      .then(() => {
        closeEdit()
        loadReal()
      })
      .catch((e: Error) =>
        setSaveError(
          /503/.test(e.message)
            ? 'メモ機能は準備中のため、メモを保存できませんでした。しばらくしてからお試しくださいませ。'
            : '恐れ入ります、ご予定の更新に失敗いたしました。もう一度お試しくださいませ。',
        ),
      )
  }

  // 会議メモだけを削除する（予定そのものは残る）。メモは自動では消えないため、利用者が個別に削除する
  const handleDeleteNote = () => {
    if (!editing?.noteId) return
    if (isOffline()) {
      setSaveError(OFFLINE_ACTION_MESSAGE)
      return
    }
    deleteNoteApi(editing.noteId)
      .then(() => {
        closeEdit()
        loadReal()
      })
      .catch(() => setSaveError('恐れ入ります、メモの削除に失敗いたしました。もう一度お試しくださいませ。'))
  }

  const handleDelete = () => {
    if (!editing) return
    if (!backendMode) {
      deleteEvent(editing.id)
      closeEdit()
      return
    }
    if (isOffline()) {
      setSaveError(OFFLINE_ACTION_MESSAGE)
      return
    }
    setSaveError(null)
    deleteEventApi({ calendar: calendarOf(editing), event_id: editing.id })
      .then(() => {
        closeEdit()
        loadReal()
      })
      .catch(() => setSaveError('恐れ入ります、ご予定の削除に失敗いたしました。もう一度お試しくださいませ。'))
  }

  // Schedule一覧からモーダルを開かず直接削除する（メモ欄の「削除する」ボタンから）
  const handleQuickDelete = (e: CalendarEvent) => {
    if (backendMode && isOffline()) {
      window.alert(OFFLINE_ACTION_MESSAGE)
      return
    }
    if (!window.confirm(`「${e.title}」を削除してもよろしいでしょうか？`)) return
    if (!backendMode) {
      deleteEvent(e.id)
      return
    }
    deleteEventApi({ calendar: calendarOf(e), event_id: e.id })
      .then(() => loadReal())
      .catch(() => window.alert('恐れ入ります、ご予定の削除に失敗いたしました。もう一度お試しくださいませ。'))
  }

  const handleReset = () => {
    if (window.confirm('ご予定を初期データに戻してもよろしいでしょうか？編集内容は失われます。')) {
      resetEvents()
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-5">
      <ConnectionNoticeBanner />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-600">Schedule</p>
          <h2 className="serif text-2xl text-navy-900">ご予定一覧</h2>
          <p className="text-xs text-navy-600 mt-0.5">
            {backendMode ? (
              <>
                <Cloud size={11} className="inline -mt-0.5 mr-0.5" />
                連携カレンダーと同期表示 ／ 全 {events.length} 件
              </>
            ) : (
              `${profile.label}プロファイル ／ 全 ${events.length} 件`
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {backendMode ? (
            <button
              type="button"
              onClick={loadReal}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs text-navy-500 hover:text-gold-600 disabled:opacity-50"
              title="再取得"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 更新
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 text-xs text-navy-500 hover:text-gold-600"
                title="初期データに戻す"
              >
                <RotateCcw size={12} /> リセット
              </button>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-navy-800 hover:bg-navy-900 text-gold-300 rounded-md px-3 py-1.5"
              >
                <Plus size={14} /> 追加
              </button>
            </>
          )}
        </div>
      </div>

      <div className="inline-flex items-center gap-0.5 bg-navy-50 rounded-lg p-0.5 self-start">
        {(['list', 'day', 'week', 'month'] as ViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setViewMode(v)}
            className={clsx(
              'flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 transition',
              viewMode === v ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-700',
            )}
          >
            {v === 'list' ? <List size={12} /> : <CalendarDays size={12} />}
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {backendMode && (
        <NoteSearch
          onJump={(d) => {
            setGridDate(d)
            setViewMode('day')
          }}
        />
      )}

      {backendMode && (
        <p className="text-[11px] text-navy-400 -mt-3">
          ご予定の新規登録は「チャット」タブからお申し付けください。変更・削除はこの一覧からも行えます。
        </p>
      )}

      {loadError && <div className="card p-4 text-center text-red-600 text-sm">{loadError}</div>}

      {viewMode !== 'list' && (
        <CalendarGridView
          mode={viewMode}
          currentDate={gridDate}
          loading={rangeLoading}
          events={gridEvents}
          onDateChange={setGridDate}
          onEventClick={openEdit}
          onDayClick={(d) => {
            setGridDate(d)
            setViewMode('day')
          }}
        />
      )}

      {viewMode === 'list' && !loading && events.length === 0 && !loadError && (
        <div className="card p-6 text-center text-navy-500 text-sm">
          {backendMode
            ? '直近のご予定はございません。'
            : 'ご予定はございません。「＋追加」または音声からご登録くださいませ。'}
        </div>
      )}

      {viewMode === 'list' && Object.entries(grouped).map(([day, dayEvents]) => (
        <section key={day}>
          <h3 className="text-sm font-semibold text-navy-700 mb-2 serif">{day}</h3>
          <ul className="space-y-2">
            {dayEvents.map((e) => (
              <li key={e.id}>
                {/* 内部に「削除する」ボタンを置くため、<button>ではなくクリック可能な<div>にする
                    （<button>の中に<button>を置くのは無効なHTMLでクリックが効かなくなる） */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(e)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      openEdit(e)
                    }
                  }}
                  className="w-full card p-3 text-left hover:border-gold-300 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-navy-700 tabular-nums">
                      {fmtTime(e.start)}–{fmtTime(e.end)}
                    </span>
                    <CalendarBadge source={e.source} />
                    {e.location && <span className="text-xs text-navy-600">📍{e.location}</span>}
                  </div>
                  <p className="font-medium text-navy-900 mt-1">{e.title}</p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <MemoBlock event={e} />
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        handleQuickDelete(e)
                      }}
                      className="shrink-0 text-xs text-red-500 hover:text-red-700 underline-offset-2 hover:underline"
                    >
                      削除する
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing && (
        <EventEditModal
          event={editing}
          onClose={closeEdit}
          onSave={handleSave}
          onDelete={handleDelete}
          errorText={saveError}
          lockCalendar={backendMode}
          onDeleteNote={backendMode && editing.noteId ? handleDeleteNote : undefined}
        />
      )}
    </div>
  )
}
