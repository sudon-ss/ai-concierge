import clsx from 'clsx'
import { WEEKDAY_OPTIONS, WEEKDAY_LABEL, type WeekdayCode } from '../hooks/useSettings'

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h)

interface Props {
  enabled: boolean
  weekdays: WeekdayCode[]
  startHour: number
  endHour: number
  onChangeEnabled: (v: boolean) => void
  onChangeWeekdays: (v: WeekdayCode[]) => void
  onChangeStartHour: (v: number) => void
  onChangeEndHour: (v: number) => void
}

/** 空き時間提案から既定で除外する曜日・時間帯の設定UI。設定画面・初期セットアップ共通。
 * 接待・会食・二次会等はAI側が文脈から例外扱いするため（ソフト優先）、ここでは
 * あくまで「何も指定が無いときの既定」を決めるだけである旨を案内文で伝えている。
 */
export function BlockedHoursEditor({
  enabled,
  weekdays,
  startHour,
  endHour,
  onChangeEnabled,
  onChangeWeekdays,
  onChangeStartHour,
  onChangeEndHour,
}: Props) {
  const toggleDay = (d: WeekdayCode) => {
    onChangeWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 py-1">
        <div className="flex-1">
          <p className="text-sm font-medium text-navy-900">業務時間外を空き時間提案から除外</p>
          <p className="text-xs text-navy-500 mt-0.5">
            接待・会食・二次会など明らかにこの時間帯を意図したご依頼では、例外的に提案いたします
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChangeEnabled(!enabled)}
          className={clsx(
            'relative inline-flex h-6 w-11 shrink-0 rounded-full transition',
            enabled ? 'bg-gold-500' : 'bg-navy-200',
          )}
          aria-label={enabled ? 'オフにする' : 'オンにする'}
        >
          <span
            className={clsx(
              'absolute top-0.5 size-5 rounded-full bg-white shadow transition',
              enabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5',
            )}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-3 pt-1">
          <div>
            <p className="text-xs text-navy-600 mb-1.5">対象の曜日（休日）</p>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={clsx(
                    'size-8 rounded-full text-xs font-semibold transition',
                    weekdays.includes(d)
                      ? 'bg-gold-500 text-navy-900'
                      : 'bg-navy-50 text-navy-500 hover:bg-navy-100',
                  )}
                >
                  {WEEKDAY_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p className="text-xs text-navy-600 shrink-0">対象の時間帯</p>
            <select
              value={startHour}
              onChange={(e) => onChangeStartHour(parseInt(e.target.value))}
              className="rounded-md border border-navy-200 bg-white text-navy-900 px-2 py-1.5 text-sm"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{h}時</option>
              ))}
            </select>
            <span className="text-xs text-navy-500">〜</span>
            <select
              value={endHour}
              onChange={(e) => onChangeEndHour(parseInt(e.target.value))}
              className="rounded-md border border-navy-200 bg-white text-navy-900 px-2 py-1.5 text-sm"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{h}時</option>
              ))}
            </select>
          </div>
          {startHour > endHour && (
            <p className="text-[11px] text-navy-400">翌日{endHour}時までの深夜帯として扱われます</p>
          )}
        </div>
      )}
    </div>
  )
}
