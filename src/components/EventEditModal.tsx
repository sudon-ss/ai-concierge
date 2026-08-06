import { useEffect, useState } from 'react'
import { X, Trash2, Save, MapPin, FileText } from 'lucide-react'
import clsx from 'clsx'
import type { CalendarEvent } from '../types'

interface Props {
  event: CalendarEvent
  onClose: () => void
  onSave: (updates: Partial<CalendarEvent>) => void
  onDelete: () => void
}

const toLocalInputValue = (iso: string): string => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromLocalInputValue = (value: string): string => {
  return new Date(value).toISOString()
}

export function EventEditModal({ event, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(event.title)
  const [location, setLocation] = useState(event.location ?? '')
  const [memo, setMemo] = useState(event.memo ?? '')
  const [start, setStart] = useState(toLocalInputValue(event.start))
  const [end, setEnd] = useState(toLocalInputValue(event.end))
  const [source, setSource] = useState<CalendarEvent['source']>(event.source)
  const [flagged, setFlagged] = useState(event.memoFlagged ?? false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    onSave({
      title: title.trim() || event.title,
      location: location.trim() || undefined,
      memo: memo.trim() || undefined,
      start: fromLocalInputValue(start),
      end: fromLocalInputValue(end),
      source,
      memoFlagged: flagged,
    })
  }

  const confirmDelete = () => {
    if (window.confirm(`「${event.title}」を削除してもよろしいでしょうか？`)) {
      onDelete()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-navy-900/50 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto border border-gold-200/50">
        <header className="sticky top-0 bg-navy-900 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="serif text-lg">ご予定を編集</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gold-300 hover:text-gold-200"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-navy-700">件名</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-navy-700">開始</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-navy-200 bg-white text-navy-900 px-2 py-2 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-navy-700">終了</span>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-navy-200 bg-white text-navy-900 px-2 py-2 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-navy-700">カレンダー</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(['google', 'outlook', 'both'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={clsx(
                    'rounded-md border py-1.5 text-xs font-medium transition',
                    source === s
                      ? 'bg-navy-800 border-navy-800 text-gold-300'
                      : 'bg-white border-navy-200 text-navy-700 hover:bg-cream-50',
                  )}
                >
                  {s === 'google' ? 'Google' : s === 'outlook' ? 'Outlook' : '両方'}
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-navy-700">場所</span>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-navy-200 px-3 py-2">
              <MapPin size={14} className="text-navy-400 shrink-0" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="例：Zoom、本社会議室"
                className="flex-1 text-sm focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-navy-700">メモ</span>
            <div className="mt-1 flex items-start gap-2 rounded-md border border-navy-200 px-3 py-2">
              <FileText size={14} className="text-navy-400 shrink-0 mt-1" />
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="ご持参物・ご留意事項など"
                rows={2}
                className="flex-1 text-sm focus:outline-none resize-none"
              />
            </div>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => setFlagged(e.target.checked)}
              className="size-4 rounded border-navy-300 text-red-600 focus:ring-red-200"
            />
            <span className="text-sm text-navy-800">緊急フラグを立てる</span>
          </label>
        </div>

        <footer className="sticky bottom-0 bg-cream-50 border-t border-navy-100 px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={confirmDelete}
            className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 rounded-md px-2 py-2"
          >
            <Trash2 size={14} /> 削除
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-navy-500 hover:text-navy-700 px-3 py-2"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1 text-sm font-semibold bg-gradient-to-r from-gold-500 to-gold-400 hover:from-gold-600 hover:to-gold-500 text-navy-900 rounded-md px-4 py-2"
          >
            <Save size={14} /> 保存
          </button>
        </footer>
      </div>
    </div>
  )
}
