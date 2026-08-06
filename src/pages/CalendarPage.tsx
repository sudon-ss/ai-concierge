import { useEffect, useState } from 'react'
import { Plus, RotateCcw, RefreshCw, Cloud } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { CalendarBadge } from '../components/CalendarBadge'
import { MemoBlock } from '../components/MemoBlock'
import { EventEditModal } from '../components/EventEditModal'
import type { CalendarEvent } from '../types'
import { getSession, hasBackend, listEvents } from '../lib/api'

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

  const grouped = events.reduce<Record<string, typeof events>>((acc, e) => {
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
    if (backendMode) return // 実データの編集はチャット（またはGoogleカレンダー側）で行う
    setEditing(e)
    setIsNew(false)
  }

  const closeEdit = () => {
    setEditing(null)
    setIsNew(false)
  }

  const handleSave = (updates: Partial<CalendarEvent>) => {
    if (!editing) return
    if (isNew) {
      addEvent({ ...editing, ...updates })
    } else {
      updateEvent(editing.id, updates)
    }
    closeEdit()
  }

  const handleDelete = () => {
    if (!editing) return
    deleteEvent(editing.id)
    closeEdit()
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
          ご予定の追加・変更は「チャット」タブからお申し付けください。
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
                <button
                  type="button"
                  onClick={() => openEdit(e)}
                  disabled={backendMode}
                  className="w-full card p-3 text-left hover:border-gold-300 transition disabled:hover:border-navy-100 disabled:cursor-default"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-navy-700 tabular-nums">
                      {fmtTime(e.start)}–{fmtTime(e.end)}
                    </span>
                    <CalendarBadge source={e.source} />
                    {e.location && <span className="text-xs text-navy-600">📍{e.location}</span>}
                  </div>
                  <p className="font-medium text-navy-900 mt-1">{e.title}</p>
                  <MemoBlock event={e} />
                </button>
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
        />
      )}
    </div>
  )
}
