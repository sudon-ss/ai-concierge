import { useEffect, useState } from 'react'
import { Check, Plus, RotateCcw, RefreshCw, Cloud } from 'lucide-react'
import clsx from 'clsx'
import { useProfile } from '../hooks/useProfile'
import { TaskEditModal } from '../components/TaskEditModal'
import type { Task } from '../types'
import {
  getSession,
  hasBackend,
  listTasks,
  createTask,
  updateTaskApi,
  deleteTaskApi,
  type ApiTask,
} from '../lib/api'

const newDraftTask = (): Task => {
  const due = new Date()
  due.setDate(due.getDate() + 1)
  return {
    id: `usr-${Math.random().toString(36).slice(2, 9)}`,
    title: '新しいタスク',
    dueDate: due.toISOString().slice(0, 10),
    priority: 'medium',
    done: false,
  }
}

const apiTaskToTask = (t: ApiTask): Task => ({
  id: t.id,
  title: t.title,
  dueDate: t.due_date ?? '',
  priority: t.priority,
  done: t.done,
})

export function TasksPage() {
  const {
    tasks: demoTasks,
    profile,
    addTask,
    updateTask: updateDemoTask,
    deleteTask: deleteDemoTask,
    resetTasks,
  } = useProfile()
  const [editing, setEditing] = useState<Task | null>(null)
  const [isNew, setIsNew] = useState(false)

  // 実バックエンド接続時は、Phase 0のデモタスクではなく実際に登録したタスクを使う
  const backendMode = hasBackend() && Boolean(getSession())
  const [realTasks, setRealTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(backendMode)

  const loadReal = () => {
    setLoading(true)
    listTasks()
      .then((apiTasks) => setRealTasks(apiTasks.map(apiTaskToTask)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (backendMode) loadReal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode])

  const tasks = backendMode ? realTasks : demoTasks

  const toggle = (id: string) => {
    const target = tasks.find((t) => t.id === id)
    if (!target) return
    if (backendMode) {
      updateTaskApi(id, { done: !target.done })
        .then(loadReal)
        .catch(() => {})
      return
    }
    updateDemoTask(id, { done: !target.done })
  }

  const openNew = () => {
    setEditing(newDraftTask())
    setIsNew(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    setIsNew(false)
  }

  const closeEdit = () => {
    setEditing(null)
    setIsNew(false)
  }

  const handleSave = (updates: Partial<Task>) => {
    if (!editing) return
    if (backendMode) {
      const promise = isNew
        ? createTask({
            title: updates.title ?? editing.title,
            due_date: updates.dueDate ?? editing.dueDate,
            priority: updates.priority ?? editing.priority,
          })
        : updateTaskApi(editing.id, {
            title: updates.title,
            due_date: updates.dueDate,
            priority: updates.priority,
          })
      promise.then(loadReal).catch(() => {})
      closeEdit()
      return
    }
    if (isNew) {
      addTask({ ...editing, ...updates } as Task)
    } else {
      updateDemoTask(editing.id, updates)
    }
    closeEdit()
  }

  const handleDelete = () => {
    if (!editing) return
    if (backendMode) {
      deleteTaskApi(editing.id)
        .then(loadReal)
        .catch(() => {})
      closeEdit()
      return
    }
    deleteDemoTask(editing.id)
    closeEdit()
  }

  const handleReset = () => {
    if (window.confirm('タスクを初期データに戻してもよろしいでしょうか？編集内容は失われます。')) {
      resetTasks()
    }
  }

  const sorted = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const today = new Date().toISOString().slice(0, 10)
  const urgent = sorted.filter((t) => {
    const diff = (new Date(t.dueDate).getTime() - new Date(today).getTime()) / 86400000
    return diff <= 3 && !t.done
  })
  const others = sorted.filter((t) => !urgent.includes(t))
  const completedCount = tasks.filter((t) => t.done).length

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-600">Task</p>
          <h2 className="serif text-2xl text-navy-900">タスク一覧</h2>
          <p className="text-xs text-navy-600 mt-0.5">
            {backendMode ? (
              <>
                <Cloud size={11} className="inline -mt-0.5 mr-0.5" />
                実データ
              </>
            ) : (
              `${profile.label}プロファイル`
            )}
            {completedCount > 0 && (
              <span className="ml-2 text-gold-600">／ {completedCount} 件完了</span>
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
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-navy-500 hover:text-gold-600"
              title="初期データに戻す"
            >
              <RotateCcw size={12} /> リセット
            </button>
          )}
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1 text-xs font-semibold bg-navy-800 hover:bg-navy-900 text-gold-300 rounded-md px-3 py-1.5"
          >
            <Plus size={14} /> 追加
          </button>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gold-700 mb-2 serif">期限3日以内</h3>
        <ul className="space-y-2">
          {urgent.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={toggle} onClick={() => openEdit(t)} />
          ))}
          {urgent.length === 0 && (
            <li className="text-sm text-navy-500 italic">直近のタスクはございません ✓</li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-navy-600 mb-2 serif">その他</h3>
        <ul className="space-y-2">
          {others.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={toggle} onClick={() => openEdit(t)} />
          ))}
          {others.length === 0 && (
            <li className="text-sm text-navy-400 italic">タスクがございません</li>
          )}
        </ul>
      </section>

      {editing && (
        <TaskEditModal
          task={editing}
          isNew={isNew}
          onClose={closeEdit}
          onSave={handleSave}
          onDelete={isNew ? undefined : handleDelete}
        />
      )}
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onClick,
}: {
  task: Task
  onToggle: (id: string) => void
  onClick: () => void
}) {
  return (
    <li className="card p-3 flex items-center gap-3">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle(task.id)
        }}
        className={clsx(
          'size-6 rounded-full border flex items-center justify-center transition shrink-0',
          task.done
            ? 'bg-gold-500 border-gold-500 text-navy-900'
            : 'border-navy-300 hover:border-gold-500',
        )}
        aria-label={task.done ? '未完了に戻す' : '完了にする'}
      >
        {task.done && <Check size={14} />}
      </button>
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <p className={clsx('text-sm', task.done ? 'line-through text-navy-300' : 'text-navy-900')}>
          {task.title}
        </p>
        <p className="text-xs text-navy-500 mt-0.5">期限：{task.dueDate}</p>
      </button>
      <span
        className={clsx(
          'badge shrink-0',
          task.priority === 'high' && 'bg-red-100 text-red-700',
          task.priority === 'medium' && 'bg-gold-100 text-gold-800',
          task.priority === 'low' && 'bg-navy-50 text-navy-600',
        )}
      >
        {task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
      </span>
    </li>
  )
}
