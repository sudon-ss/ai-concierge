import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { ConciergeMark } from './ConciergeMark'

interface Props {
  title: string
  minutesUntil: number
  onDismiss: () => void
}

export function FlashOverlay({ title, minutesUntil, onDismiss }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 animate-flash-pulse" />
      <div className="relative bg-navy-900 text-white p-6 mx-4 max-w-sm w-full text-center rounded-xl shadow-2xl border border-gold-500/40 animate-fade-in">
        <div className="flex justify-center mb-3">
          <ConciergeMark size={72} />
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-gold-400 mb-1">
          <Bell size={11} /> Reminder
        </div>
        <h3 className="serif text-xl text-white mt-1">{title}</h3>
        <div className="gold-divider my-3" />
        <p className="text-sm text-gold-100">
          {minutesUntil <= 0 ? 'お時間でございます' : `あと ${minutesUntil} 分でお時間です`}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full bg-gradient-to-r from-gold-500 to-gold-400 hover:from-gold-600 hover:to-gold-500 text-navy-900 font-semibold rounded-md py-3 transition tracking-wide"
        >
          承知いたしました
        </button>
      </div>
    </div>
  )
}
