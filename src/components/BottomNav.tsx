import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, ListChecks, UserCog, MessageCircle } from 'lucide-react'
import clsx from 'clsx'

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/calendar', label: 'Schedule', icon: CalendarDays },
  { to: '/tasks', label: 'Task', icon: ListChecks },
  { to: '/settings', label: 'Profile', icon: UserCog },
]

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-30 bg-navy-900 text-white border-t border-gold-500/20 pb-[env(safe-area-inset-bottom)]">
      <div className="gold-divider" />
      <ul className="max-w-2xl mx-auto grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] tracking-wider transition',
                  isActive ? 'text-gold-400' : 'text-white/60 hover:text-white',
                )
              }
            >
              <Icon size={20} strokeWidth={1.5} />
              <span className="uppercase">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
