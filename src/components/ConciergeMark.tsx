import clsx from 'clsx'

interface Props {
  size?: number
  variant?: 'badge' | 'plain'
  className?: string
}

/**
 * THE CONCIERGE のシンボル：Les Clefs d'Or（金の鍵）モチーフのクロスキー。
 * badge: ネイビー背景＋ゴールド線（タイル用）
 * plain: 透過背景＋ゴールド線のみ（インライン用）
 */
export function ConciergeMark({ size = 48, variant = 'badge', className }: Props) {
  if (variant === 'plain') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className={clsx(className)}
      >
        <defs>
          <linearGradient id="cmark-gold-plain" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ead498" />
            <stop offset="50%" stopColor="#d4ac4a" />
            <stop offset="100%" stopColor="#a98442" />
          </linearGradient>
        </defs>
        <g transform="translate(32 32)">
          <g transform="rotate(45)" stroke="url(#cmark-gold-plain)" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <circle cx="-15" cy="0" r="5" fill="none" />
            <circle cx="-15" cy="0" r="1.6" fill="url(#cmark-gold-plain)" stroke="none" />
            <line x1="-10" y1="0" x2="17" y2="0" />
            <line x1="10" y1="0" x2="10" y2="4" />
            <line x1="14" y1="0" x2="14" y2="4" />
            <line x1="17" y1="0" x2="17" y2="3" />
          </g>
          <g transform="rotate(-45)" stroke="url(#cmark-gold-plain)" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <circle cx="-15" cy="0" r="5" fill="none" />
            <circle cx="-15" cy="0" r="1.6" fill="url(#cmark-gold-plain)" stroke="none" />
            <line x1="-10" y1="0" x2="17" y2="0" />
            <line x1="10" y1="0" x2="10" y2="4" />
            <line x1="14" y1="0" x2="14" y2="4" />
            <line x1="17" y1="0" x2="17" y2="3" />
          </g>
        </g>
      </svg>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={clsx('drop-shadow-sm', className)}
    >
      <defs>
        <linearGradient id="cmark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#162e4d" />
          <stop offset="100%" stopColor="#050f1e" />
        </linearGradient>
        <linearGradient id="cmark-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ead498" />
          <stop offset="50%" stopColor="#d4ac4a" />
          <stop offset="100%" stopColor="#a98442" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="10" fill="url(#cmark-bg)" />
      <rect x="3" y="3" width="58" height="58" rx="8" fill="none" stroke="url(#cmark-gold)" strokeWidth="0.6" opacity="0.6" />
      <g transform="translate(32 32)">
        <g transform="rotate(45)" stroke="url(#cmark-gold)" strokeWidth="2" fill="none" strokeLinecap="round">
          <circle cx="-15" cy="0" r="5" fill="#050f1e" />
          <circle cx="-15" cy="0" r="2" fill="url(#cmark-gold)" stroke="none" />
          <line x1="-10" y1="0" x2="17" y2="0" />
          <line x1="10" y1="0" x2="10" y2="4" />
          <line x1="14" y1="0" x2="14" y2="4" />
          <line x1="17" y1="0" x2="17" y2="3" />
        </g>
        <g transform="rotate(-45)" stroke="url(#cmark-gold)" strokeWidth="2" fill="none" strokeLinecap="round">
          <circle cx="-15" cy="0" r="5" fill="#050f1e" />
          <circle cx="-15" cy="0" r="2" fill="url(#cmark-gold)" stroke="none" />
          <line x1="-10" y1="0" x2="17" y2="0" />
          <line x1="10" y1="0" x2="10" y2="4" />
          <line x1="14" y1="0" x2="14" y2="4" />
          <line x1="17" y1="0" x2="17" y2="3" />
        </g>
      </g>
    </svg>
  )
}
