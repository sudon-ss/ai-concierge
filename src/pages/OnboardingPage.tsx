import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Bell, Calendar, Clock } from 'lucide-react'
import clsx from 'clsx'
import { useProfile } from '../hooks/useProfile'
import { useSettings, BRIEFING_TIME_OPTIONS, formatBriefingTime } from '../hooks/useSettings'
import { PROFILES, type ProfileId } from '../types/profile'
import { Wordmark } from '../components/Wordmark'
import { ConciergeMark } from '../components/ConciergeMark'

type StepId = 'welcome' | 'profile' | 'calendar' | 'notification' | 'done'
const STEPS: StepId[] = ['welcome', 'profile', 'calendar', 'notification', 'done']

export function OnboardingPage() {
  const navigate = useNavigate()
  const { profileId, setProfileId } = useProfile()
  const { settings, updateSettings, updateCalendar, setOnboarded } = useSettings()

  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]

  const next = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  const back = () => setStepIndex((i) => Math.max(i - 1, 0))

  // カレンダーステップは最低1つ連携しないと先へ進めない
  const calendarSelected =
    settings.calendarConnected.google || settings.calendarConnected.outlook
  const canProceed = step !== 'calendar' || calendarSelected

  const finish = () => {
    setOnboarded(true)
    navigate('/', { replace: true })
  }

  const skip = () => {
    setOnboarded(true)
    navigate('/', { replace: true })
  }

  return (
    <div className="h-full flex flex-col bg-cream-50 overflow-hidden">
      {/* プログレスバー（固定） */}
      {step !== 'welcome' && (
        <div className="shrink-0 px-6 pt-4 pb-1">
          <div className="max-w-md mx-auto w-full">
            <div className="flex items-center gap-2 mb-2">
              {STEPS.slice(1, -1).map((s, i) => (
                <div
                  key={s}
                  className={clsx(
                    'flex-1 h-0.5 rounded-full transition',
                    i + 1 <= stepIndex
                      ? 'bg-gradient-to-r from-gold-400 to-gold-500'
                      : 'bg-navy-100',
                  )}
                />
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-600 text-right">
              Step {Math.min(stepIndex, STEPS.length - 2)} / {STEPS.length - 2}
            </p>
          </div>
        </div>
      )}

      {/* コンテンツ（スクロール可能） */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-md mx-auto w-full min-h-full flex flex-col">
          {step === 'welcome' && <WelcomeStep />}
          {step === 'profile' && (
            <ProfileStep current={profileId} onSelect={setProfileId} />
          )}
          {step === 'calendar' && (
            <CalendarStep
              google={settings.calendarConnected.google}
              outlook={settings.calendarConnected.outlook}
              onToggle={updateCalendar}
            />
          )}
          {step === 'notification' && (
            <NotificationStep
              briefingTime={settings.briefingTime}
              reminderMinutes={settings.reminderMinutes}
              onChangeBriefing={(v) => updateSettings({ briefingTime: v })}
              onChangeReminder={(v) => updateSettings({ reminderMinutes: v })}
            />
          )}
          {step === 'done' && <DoneStep />}
        </div>
      </div>

      {/* ナビボタン（下部固定・セーフエリア確保） */}
      <div className="shrink-0 border-t border-navy-100 bg-cream-50 px-6 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="max-w-md mx-auto flex items-center gap-2">
          {step !== 'welcome' && step !== 'done' && stepIndex > 1 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1 text-sm text-navy-600 hover:text-navy-900 px-3 py-2"
            >
              <ChevronLeft size={16} /> 戻る
            </button>
          )}
          <div className="flex-1" />
          {step === 'welcome' && (
            <>
              <button
                type="button"
                onClick={skip}
                className="text-xs text-navy-500 hover:text-navy-700 px-3 py-2"
              >
                スキップ
              </button>
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1 text-sm font-semibold bg-gradient-to-r from-gold-500 to-gold-400 hover:from-gold-600 hover:to-gold-500 text-navy-900 rounded-md px-6 py-3"
              >
                はじめる <ChevronRight size={16} />
              </button>
            </>
          )}
          {(step === 'profile' || step === 'calendar' || step === 'notification') && (
            <button
              type="button"
              onClick={next}
              disabled={!canProceed}
              className="inline-flex items-center gap-1 text-sm font-semibold bg-navy-800 hover:bg-navy-900 text-gold-300 rounded-md px-6 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              次へ <ChevronRight size={16} />
            </button>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={finish}
              className="w-full inline-flex items-center justify-center gap-1 text-sm font-semibold bg-gradient-to-r from-gold-500 to-gold-400 hover:from-gold-600 hover:to-gold-500 text-navy-900 rounded-md px-6 py-3.5"
            >
              利用を開始する
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function WelcomeStep() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <Wordmark size="lg" tone="dark" shimmer />
      <div className="gold-divider w-32 my-6" />
      <p className="serif text-lg text-navy-800 leading-relaxed">
        お客様の声で動く、<br />
        24時間の専属コンシェルジュ
      </p>
      <p className="text-xs text-navy-500 mt-4 max-w-xs">
        スケジュール、タスク、ご予定の調整。<br />
        すべてご指示一つで承ります。
      </p>
    </div>
  )
}

function ProfileStep({
  current,
  onSelect,
}: {
  current: ProfileId
  onSelect: (id: ProfileId) => void
}) {
  const ids: ProfileId[] = ['ceo', 'director', 'cfo']
  return (
    <div>
      <h2 className="serif text-2xl text-navy-900">お立場をお選びくださいませ</h2>
      <p className="text-xs text-navy-600 mt-1 mb-6">
        お客様に最適なご提案のため、お立場をお伺いいたします。
      </p>
      <div className="space-y-3">
        {ids.map((id) => {
          const p = PROFILES[id]
          const isActive = current === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={clsx(
                'w-full text-left rounded-md border p-4 transition',
                isActive
                  ? 'border-gold-400 bg-gold-50/40 shadow-gold'
                  : 'border-navy-200 bg-white hover:border-navy-300',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{p.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="serif text-lg text-navy-900">{p.label}</span>
                    {isActive && (
                      <span className="badge bg-gold-500 text-navy-900 font-semibold">
                        <Check size={10} /> 選択中
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-navy-600 mt-0.5">{p.tagline}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CalendarStep({
  google,
  outlook,
  onToggle,
}: {
  google: boolean
  outlook: boolean
  onToggle: (provider: 'google' | 'outlook', connected: boolean) => void
}) {
  return (
    <div>
      <h2 className="serif text-2xl text-navy-900">カレンダーをご連携</h2>
      <p className="text-xs text-navy-600 mt-1 mb-6">
        ご利用のカレンダーをお選びくださいませ。後から変更も可能です。
      </p>
      <div className="space-y-3">
        <CalendarRow
          icon={<Calendar size={20} className="text-navy-700" />}
          label="Google Calendar"
          description="プライベート・社内予定の主流"
          connected={google}
          onToggle={(v) => onToggle('google', v)}
        />
        <CalendarRow
          icon={<Calendar size={20} className="text-navy-700" />}
          label="Outlook (Microsoft 365)"
          description="法人・Teams ご利用の方"
          connected={outlook}
          onToggle={(v) => onToggle('outlook', v)}
        />
      </div>
      {!google && !outlook && (
        <p className="text-xs text-gold-700 mt-4 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-gold-500 shrink-0" />
          先へお進みいただくには、いずれか1つ以上のご連携が必要でございます。
        </p>
      )}
      <p className="text-[11px] text-navy-400 italic mt-3">
        ※ Phase 0 ではテスト用カレンダーへ接続いたします
      </p>
    </div>
  )
}

function CalendarRow({
  icon,
  label,
  description,
  connected,
  onToggle,
}: {
  icon: React.ReactNode
  label: string
  description: string
  connected: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-md border p-3',
        connected ? 'border-gold-400 bg-gold-50/40' : 'border-navy-200 bg-white',
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        <p className="text-xs text-navy-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onToggle(!connected)}
        className={clsx(
          'shrink-0 text-xs font-semibold rounded-md px-3 py-1.5 transition',
          connected
            ? 'bg-gold-500 text-navy-900 hover:bg-gold-600'
            : 'bg-navy-800 text-gold-300 hover:bg-navy-900',
        )}
      >
        {connected ? '連携中' : '連携する'}
      </button>
    </div>
  )
}

function NotificationStep({
  briefingTime,
  reminderMinutes,
  onChangeBriefing,
  onChangeReminder,
}: {
  briefingTime: string
  reminderMinutes: number
  onChangeBriefing: (v: string) => void
  onChangeReminder: (v: number) => void
}) {
  return (
    <div>
      <h2 className="serif text-2xl text-navy-900">お知らせ設定</h2>
      <p className="text-xs text-navy-600 mt-1 mb-6">
        ご連絡のタイミングをお選びくださいませ。
      </p>
      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <Clock size={20} className="text-gold-600 shrink-0 mt-1" />
            <div className="flex-1">
              <p className="text-sm font-medium text-navy-900">朝のブリーフィング時刻</p>
              <p className="text-xs text-navy-500 mt-0.5 mb-2">
                毎朝この時刻に本日のご予定をお伝えいたします。
              </p>
              <select
                value={briefingTime}
                onChange={(e) => onChangeBriefing(e.target.value)}
                className="w-full rounded-md border border-navy-200 bg-white text-navy-900 px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
              >
                {BRIEFING_TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {formatBriefingTime(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-start gap-3">
            <Bell size={20} className="text-gold-600 shrink-0 mt-1" />
            <div className="flex-1">
              <p className="text-sm font-medium text-navy-900">リマインダー</p>
              <p className="text-xs text-navy-500 mt-0.5 mb-2">
                ご予定の何分前にお知らせするか
              </p>
              <select
                value={reminderMinutes}
                onChange={(e) => onChangeReminder(parseInt(e.target.value))}
                className="w-full rounded-md border border-navy-200 bg-white text-navy-900 px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
              >
                <option value={5}>5分前</option>
                <option value={10}>10分前</option>
                <option value={15}>15分前</option>
                <option value={30}>30分前</option>
                <option value={60}>1時間前</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DoneStep() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="mb-4 animate-gold-shimmer">
        <ConciergeMark size={80} />
      </div>
      <Wordmark size="md" tone="dark" showMark={false} shimmer />
      <div className="gold-divider w-32 my-6" />
      <p className="serif text-lg text-navy-800 leading-relaxed">
        ご準備が整いました
      </p>
      <p className="text-xs text-navy-500 mt-4 max-w-xs">
        お客様の専属コンシェルジュとして、<br />
        24時間お側でお仕えいたします
      </p>
    </div>
  )
}
