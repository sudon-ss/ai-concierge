import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { PROFILES, type ProfileId } from '../types/profile'

export function ProfileSelector() {
  const { profileId, setProfileId } = useProfile()
  const ids: ProfileId[] = ['ceo', 'director', 'cfo']

  return (
    <div className="space-y-2">
      {ids.map((id) => {
        const p = PROFILES[id]
        const isActive = profileId === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setProfileId(id)}
            className={clsx(
              'w-full text-left rounded-md border p-3 transition',
              isActive
                ? 'border-gold-400 bg-gold-50/40 shadow-gold'
                : 'border-navy-200 bg-white hover:border-navy-300',
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="serif text-lg text-navy-900">{p.label}</span>
                  {isActive && (
                    <span className="badge bg-gold-500 text-navy-900 font-semibold">
                      <Check size={10} /> ご選択中
                    </span>
                  )}
                </div>
                <p className="text-xs text-navy-700 mt-0.5">{p.tagline}</p>
                <p className="text-[11px] text-navy-400 mt-1">{p.description}</p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
