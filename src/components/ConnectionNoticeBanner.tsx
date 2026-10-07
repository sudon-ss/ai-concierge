import { AlertCircle } from 'lucide-react'
import { useConnectionNotices } from '../hooks/useConnectionNotices'
import { getSession, googleLoginUrl, hasBackend, outlookLoginUrl } from '../lib/api'

const PROVIDER_LABEL = { google: 'Google Calendar', outlook: 'Outlook' } as const

const LINK_CLASS = 'text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900'

/** 連携用のURLは、ログイン中なら「追加連携用」の短命トークンをサーバーから取得して作るため非同期。
 * リンク（<a>）ではなくボタンにして、取得できてから遷移する。 */
async function startConnect(provider: 'google' | 'outlook') {
  window.location.href = provider === 'google' ? await googleLoginUrl() : await outlookLoginUrl()
}

/** カレンダー連携（Google/Outlook）が壊れている場合に、再連携を促すバナー。
 * Chat/Home/Scheduleの各画面共通。connection_stateが「一度も連携したことが無い」の
 * 場合は表示しない（そもそも使っていないプロバイダに再連携を勧めても意味が無いため）。
 */
export function ConnectionNoticeBanner() {
  const { notices, dismiss } = useConnectionNotices()
  const broken = (['google', 'outlook'] as const).filter((p) => notices[p])
  // 連携が壊れた記録が無くても、実際にはどのカレンダーも繋がっていない場合
  // （「解除」後・初回未連携など）は、再連携の導線を出す
  const noneConnected = !notices.connected.google && !notices.connected.outlook

  // ログインの有効期限が切れた（保存していたセッションが無い）場合。このとき各画面は見本（デモ）
  // データの表示に切り替わってしまうため、実データではないことと、再連携の導線を必ず出す
  if (hasBackend() && !getSession()) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
        <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-red-800 leading-relaxed">
            ログインの有効期限が切れております。下のボタンからもう一度ご連携ください（現在の表示は見本のデータで、実際のご予定ではございません）。
          </p>
          <div className="flex items-center gap-4 mt-1.5">
            <button type="button" onClick={() => startConnect('google')} className={LINK_CLASS}>
              Googleを連携する
            </button>
            <button type="button" onClick={() => startConnect('outlook')} className={LINK_CLASS}>
              Outlookを連携する
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (broken.length === 0 && noneConnected) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
        <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-red-800 leading-relaxed">
            カレンダーが連携されておりません。ご予定の確認・登録ができない状態でございます。
          </p>
          <div className="flex items-center gap-4 mt-1.5">
            <button type="button" onClick={() => startConnect('google')} className={LINK_CLASS}>
              Googleを連携する
            </button>
            <button type="button" onClick={() => startConnect('outlook')} className={LINK_CLASS}>
              Outlookを連携する
            </button>
          </div>
        </div>
      </div>
    )
  }

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
              <button type="button" onClick={() => startConnect(provider)} className={LINK_CLASS}>
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
