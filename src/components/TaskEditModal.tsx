import { useEffect, useState } from 'react'
import { X, Trash2, Save } from 'lucide-react'
import clsx from 'clsx'
import type { Task } from '../types'

interface Props {
  task: Task
  isNew: boolean
  onClose: () => void
  onSave: (updates: Partial<Task>) => void
  onDelete?: () => void
}

export function TaskEditModal({ task, isNew, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(task.title)
  const [dueDate, setDueDate] = useState(task.dueDate)
  const [priority, setPriority] = useState<Task['priority']>(task.priority)
  const [done, setDone] = useState(task.done)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    onSave({
      title: title.trim() || task.title,
      dueDate,
      priority,
      done,
    })
  }

  const confirmDelete = () => {
    if (!onDelete) return
    if (window.confirm(`「${task.title}」を削除してもよろしいでしょうか？`)) {
      onDelete()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-navy-900/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} role="presentation" />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto border border-gold-200/50">
        <header className="sticky top-0 bg-navy-900 text-white px-4 py-3 flex items-center justify-between">
          <h2 className="serif text-lg">{isNew ? 'タスクを追加' : 'タスクを編集'}</h2>
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
            <span className="text-xs font-medium text-navy-700">タスク内容</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：取締役会議事録の確認"
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-navy-700">期限</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 bg-white text-navy-900 px-3 py-2 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-navy-700">優先度</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={clsx(
                    'rounded-md border py-2 text-xs font-medium transition',
                    priority === p
                      ? p === 'high'
                        ? 'bg-red-600 border-red-600 text-white'
                        : p === 'medium'
                        ? 'bg-gold-500 border-gold-500 text-navy-900'
                        : 'bg-navy-700 border-navy-700 text-white'
                      : 'bg-white border-navy-200 text-navy-700 hover:bg-cream-50',
                  )}
                >
                  {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                </button>
              ))}
            </div>
          </label>

          {!isNew && (
            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={done}
                onChange={(e) => setDone(e.target.checked)}
                className="size-4 rounded border-navy-300 text-gold-500 focus:ring-gold-200"
              />
              <span className="text-sm text-navy-800">完了済み</span>
            </label>
          )}
        </div>

        <footer className="sticky bottom-0 bg-cream-50 border-t border-navy-100 px-4 py-3 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={confirmDelete}
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 rounded-md px-2 py-2"
            >
              <Trash2 size={14} /> 削除
            </button>
          )}
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
            <Save size={14} /> {isNew ? '追加' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}
