import { AlertCircle } from 'lucide-react'
import { useConnectionNotices } from '../hooks/useConnectionNotices'
import { googleLoginUrl, outlookLoginUrl } from '../lib/api'

const PROVIDER_LABEL = { google: 'Google Calendar', outlook: 'Outlook' } as const

/** カレンダー連携（Google/Outlook）が壊れている場合に、再連携を促すバナー。
 * Chat/Home/Scheduleの各画面共通。connection_stateが「一度も連携したことが無い」の
 * 場合は表示しない（そもそも使っていないプロバイダに再連携を勧めても意味が無いため）。
 */
const reconnect = async (provider: 'google' | 'outlook') => {
  const url = provider === 'google' ? await googleLoginUrl() : await outlookLoginUrl()
  window.location.href = url
}

export function ConnectionNoticeBanner() {
  const { notices, dismiss } = useConnectionNotices()
  const broken = (['google', 'outlook'] as const).filter((p) => notices[p])
  if (broken.length === 0) return null

  return (
    <div className="space-y-2">
      {broken.map((provider) => (
        <div
          key={provider}
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5"
        >
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-800 leading-relaxed">
              {PROVIDER_LABEL[provider]}との連携が切れております。ご予定の確認・登録ができない状態でございます。
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => reconnect(provider)}
                className="text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
              >
                再連携する
              </button>
              <button
                type="button"
                onClick={() => dismiss(provider)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                このカレンダーは使わない
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
