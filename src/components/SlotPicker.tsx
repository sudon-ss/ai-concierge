import { useState } from 'react'
import { Check, X, Clock, MapPin, Copy, CalendarClock, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import type { CalendarEvent, FreeSlot } from '../types'

interface Props {
  question: string
  slots: FreeSlot[]
  title?: string
  defaultLocation?: string
  /** 仮押さえ済みの場合セットされるグループID */
  tentativeGroupId?: string
  onConfirm: (slot: FreeSlot, calendar: CalendarEvent['source'], location: string) => void
  onCancel: () => void
  /** 全枠を仮押さえするコールバック */
  onBlockAll?: () => void
  /** 未連携のカレンダーへの登録ボタンを無効化するために使用 */
  googleConnected?: boolean
  outlookConnected?: boolean
}

/** 相手に送れる日程調整文章を生成 */
const buildCopyText = (slots: FreeSlot[]): string => {
  const nums = ['①', '②', '③', '④', '⑤']
  const lines = slots.map((s, i) => `${nums[i] ?? `${i + 1}.`} ${s.label}`).join('\n')
  return [
    'お世話になっております。',
    '以下の日程でご都合いかがでしょうか。',
    '',
    lines,
    '',
    'ご都合のよい枠をご返信いただければ、こちらで調整いたします。',
    'よろしくお願いいたします。',
  ].join('\n')
}

export function SlotPicker({
  question,
  slots,
  title = '新しいご予定',
  defaultLocation = '',
  tentativeGroupId,
  onConfirm,
  onCancel,
  onBlockAll,
  googleConnected = true,
  outlookConnected = true,
}: Props) {
  const [selected, setSelected] = useState<FreeSlot | null>(null)
  const [location, setLocation] = useState<string>(defaultLocation)
  const [copied, setCopied] = useState(false)

  const isBlocked = Boolean(tentativeGroupId)
  const copyText = buildCopyText(slots)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // fallback
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-800 whitespace-pre-line">{question}</p>

      {/* ── 候補枠リスト ── */}
      <div className="space-y-2">
        {slots.map((slot, i) => {
          const isActive = selected?.start === slot.start
          return (
            <div
              key={i}
              className={clsx(
                'rounded-md border transition overflow-hidden',
                isActive ? 'border-gold-400 bg-gold-50/60' : 'border-navy-100 bg-white',
              )}
            >
              {/* 枠ヘッダー行 */}
              <div
                role={!isBlocked ? 'button' : undefined}
                tabIndex={!isBlocked ? 0 : undefined}
                onClick={!isBlocked ? () => setSelected(isActive ? null : slot) : undefined}
                onKeyDown={
                  !isBlocked
                    ? (e) => e.key === 'Enter' && setSelected(isActive ? null : slot)
                    : undefined
                }
                className={clsx(
                  'px-3 py-2.5 flex items-center gap-2',
                  !isBlocked && 'cursor-pointer select-none',
                )}
              >
                <Clock size={16} className={isActive ? 'text-gold-600' : 'text-navy-400'} />
                <span className="font-medium text-navy-900 text-sm tabular-nums flex-1">
                  {slot.label}
                </span>

                {/* 仮押さえなし＋選択中 */}
                {!isBlocked && isActive && <Check size={16} className="text-gold-600" />}

                {/* 仮押さえ済み：本確定ボタン or チェック */}
                {isBlocked && !isActive && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelected(slot) }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-navy-700 hover:bg-navy-800 rounded px-2.5 py-1.5 transition"
                  >
                    <CheckCircle2 size={12} />
                    本確定
                  </button>
                )}
                {isBlocked && isActive && <Check size={16} className="text-gold-600" />}
              </div>

              {/* 展開パネル（選択時） */}
              {isActive && (
                <div className="border-t border-gold-200 bg-cream-50 p-2 space-y-2">
                  <label className="flex items-center gap-2 rounded-md border border-navy-200 bg-white px-2 py-1.5">
                    <MapPin size={14} className="text-navy-400 shrink-0" />
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="場所（任意）"
                      className="flex-1 text-sm focus:outline-none bg-transparent"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!googleConnected}
                      onClick={() => onConfirm(slot, 'google', location.trim())}
                      className={clsx(
                        'text-sm font-medium rounded-md py-2 transition',
                        googleConnected
                          ? 'bg-navy-700 text-white hover:bg-navy-800'
                          : 'bg-navy-100 text-navy-300 cursor-not-allowed pointer-events-none',
                      )}
                    >
                      Googleへ登録
                    </button>
                    <button
                      type="button"
                      disabled={!outlookConnected}
                      onClick={() => onConfirm(slot, 'outlook', location.trim())}
                      className={clsx(
                        'text-sm font-medium rounded-md py-2 transition',
                        outlookConnected
                          ? 'bg-navy-600 text-white hover:bg-navy-700'
                          : 'bg-navy-100 text-navy-300 cursor-not-allowed pointer-events-none',
                      )}
                    >
                      Outlookへ登録
                    </button>
                    <button
                      type="button"
                      disabled={!(googleConnected && outlookConnected)}
                      onClick={() => onConfirm(slot, 'both', location.trim())}
                      className={clsx(
                        'text-sm font-medium rounded-md py-2 transition col-span-2',
                        googleConnected && outlookConnected
                          ? 'bg-gradient-to-r from-gold-500 to-gold-400 text-navy-900 hover:from-gold-600 hover:to-gold-500'
                          : 'bg-navy-100 text-navy-300 cursor-not-allowed pointer-events-none',
                      )}
                    >
                      {isBlocked ? '本確定（他の仮押さえを削除）' : '両方へ登録'}
                    </button>
                  </div>
                  {/* 本確定時はキャンセルで折りたたむだけ */}
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs text-slate-400 hover:text-navy-600 mt-1"
                  >
                    ← 戻る
                  </button>
                </div>
              )}

            </div>
          )
        })}
      </div>

      {/* ── 調整文章プレビュー ── */}
      <div className="rounded-md border border-navy-100 bg-cream-50/60 overflow-hidden">
        <p className="text-[10px] font-semibold tracking-widest text-navy-400 uppercase px-3 pt-2.5 pb-1">
          調整文はこちら
        </p>
        <pre className="px-3 pb-3 text-[12.5px] leading-relaxed text-navy-800 whitespace-pre-wrap font-sans">
          {copyText}
        </pre>
        <div className="border-t border-navy-100 px-3 py-2 flex items-center justify-between bg-white">
          <p className="text-[11px] text-navy-400">メール・LINE にそのまま貼り付けできます</p>
          <button
            type="button"
            onClick={handleCopy}
            className={clsx(
              'inline-flex items-center gap-1.5 text-xs font-semibold rounded-md border px-3 py-1.5 transition',
              copied
                ? 'bg-gold-50 border-gold-400 text-gold-700'
                : 'bg-white border-navy-300 text-navy-700 hover:bg-cream-100',
            )}
          >
            <Copy size={12} />
            {copied ? 'コピーしました ✓' : 'コピー'}
          </button>
        </div>
      </div>

      {/* ── 仮押さえボタン（未押さえ時のみ） ── */}
      {onBlockAll && !isBlocked && (
        <button
          type="button"
          onClick={onBlockAll}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md border py-2.5 transition bg-white border-navy-200 text-navy-700 hover:bg-cream-100"
        >
          <CalendarClock size={13} />
          {slots.length}枠をカレンダーに仮押さえ
        </button>
      )}

      {/* ── フッター ── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-navy-700"
        >
          <X size={12} />
          {isBlocked ? '仮押さえをすべて解除' : 'キャンセル'}
        </button>
        <p className="text-[11px] text-slate-400 italic truncate ml-2">件名: {title}</p>
      </div>
    </div>
  )
}
