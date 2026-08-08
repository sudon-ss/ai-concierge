import clsx from 'clsx'
import { Bell, Calendar as CalIcon, Clock, Sparkles, UserCog, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ProfileSelector } from '../components/ProfileSelector'
import { CalendarSelector } from '../components/CalendarSelector'
import { useSettings, BRIEFING_TIME_OPTIONS, formatBriefingTime } from '../hooks/useSettings'
import { useCalendarsData } from '../hooks/useCalendarsData'
import { googleLoginUrl, outlookLoginUrl, clearSession } from '../lib/api'

interface ToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        {description && <p className="text-xs text-navy-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-gold-500' : 'bg-navy-200',
        )}
        aria-label={checked ? 'オフにする' : 'オンにする'}
      >
        <span
          className={clsx(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition',
            checked ? 'left-[calc(100%-1.375rem)]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings, updateCalendar, setOnboarded } = useSettings()

  const restartOnboarding = () => {
    if (window.confirm('初期セットアップをやり直してもよろしいでしょうか？')) {
      setOnboarded(false)
      navigate('/onboarding')
    }
  }

  const { backendConnected, calendarsData, refreshCalendars } = useCalendarsData(
    settings.calendarConnected.google,
    settings.calendarConnected.outlook,
  )

  const handleToggleCalendar = (provider: 'google' | 'outlook') => {
    const connected = settings.calendarConnected[provider]
    if (!backendConnected) {
      // バックエンド未設定（VITE_API_BASE_URL未設定）時はデモ用のローカルトグルのまま
      updateCalendar(provider, !connected)
      return
    }
    if (connected) {
      // 解除はローカル表示上のみ（サーバー側のトークン取り消しはPhase 1後続タスク）
      updateCalendar(provider, false)
      clearSession()
      return
    }
    window.location.href = provider === 'google' ? googleLoginUrl() : outlookLoginUrl()
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-600">Profile</p>
        <h2 className="serif text-2xl text-navy-900">設定</h2>
      </div>

      <section className="card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800 pb-3">
          <UserCog size={16} className="text-gold-600" /> デモプロファイル
          <span className="badge bg-gold-100 text-gold-800 ml-auto">Demo</span>
        </h3>
        <p className="text-xs text-navy-600 mb-3">
          投資家・営業先によって見せたいシナリオを切替できます。
        </p>
        <ProfileSelector />
      </section>

      <section className="card p-4 divide-y divide-navy-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800 pb-2">
          <CalIcon size={16} className="text-gold-600" /> カレンダー連携
        </h3>
        <div className="py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-navy-900">Google Calendar</p>
            <p className={clsx('text-xs', settings.calendarConnected.google ? 'text-gold-700' : 'text-navy-400')}>
              {settings.calendarConnected.google
                ? backendConnected
                  ? '連携中'
                  : '連携中（デモ）'
                : '未連携'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleCalendar('google')}
            className={clsx(
              'text-xs font-semibold rounded-md px-3 py-1.5',
              settings.calendarConnected.google
                ? 'bg-gold-500 text-navy-900 hover:bg-gold-600'
                : 'btn-secondary',
            )}
          >
            {settings.calendarConnected.google ? '解除' : '連携する'}
          </button>
        </div>
        {calendarsData && (
          <CalendarSelector provider="google" state={calendarsData.google} onChanged={refreshCalendars} />
        )}
        <div className="py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-navy-900">Outlook (Microsoft 365)</p>
            <p className={clsx('text-xs', settings.calendarConnected.outlook ? 'text-gold-700' : 'text-navy-400')}>
              {settings.calendarConnected.outlook
                ? backendConnected
                  ? '連携中'
                  : '連携中（デモ）'
                : '未連携'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleCalendar('outlook')}
            className={clsx(
              'text-xs font-semibold rounded-md px-3 py-1.5',
              settings.calendarConnected.outlook
                ? 'bg-gold-500 text-navy-900 hover:bg-gold-600'
                : 'btn-secondary',
            )}
          >
            {settings.calendarConnected.outlook ? '解除' : '連携する'}
          </button>
        </div>
        {calendarsData && (
          <CalendarSelector provider="outlook" state={calendarsData.outlook} onChanged={refreshCalendars} />
        )}
      </section>

      <section className="card p-4 divide-y divide-navy-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800 pb-2">
          <Clock size={16} className="text-gold-600" /> 朝のブリーフィング
        </h3>
        <Toggle
          label="ブリーフィングを有効にする"
          description="毎朝この時刻に本日のご予定とタスクをご報告"
          checked={settings.briefingEnabled}
          onChange={(v) => updateSettings({ briefingEnabled: v })}
        />
        <div className="py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-navy-900">通知時刻</p>
            <p className="text-xs text-navy-500">毎朝この時刻にお知らせ</p>
          </div>
          <select
            value={settings.briefingTime}
            onChange={(e) => updateSettings({ briefingTime: e.target.value })}
            disabled={!settings.briefingEnabled}
            className="rounded-md border border-navy-200 bg-white text-navy-900 px-2 py-1.5 text-sm disabled:opacity-50"
          >
            {BRIEFING_TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {formatBriefingTime(t)}
              </option>
            ))}
          </select>
        </div>
        <Toggle
          label="AIによるメモ重要度判定"
          description="メモから重要事項を判定して強調表示"
          checked={settings.aiMemoJudgeEnabled}
          onChange={(v) => updateSettings({ aiMemoJudgeEnabled: v })}
        />
      </section>

      <section className="card p-4 divide-y divide-navy-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800 pb-2">
          <Bell size={16} className="text-gold-600" /> リマインダー
        </h3>
        <Toggle
          label="リマインダーを有効にする"
          description="ご予定の前にお知らせいたします"
          checked={settings.notificationEnabled}
          onChange={(v) => updateSettings({ notificationEnabled: v })}
        />
        <div className="py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-navy-900">ご予定の何分前にお知らせするか</p>
          </div>
          <select
            value={settings.reminderMinutes}
            onChange={(e) => updateSettings({ reminderMinutes: parseInt(e.target.value) })}
            disabled={!settings.notificationEnabled}
            className="rounded-md border border-navy-200 bg-white text-navy-900 px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value={5}>5分前</option>
            <option value={10}>10分前</option>
            <option value={15}>15分前</option>
            <option value={30}>30分前</option>
            <option value={60}>1時間前</option>
          </select>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800 pb-2">
          <Sparkles size={16} className="text-gold-600" /> プラン
        </h3>
        <div className="rounded-md bg-navy-50 border border-gold-200 p-3">
          <p className="text-xs text-gold-700 font-semibold">Phase 0 デモ版</p>
          <p className="text-sm text-navy-900 mt-1 serif">投資家・営業デモ用プロトタイプ</p>
        </div>
      </section>

      <button
        type="button"
        onClick={restartOnboarding}
        className="w-full inline-flex items-center justify-center gap-2 text-xs text-navy-500 hover:text-gold-600 py-3"
      >
        <RefreshCw size={12} /> 初期セットアップをやり直す
      </button>

      <p className="text-center text-xs text-navy-400 py-2 tracking-widest serif">
        THE CONCIERGE v0.2.0
      </p>
    </div>
  )
}
