import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { getStaleAt, subscribeStale } from '../lib/offlineCache'

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 通信できず、端末に保存した「最後に取得できた情報」を表示しているときのお知らせ。
 * 古い情報が最新のように見えてしまうのを防ぐため、いつ時点の情報かを必ず示す。 */
export function OfflineBanner() {
  const staleAt = useSyncExternalStore(subscribeStale, getStaleAt)
  if (staleAt === null) return null

  return (
    <div className="shrink-0 flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2" role="status">
      <WifiOff size={14} className="text-amber-600 shrink-0" />
      <p className="flex-1 text-xs text-amber-900 leading-relaxed">
        通信できないため、<b>{fmt(staleAt)}</b>時点の情報を表示しております。ご予定の登録・変更はできません。
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 text-xs font-semibold text-amber-800 underline underline-offset-2"
      >
        再読み込み
      </button>
    </div>
  )
}
