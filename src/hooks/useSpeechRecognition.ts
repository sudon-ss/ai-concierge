import { useEffect, useRef, useState } from 'react'

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResult {
  isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => unknown) | null
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => unknown) | null
  onend: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

interface Options {
  lang?: string
  onFinalResult?: (text: string) => void
}

export function useSpeechRecognition({ lang = 'ja-JP', onFinalResult }: Options = {}) {
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const onFinalResultRef = useRef(onFinalResult)

  useEffect(() => {
    onFinalResultRef.current = onFinalResult
  }, [onFinalResult])

  const supported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const start = () => {
    if (!supported) {
      setError('このブラウザは音声認識に対応していないにゃ。Chrome / Edge / Safari で試してにゃ。')
      return
    }
    setError(null)
    const Recognition = (window.SpeechRecognition || window.webkitSpeechRecognition) as SpeechRecognitionCtor
    const r = new Recognition()
    r.lang = lang
    r.continuous = false
    r.interimResults = true

    r.onstart = () => setIsListening(true)
    r.onend = () => {
      setIsListening(false)
      setInterimText('')
    }
    r.onerror = (e) => {
      const map: Record<string, string> = {
        'not-allowed': 'マイクが許可されていないにゃ。ブラウザの設定で許可してにゃ。',
        'no-speech': '声が聞こえなかったにゃ。もう一度話しかけてにゃ。',
        'audio-capture': 'マイクが見つからないにゃ。',
        'network': 'ネットワークエラーにゃ。',
      }
      setError(map[e.error] || `音声認識エラー: ${e.error}`)
      setIsListening(false)
    }
    r.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }
      if (interim) setInterimText(interim)
      if (final) {
        const text = final.trim()
        setInterimText('')
        if (text) onFinalResultRef.current?.(text)
      }
    }

    recognitionRef.current = r
    try {
      r.start()
    } catch {
      setError('音声認識の起動に失敗したにゃ。')
      setIsListening(false)
    }
  }

  const stop = () => {
    recognitionRef.current?.stop()
  }

  const clearError = () => setError(null)

  return { supported, isListening, interimText, error, start, stop, clearError }
}
