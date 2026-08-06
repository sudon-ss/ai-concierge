import clsx from 'clsx'
import { ConciergeMark } from './ConciergeMark'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  showMark?: boolean
  className?: string
  tone?: 'light' | 'dark'
  shimmer?: boolean
}

const SIZE_MAP = {
  sm: { mark: 20, title: 'text-base tracking-[0.22em]' },
  md: { mark: 28, title: 'text-2xl tracking-[0.25em]' },
  lg: { mark: 44, title: 'text-4xl tracking-[0.28em]' },
} as const

/**
 * THE CONCIERGE のロゴワードマーク。マーク + テキスト。
 * shimmer=true で文字色にゴールドの薄いシマーが乗る（上品なアイドルアニメ）。
 */
export function Wordmark({
  size = 'md',
  showMark = true,
  className,
  tone = 'dark',
  shimmer = false,
}: Props) {
  const cfg = SIZE_MAP[size]
  return (
    <div className={clsx('flex flex-col items-center gap-1.5', className)}>
      {showMark && (
        <ConciergeMark
          size={cfg.mark}
          variant="plain"
          className={shimmer ? 'animate-gold-shimmer' : undefined}
        />
      )}
      <div
        className={clsx(
          'serif uppercase font-medium leading-none',
          cfg.title,
          tone === 'light' ? 'text-white' : 'text-navy-900',
        )}
      >
        <div>The Concierge</div>
      </div>
    </div>
  )
}
