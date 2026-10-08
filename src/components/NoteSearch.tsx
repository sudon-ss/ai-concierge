import { useState } from 'react'
import { Search, FileText } from 'lucide-react'
import clsx from 'clsx'
import { searchNotes, type ApiNote } from '../lib/api'
import { isOffline, OFFLINE_ACTION_MESSAGE } from '../lib/offlineCache'

type Hit = ApiNote

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 会議メモの検索。キーワードと期間で探し、結果を押すと、その会議の日の予定表示へ移動する。 */
export function NoteSearch({ onJump }: { onJump: (date: Date) => void }) {
  const [q, setQ] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    if (isOffline()) {
      setError(OFFLINE_ACTION_MESSAGE)
      return
    }
    if (!q.trim() && !start && !end) {
      setError('キーワードか期間を入力してください。')
      return
    }
    setBusy(true)
    setError(null)
    searchNotes({ q: q.trim() || undefined, start: start || undefined, end: end || undefined })
      .then((rows) => setHits(rows))
      .catch((e: Error) =>
        setError(/503/.test(e.message) ? 'メモ機能は準備中です。しばらくしてからお試しください。' : '検索に失敗いたしました。'),
      )
      .finally(() => setBusy(false))
  }

  return (
    <details className="card p-3 group">
      <summary className="cursor-pointer select-none text-xs font-medium text-navy-700 flex items-center gap-1.5">
        <FileText size={13} className="text-gold-600" /> 会議メモを探す
      </summary>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="キーワード（例：見積 清原）"
            className="flex-1 min-w-0 rounded-md border border-navy-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-1 rounded-md bg-navy-800 text-gold-300 text-xs font-semibold px-3 disabled:opacity-50"
          >
            <Search size={12} /> {busy ? '検索中…' : '検索'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-navy-600">
          <span className="shrink-0">期間</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border border-navy-200 px-2 py-1" />
          <span>〜</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-md border border-navy-200 px-2 py-1" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hits && hits.length === 0 && !error && <p className="text-xs text-navy-500">該当するメモはございません。</p>}
        {hits && hits.length > 0 && (
          <ul className="space-y-1.5">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onJump(new Date(h.start))}
                  className={clsx(
                    'w-full text-left rounded-md border px-3 py-2 hover:border-gold-300 transition',
                    h.flagged || h.priority === 'critical'
                      ? 'border-red-300 bg-red-50'
                      : h.priority === 'high'
                        ? 'border-gold-300 bg-gold-50'
                        : 'border-navy-100 bg-white',
                  )}
                >
                  <p className="text-[11px] text-navy-500 tabular-nums">{fmt(h.start)}</p>
                  <p className="text-sm font-medium text-navy-900">{h.title}</p>
                  <p className="text-xs text-navy-600 mt-0.5 whitespace-pre-wrap">{h.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
