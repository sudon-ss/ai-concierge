import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mic, MapPin, Clock, ChevronRight } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { Wordmark } from '../components/Wordmark'
import { ConciergeMark } from '../components/ConciergeMark'
import { getSession, hasBackend, listEvents } from '../lib/api'
import type { CalendarEvent } from '../types'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

export function HomePage() {
  const { events: demoEvents, profile } = useProfile()
  const navigate = useNavigate()

  // 実バックエンド接続時は、Phase 0のデモ予定ではなく実際に連携済みのカレンダーを使う
  const backendMode = hasBackend() && Boolean(getSession())
  const [realEvents, setRealEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    if (!backendMode) return
    listEvents()
      .then((apiEvents) =>
        setRealEvents(
          apiEvents.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            source: e.source,
            location: e.location,
          })),
        ),
      )
      .catch(() => {})
  }, [backendMode])

  const events = backendMode ? realEvents : demoEvents

  const nextEvent = useMemo(() => {
    const now = Date.now()
    // 配列の並び順（APIの返却順・追加順）に依存せず、開始時刻が最も近い未来の予定を選ぶ。
    // GoogleはUTCオフセット付き、Outlookはオフセットなしの日時文字列を返すことがあり、
    // 文字列のまま比較すると正しい順序にならないため、Dateとしてパースしてから比較する
    const upcoming = events
      .filter((e) => new Date(e.start).getTime() > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    // デモモードのみ、未来の予定が無い場合に先頭へフォールバックする（見た目のデモ用）
    return upcoming[0] ?? (backendMode ? undefined : events[0])
  }, [events, backendMode])

  // 音声が認識されたら chat ページに遷移して送信
  const { supported, isStandalone, isListening, interimText, error, start, stop } = useSpeechRecognition({
    onFinalResult: (text) => {
      sessionStorage.setItem('concierge.pendingMessage', text)
      navigate('/chat')
    },
  })

  const onMicClick = () => {
    if (!supported || isStandalone) {
      navigate('/chat')
      return
    }
    if (isListening) stop()
    else start()
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
      {/* ロゴエリア */}
      <div className="flex flex-col items-center pt-6 pb-8">
        <Wordmark size="lg" tone="dark" shimmer />
        <p className="text-xs text-navy-600 mt-3 tracking-wider">
          {profile.label} 様 へ
        </p>
      </div>

      {/* マイクボタン */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          {/* 音波装飾 */}
          {isListening ? (
            <>
              <span className="absolute inset-0 rounded-full border-2 border-gold-400 animate-ping" />
              <span className="absolute -inset-3 rounded-full border border-gold-300/50 animate-wave-pulse" />
              <span className="absolute -inset-6 rounded-full border border-gold-200/40 animate-wave-pulse" style={{ animationDelay: '0.4s' }} />
            </>
          ) : (
            /* 待機時：ゴールドリングが微かに明滅 */
            <span className="absolute -inset-2 rounded-full border border-gold-300/30 animate-gold-shimmer pointer-events-none" />
          )}
          <button
            type="button"
            onClick={onMicClick}
            disabled={!supported}
            className="relative size-24 rounded-full bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center shadow-gold-lg ring-4 ring-gold-400/60 hover:ring-gold-500/80 transition disabled:opacity-50"
            aria-label="音声入力"
          >
            <Mic size={36} className="text-gold-300" />
          </button>
        </div>
        <p className="serif text-navy-800 mt-5 text-base">
          {isListening
            ? interimText || 'お伺いしております...'
            : 'ご指示をお聞かせください'}
        </p>
        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
        {!supported && (
          <p className="text-xs text-navy-500 mt-2">
            音声入力非対応のブラウザです。チャット画面からご入力ください。
          </p>
        )}
        {supported && isStandalone && (
          <p className="text-xs text-navy-500 mt-2">
            ホーム画面に追加したアプリでは音声入力がご利用いただけません。チャット画面からご入力いただくか、Safariで直接開いてお試しください。
          </p>
        )}
      </div>

      <div className="gold-divider my-6" />

      {/* 次の重要なご予定 */}
      {nextEvent && (
        <Link
          to="/calendar"
          className="block bg-navy-900 text-white rounded-xl p-4 shadow-gold-lg hover:bg-navy-800 transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
              Next Appointment
            </p>
            <ChevronRight size={16} className="text-gold-400 group-hover:translate-x-0.5 transition" />
          </div>
          <div className="flex items-start gap-3">
            <ConciergeMark size={36} variant="plain" className="shrink-0 mt-1" />
            <div className="flex-1">
              <p className="serif text-2xl text-gold-200 tabular-nums">
                {fmtTime(nextEvent.start)}
              </p>
              <p className="text-sm text-white mt-1">{nextEvent.title}</p>
              {nextEvent.location && (
                <p className="text-xs text-gold-300 mt-1 inline-flex items-center gap-1">
                  <MapPin size={11} /> {nextEvent.location}
                </p>
              )}
            </div>
          </div>
        </Link>
      )}

      {/* クイックアクション */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Link
          to="/calendar"
          className="card p-3 text-center hover:border-gold-300 transition"
        >
          <Clock size={18} className="mx-auto text-gold-600 mb-1" />
          <p className="text-xs font-medium text-navy-900">本日のご予定</p>
        </Link>
        <Link
          to="/chat"
          className="card p-3 text-center hover:border-gold-300 transition"
        >
          <Mic size={18} className="mx-auto text-gold-600 mb-1" />
          <p className="text-xs font-medium text-navy-900">会話履歴を見る</p>
        </Link>
      </div>

      {/* フッターメモ */}
      <p className="text-center text-[10px] text-navy-400 mt-8 tracking-widest serif">
        At your service, 24 hours a day.
      </p>
    </div>
  )
}
