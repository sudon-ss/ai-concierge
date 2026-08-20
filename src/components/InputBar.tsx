import { useState } from 'react'
import { Mic, Send, MicOff, X } from 'lucide-react'
import clsx from 'clsx'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

interface Props {
  onSend: (text: string) => void
}

export function InputBar({ onSend }: Props) {
  const [value, setValue] = useState('')

  const { supported, isStandalone, isListening, interimText, error, start, stop, clearError } =
    useSpeechRecognition({
      onFinalResult: (text) => onSend(text),
    })

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  const toggleVoice = () => {
    clearError()
    if (isListening) stop()
    else start()
  }

  const voiceDisabled = !supported || isStandalone

  const placeholder = isListening
    ? interimText
      ? interimText
      : 'お伺いしております...'
    : 'ご指示をお聞かせください'

  return (
    <div className="sticky bottom-0 bg-white border-t border-gold-200/40 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
      {error && (
        <div className="max-w-2xl mx-auto mb-2">
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
              aria-label="閉じる"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto flex items-end gap-2">
        <button
          type="button"
          onClick={toggleVoice}
          disabled={voiceDisabled}
          title={
            !supported
              ? 'このブラウザは音声入力に対応していません'
              : isStandalone
              ? 'ホーム画面に追加したアプリでは音声入力がご利用いただけません。Safariで直接開いてお試しください。'
              : isListening
              ? '録音停止'
              : '音声入力'
          }
          className={clsx(
            'shrink-0 size-11 rounded-full flex items-center justify-center transition relative shadow-gold',
            voiceDisabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : isListening
              ? 'bg-gold-500 text-navy-900 ring-2 ring-gold-300'
              : 'bg-navy-800 hover:bg-navy-700 text-gold-300',
          )}
          aria-label="音声入力"
        >
          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          {isListening && (
            <span className="absolute inset-0 rounded-full border-2 border-gold-400 animate-ping" />
          )}
        </button>
        <textarea
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className={clsx(
            'flex-1 resize-none rounded-md border bg-white px-4 py-2.5 text-sm focus:outline-none transition',
            isListening
              ? 'border-gold-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-200'
              : 'border-navy-200 focus:border-navy-400 focus:ring-2 focus:ring-navy-100',
          )}
          style={{ maxHeight: 120 }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="shrink-0 size-11 rounded-full flex items-center justify-center bg-navy-800 hover:bg-navy-900 disabled:bg-slate-200 disabled:text-slate-400 text-gold-300 transition"
          aria-label="送信"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
