import { useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import type { CalendarEvent } from '../types'

export type GridViewMode = 'day' | 'week' | 'month'

interface Props {
  mode: GridViewMode
  currentDate: Date
  events: CalendarEvent[]
  onDateChange: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
  /** 月表示で日付セルをタップした時（日表示へ遷移させるのに使う） */
  onDayClick: (date: Date) => void
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土']
const SOURCE_DOT: Record<string, string> = {
  google: 'bg-navy-400',
  outlook: 'bg-navy-600',
  both: 'bg-gold-500',
}
const SOURCE_BLOCK: Record<string, string> = {
  google: 'bg-navy-100 border-navy-300 text-navy-800',
  outlook: 'bg-navy-200 border-navy-400 text-navy-900',
  both: 'bg-gold-100 border-gold-400 text-gold-900',
}

const HOUR_HEIGHT = 48 // px
const DAY_START_HOUR = 0
const DAY_END_HOUR = 24
const DEFAULT_SCROLL_HOUR = 7 // 開いたときに朝7時あたりが見える位置までスクロールしておく

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const startOfWeek = (date: Date) => {
  // 月曜始まり
  const d = new Date(date)
  const day = d.getDay() // 0=日
  const diff = (day + 6) % 7 // 月曜からの経過日数
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const addDays = (date: Date, n: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

const addMonths = (date: Date, n: number) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

/** 月表示のグリッド用に、前後の月の日付も含めた6週分(42マス)を返す */
const buildMonthGrid = (date: Date): Date[] => {
  const first = startOfMonth(date)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

const eventSourceKey = (e: CalendarEvent) => (e.source === 'both' ? 'both' : e.source)

/** 予定を開始時刻順に並べ、時間が重なるものを横に並べるための列番号・総列数を割り当てる。
 * カレンダーUIでよくある「重なった予定を左右に分割して表示する」ための簡易実装。 */
function layoutOverlaps(events: CalendarEvent[]): Array<{ event: CalendarEvent; col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const result: Array<{ event: CalendarEvent; col: number; cols: number }> = []
  let cluster: typeof result = []
  let clusterEnd = -Infinity

  const flushCluster = () => {
    if (cluster.length === 0) return
    const cols = Math.max(...cluster.map((c) => c.col)) + 1
    cluster.forEach((c) => result.push({ ...c, cols }))
    cluster = []
  }

  for (const event of sorted) {
    const start = new Date(event.start).getTime()
    const end = new Date(event.end).getTime()
    if (start >= clusterEnd) {
      flushCluster()
      clusterEnd = end
      cluster.push({ event, col: 0, cols: 1 })
      continue
    }
    // 空いている最小の列番号を探す
    const usedCols = new Set(cluster.map((c) => c.col))
    let col = 0
    while (usedCols.has(col)) col++
    cluster.push({ event, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, end)
  }
  flushCluster()
  return result
}

function EventBlock({
  event,
  col,
  cols,
  onClick,
  dense,
}: {
  event: CalendarEvent
  col: number
  cols: number
  onClick: () => void
  dense: boolean
}) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  const dayStartMinutes = DAY_START_HOUR * 60
  const startMinutes = Math.max(0, start.getHours() * 60 + start.getMinutes() - dayStartMinutes)
  const endMinutes = Math.min(
    (DAY_END_HOUR - DAY_START_HOUR) * 60,
    Math.max(startMinutes + 20, end.getHours() * 60 + end.getMinutes() - dayStartMinutes),
  )
  const top = (startMinutes / 60) * HOUR_HEIGHT
  const height = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT
  const widthPct = 100 / cols
  const fmtT = (d: Date) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation()
        onClick()
      }}
      title={`${event.title}（${fmtT(start)}〜${fmtT(end)}）`}
      style={{
        top,
        height: Math.max(height, 18),
        left: `calc(${col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      className={clsx(
        'absolute rounded-md border px-1 py-0.5 text-left overflow-hidden leading-tight shadow-sm',
        'hover:brightness-95 transition',
        SOURCE_BLOCK[eventSourceKey(event)],
      )}
    >
      {!dense && <div className="text-[9px] opacity-70 tabular-nums">{fmtT(start)}</div>}
      <div className={clsx('font-medium truncate', dense ? 'text-[9px]' : 'text-[11px]')}>{event.title}</div>
    </button>
  )
}

function HourGrid({
  columns,
  onEventClick,
}: {
  columns: { date: Date; events: CalendarEvent[] }[]
  onEventClick: (e: CalendarEvent) => void
}) {
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
  const today = new Date()
  const dense = columns.length > 1
  const scrollRef = useRef<HTMLDivElement>(null)

  // 開いた時・表示対象が変わった時に朝の時間帯が見える位置までスクロールしておく
  const rangeKey = columns.map((c) => c.date.toDateString()).join('|')
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT
  }, [rangeKey])

  return (
    <div className="border border-navy-100 rounded-lg overflow-hidden">
      {/* ヘッダー行（曜日・日付）。スクロールしても常に見える位置に固定する */}
      <div className="flex border-b border-navy-100 bg-navy-50/50">
        <div className="shrink-0 w-10" />
        <div className="flex-1 flex min-w-0">
          {columns.map(({ date }) => {
            const isToday = sameDay(date, today)
            return (
              <div
                key={date.toISOString()}
                className={clsx(
                  'flex-1 min-w-0 text-center text-[11px] py-1.5',
                  isToday ? 'text-gold-700 font-semibold' : 'text-navy-500',
                )}
              >
                {WEEKDAY_JA[date.getDay()]} {date.getDate()}
              </div>
            )
          })}
        </div>
      </div>

      {/* 本体: 時刻ラベルと各日の予定を1つのスクロール領域にまとめ、
          縦スクロールで両方が一緒に動くようにする */}
      <div ref={scrollRef} className="overflow-y-auto overflow-x-auto" style={{ maxHeight: 420 }}>
        <div className="flex" style={{ minWidth: dense ? columns.length * 46 + 40 : undefined }}>
          <div className="shrink-0 w-10 bg-navy-50/30 border-r border-navy-100">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="text-[10px] text-navy-400 text-right pr-1 -mt-[6px] tabular-nums"
              >
                {h}:00
              </div>
            ))}
          </div>
          {columns.map(({ date, events }) => {
            const laidOut = layoutOverlaps(events)
            return (
              <div
                key={date.toISOString()}
                className="flex-1 min-w-0 border-r border-navy-100 last:border-r-0 relative"
                style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT }}
                    className="absolute left-0 right-0 border-t border-navy-50"
                  />
                ))}
                {laidOut.map(({ event, col, cols }) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    col={col}
                    cols={cols}
                    dense={dense}
                    onClick={() => onEventClick(event)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function CalendarGridView({ mode, currentDate, events, onDateChange, onEventClick, onDayClick }: Props) {
  const eventsOn = (date: Date) => events.filter((e) => sameDay(new Date(e.start), date))

  const goPrev = () => {
    if (mode === 'day') onDateChange(addDays(currentDate, -1))
    else if (mode === 'week') onDateChange(addDays(currentDate, -7))
    else onDateChange(addMonths(currentDate, -1))
  }
  const goNext = () => {
    if (mode === 'day') onDateChange(addDays(currentDate, 1))
    else if (mode === 'week') onDateChange(addDays(currentDate, 7))
    else onDateChange(addMonths(currentDate, 1))
  }
  const goToday = () => onDateChange(new Date())

  const headerLabel = useMemo(() => {
    if (mode === 'day') {
      return currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    }
    if (mode === 'week') {
      const start = startOfWeek(currentDate)
      const end = addDays(start, 6)
      const sameMonth = start.getMonth() === end.getMonth()
      return sameMonth
        ? `${start.getFullYear()}年${start.getMonth() + 1}月 ${start.getDate()}–${end.getDate()}日`
        : `${start.getMonth() + 1}/${start.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
    }
    return currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })
  }, [mode, currentDate])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="p-1.5 rounded-md hover:bg-navy-50 text-navy-500"
            title="前へ"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="p-1.5 rounded-md hover:bg-navy-50 text-navy-500"
            title="次へ"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 text-xs font-medium text-navy-600 hover:text-gold-600 border border-navy-200 rounded-md px-2 py-1"
          >
            今日
          </button>
        </div>
        <p className="text-sm font-semibold text-navy-800 serif">{headerLabel}</p>
      </div>

      {mode === 'day' && (
        <HourGrid
          columns={[{ date: currentDate, events: eventsOn(currentDate) }]}
          onEventClick={onEventClick}
        />
      )}

      {mode === 'week' &&
        (() => {
          const weekStart = startOfWeek(currentDate)
          const columns = Array.from({ length: 7 }, (_, i) => {
            const date = addDays(weekStart, i)
            return { date, events: eventsOn(date) }
          })
          return <HourGrid columns={columns} onEventClick={onEventClick} />
        })()}

      {mode === 'month' && (
        <div className="border border-navy-100 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-navy-50/50 border-b border-navy-100">
            {WEEKDAY_JA.slice(1).concat(WEEKDAY_JA[0]).map((w) => (
              <div key={w} className="text-[10px] text-navy-400 text-center py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {buildMonthGrid(currentDate).map((date) => {
              const inMonth = date.getMonth() === currentDate.getMonth()
              const isToday = sameDay(date, new Date())
              const dayEvents = eventsOn(date)
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => onDayClick(date)}
                  className={clsx(
                    'min-h-[58px] border-b border-r border-navy-50 p-1 text-left flex flex-col items-center gap-0.5',
                    'hover:bg-gold-50/60 transition',
                    !inMonth && 'opacity-35',
                  )}
                >
                  <span
                    className={clsx(
                      'text-xs w-5 h-5 flex items-center justify-center rounded-full',
                      isToday ? 'bg-gold-500 text-navy-900 font-semibold' : 'text-navy-700',
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex flex-wrap justify-center gap-0.5 max-w-full">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className={clsx('w-1.5 h-1.5 rounded-full', SOURCE_DOT[eventSourceKey(e)])}
                      />
                    ))}
                    {dayEvents.length > 4 && (
                      <span className="text-[9px] text-navy-400 leading-none">+{dayEvents.length - 4}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
