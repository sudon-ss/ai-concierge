import clsx from 'clsx'
import type { CalendarSource } from '../types'

interface Props {
  source: CalendarSource | 'both'
  size?: 'sm' | 'md'
}

const styles: Record<string, string> = {
  google: 'bg-navy-50 text-navy-700 border-navy-200',
  outlook: 'bg-navy-100 text-navy-800 border-navy-300',
  both: 'bg-gold-100 text-gold-800 border-gold-300',
}

const labels: Record<string, string> = {
  google: 'Google',
  outlook: 'Outlook',
  both: '両方',
}

export function CalendarBadge({ source, size = 'sm' }: Props) {
  return (
    <span
      className={clsx(
        'badge border',
        styles[source],
        size === 'sm' ? 'text-[10px]' : 'text-xs',
      )}
    >
      {labels[source]}
    </span>
  )
}
