import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { getBrowserOffline, getStaleAt, subscribeStale } from '../lib/offlineCache'

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 通信できないときのお知らせ。「見るだけ」であり、操作（空き時間の確認・チャットでのご相談・
 * ご予定やタスクの登録／変更／削除）はできないことを、はっきり伝える。
 * 古い情報が最新のように見えないよう、表示しているのがいつ時点の情報かも示す。 */
export function OfflineBanner() {
  const staleAt = useSyncExternalStore(subscribeStale, getStaleAt)
  const browserOffline = useSyncExternalStore(subscribeStale, getBrowserOffline)
  if (staleAt === null && !browserOffline) return null

  return (
    <div className="shrink-0 flex items-start gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2" role="status">
      <WifiOff size={14} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-amber-900 leading-relaxed">
        <p>
          {staleAt !== null ? (
            <>
              通信できないため、<b>{fmt(staleAt)}</b>時点の情報を<b>表示のみ</b>しております。
            </>
          ) : (
            <b>通信できません。</b>
          )}
        </p>
        <p className="mt-0.5">
          この状態では、空き時間のご確認・チャットでのご相談・ご予定やタスクの登録／変更／削除はできません。
          <b>通信できる場所で、あらためてお試しくださいませ。</b>
        </p>
      </div>
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
