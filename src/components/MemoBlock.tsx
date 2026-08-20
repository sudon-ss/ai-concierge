import clsx from 'clsx'
import { AlertCircle, Sparkles, Flag, FlagOff } from 'lucide-react'
import type { CalendarEvent } from '../types'

interface Props {
  event: CalendarEvent
  onToggleFlag?: (id: string) => void
}

export function MemoBlock({ event, onToggleFlag }: Props) {
  if (!event.memo) {
    // このコンポーネントは予定カード（クリックで編集画面を開く要素）の中に描画されるため、
    // ここに<button>をネストすると無効なHTMLになりクリックが効かなくなる。カード自体の
    // クリックで編集画面が開き、そこでメモを追加できるので、ここは案内表示だけにする。
    return (
      <span className="text-xs text-navy-400 hover:text-navy-700 underline-offset-2 hover:underline">
        ＋ メモを追加
      </span>
    )
  }

  const isCritical = event.memoFlagged || event.memoPriority === 'critical'
  const isHigh = !isCritical && event.memoPriority === 'high'

  return (
    <div
      className={clsx(
        'mt-2 rounded-md px-3 py-2 text-sm border',
        isCritical && 'bg-red-50 border-red-300 text-red-900',
        isHigh && 'bg-gold-50 border-gold-300 text-navy-900',
        !isCritical && !isHigh && 'bg-cream-50 border-navy-100 text-navy-700',
      )}
    >
      <div className="flex items-start gap-2">
        {isCritical ? (
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
        ) : isHigh ? (
          <Sparkles size={16} className="mt-0.5 shrink-0 text-gold-600" />
        ) : null}
        <div className="flex-1">
          <div className="flex flex-wrap gap-1 mb-1">
            {isCritical && (
              <span className="badge bg-red-700 text-white">緊急</span>
            )}
            {isHigh && (
              <span className="badge bg-gold-500 text-navy-900 font-semibold">AI判定：重要</span>
            )}
          </div>
          <p className="leading-relaxed whitespace-pre-wrap">{event.memo}</p>
          {onToggleFlag && (
            <button
              type="button"
              onClick={() => onToggleFlag(event.id)}
              className={clsx(
                'mt-2 inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 transition',
                isCritical
                  ? 'bg-white text-red-700 hover:bg-red-100 border border-red-200'
                  : 'bg-white text-navy-700 hover:bg-navy-50 border border-navy-200',
              )}
            >
              {isCritical ? <FlagOff size={12} /> : <Flag size={12} />}
              {isCritical ? '緊急フラグを解除' : '緊急フラグを立てる'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
