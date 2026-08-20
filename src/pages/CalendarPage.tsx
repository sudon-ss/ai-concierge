import { useEffect, useState } from 'react'
import { Plus, RotateCcw, RefreshCw, Cloud } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { CalendarBadge } from '../components/CalendarBadge'
import { MemoBlock } from '../components/MemoBlock'
import { EventEditModal } from '../components/EventEditModal'
import type { CalendarEvent } from '../types'
import { deleteEventApi, getSession, hasBackend, listEvents, updateEventApi } from '../lib/api'

const groupByDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

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
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 実バックエンド接続時は、Phase 0のデモデータではなく実際に連携済みのカレンダーを表示する
  const backendMode = hasBackend() && Boolean(getSession())
  const [realEvents, setRealEvents] = useState<CalendarEvent[] | null>(null)
  const [loading, setLoading] = useState(backendMode)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadReal = () => {
    setLoading(true)
    setLoadError(null)
    listEvents()
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
      .catch(() => setLoadError('恐れ入ります、ご予定の取得に失敗いたしました。'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (backendMode) loadReal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode])

  const events = backendMode ? (realEvents ?? []) : demoEvents

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
    setEditing(e)
    setIsNew(false)
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
    setSaveError(null)
    updateEventApi({
      calendar: calendarOf(editing),
      event_id: editing.id,
      title: updates.title,
      start: updates.start,
      end: updates.end,
      location: updates.location,
      memo: updates.memo,
      memo_flagged: updates.memoFlagged,
    })
      .then(() => {
        closeEdit()
        loadReal()
      })
      .catch(() => setSaveError('恐れ入ります、ご予定の更新に失敗いたしました。もう一度お試しくださいませ。'))
  }

  const handleDelete = () => {
    if (!editing) return
    if (!backendMode) {
      deleteEvent(editing.id)
      closeEdit()
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

      {backendMode && (
        <p className="text-[11px] text-navy-400 -mt-3">
          ご予定の新規登録は「チャット」タブからお申し付けください。変更・削除はこの一覧からも行えます。
        </p>
      )}

      {loadError && <div className="card p-4 text-center text-red-600 text-sm">{loadError}</div>}

      {!loading && events.length === 0 && !loadError && (
        <div className="card p-6 text-center text-navy-500 text-sm">
          {backendMode
            ? '直近のご予定はございません。'
            : 'ご予定はございません。「＋追加」または音声からご登録くださいませ。'}
        </div>
      )}

      {Object.entries(grouped).map(([day, dayEvents]) => (
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
        />
      )}
    </div>
  )
}
