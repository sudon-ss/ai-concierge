import { ListChecks, Calendar } from 'lucide-react'
import clsx from 'clsx'
import type { CalendarEvent, Task } from '../types'
import { CalendarBadge } from './CalendarBadge'
import { MemoBlock } from './MemoBlock'

interface Props {
  date: string
  events: CalendarEvent[]
  tasks: Task[]
  onToggleFlag?: (id: string) => void
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

const fmtDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  const local = new Date(y, m - 1, d)
  return local.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

export function BriefingCard({ date, events, tasks, onToggleFlag }: Props) {
  return (
    <div className="card-elevated p-4 space-y-4 bg-white">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-600">Morning Briefing</p>
        <p className="text-xs text-navy-600 mt-0.5">{fmtDate(date)}</p>
        <h2 className="serif text-lg text-navy-900 mt-1">本日のご予定でございます</h2>
        <div className="gold-divider mt-2" />
      </div>

      <section>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 mb-2 uppercase tracking-wider">
          <Calendar size={14} className="text-gold-600" /> Schedule（{events.length}件）
        </h3>
        <ul className="space-y-2">
          {events.length === 0 && (
            <li className="text-sm text-slate-500 italic">本日のご予定はございません。</li>
          )}
          {events.map((e) => (
            <li key={e.id} className="rounded-md border border-navy-100 bg-cream-50/40 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-navy-700 tabular-nums">
                  {fmtTime(e.start)}–{fmtTime(e.end)}
                </span>
                <CalendarBadge source={e.source} />
                {e.location && (
                  <span className="text-xs text-navy-600">📍{e.location}</span>
                )}
              </div>
              <p className="font-medium text-navy-900 mt-1">{e.title}</p>
              <MemoBlock event={e} onToggleFlag={onToggleFlag} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 mb-2 uppercase tracking-wider">
          <ListChecks size={14} className="text-gold-600" /> Tasks（期限3日以内：{tasks.length}件）
        </h3>
        <ul className="space-y-1.5">
          {tasks.length === 0 && (
            <li className="text-sm text-slate-500 italic">直近のタスクはございません。</li>
          )}
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md border border-navy-100 bg-cream-50/40 px-3 py-2"
            >
              <span
                className={clsx(
                  'badge',
                  t.priority === 'high' && 'bg-red-100 text-red-700',
                  t.priority === 'medium' && 'bg-gold-100 text-gold-800',
                  t.priority === 'low' && 'bg-navy-50 text-navy-600',
                )}
              >
                {t.priority === 'high' ? '高' : t.priority === 'medium' ? '中' : '低'}
              </span>
              <span className="text-sm text-navy-800 flex-1">{t.title}</span>
              <span className="text-xs text-navy-500 tabular-nums">{t.dueDate}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[11px] text-navy-500 italic pt-1">
        ※「30分後ろ倒し」など、音声でリスケジュールを承ります
      </p>
    </div>
  )
}
