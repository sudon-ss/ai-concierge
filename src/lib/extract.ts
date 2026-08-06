// 音声・テキストから予定情報を素朴に抽出する Phase 0 用ユーティリティ
// Phase 1 では Claude API（Tool Use）に置き換える前提

export interface ExtractedIntent {
  title: string
  location?: string
  durationMinutes: number
  targetDate?: string // YYYY-MM-DD（ローカル）
  targetHour?: number // 0-23
  rawText: string
}

// ---- 辞書 ----

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const LOCATION_KEYWORDS = [
  // オンライン
  'Zoom', 'zoom', 'Google Meet', 'Meet', 'Teams', 'teams', 'Slack',
  'Webex', 'Skype', 'LINE WORKS',
  'オンライン', 'リモート', 'Web会議', 'ウェブ会議', 'ビデオ会議', 'リモート会議',
  // 拠点
  '本社', '支社', '支店', '営業所', '会議室', 'オフィス', '事務所', 'ラボ', 'スタジオ',
  // 駅・エリア（東京）
  '東京駅', '新宿', '渋谷', '品川', '銀座', '丸の内', '六本木', '池袋', '上野',
  '秋葉原', '大手町', '汐留', '虎ノ門', '赤坂', '麻布', '青山', '原宿', '表参道',
  '恵比寿', '中目黒', '神保町', '日本橋', '神田', '飯田橋',
  // 関東
  '横浜', 'みなとみらい', '川崎', '大宮', '千葉', '幕張',
  // 他都市
  '大阪', '梅田', '難波', '心斎橋', '京都', '名古屋', '栄', '神戸', '三宮',
  '福岡', '博多', '札幌', '仙台', '広島', '那覇',
  // 飲食・宿泊
  'スタバ', 'スターバックス', 'カフェ', 'タリーズ', 'ドトール',
  'ホテル', '帝国ホテル', 'パレスホテル', 'ニューオータニ', 'リッツ',
  'レストラン', '居酒屋', '焼肉', '寿司', 'お店',
  // コワーキング
  'WeWork', 'コワーキング',
] as const

const EVENT_KEYWORDS = [
  // 会議系
  'MTG', 'mtg', 'ミーティング', '会議', '打合せ', '打ち合わせ',
  '打診', 'ヒアリング', '相談', 'レビュー', '進捗', '報告', '報告会',
  'キックオフ', 'クロージング', '振り返り',
  // 営業系
  '商談', 'アポ', 'アポイント', '訪問', '面談', '顔合わせ', '挨拶', '接待',
  'プレゼン', '提案',
  // 食事系
  'ランチ', 'ディナー', '食事', '会食', '飲み会', '飲み', '懇親', '親睦',
  '朝食', '昼食', '夕食',
  // 学習系
  'セミナー', '勉強会', '研修', '講習', '講演', 'ワークショップ',
  'トレーニング', 'カンファレンス',
  // イベント系
  'イベント', 'パーティー', 'パーティ', '結婚式', '二次会', '同窓会',
  '展示会', '展示',
  // 業務系
  '定例', '営業会議', '戦略会議', '取締役会', '朝礼', '夕礼', '終礼',
  // 個人系
  '歯医者', '歯科', '病院', '通院', '診察', '検診', '健診',
  '美容院', '美容室', 'ヘアサロン', 'ジム', 'マッサージ', 'ヨガ',
  // その他
  '予定', '登録', 'スケジュール', '集まり', '集合', '集会', 'MTG設定',
] as const

const eventRegex = new RegExp(EVENT_KEYWORDS.join('|'), 'i')

// ノイズ削除用パターン（タイトル抽出時のクリーニング用）
const DATE_RE = /明々後日|明後日|明日|今日|本日|来週|今週|再来週|来月|今月|先週|あさって|あした|あす|きょう|月曜|火曜|水曜|木曜|金曜|土曜|日曜|\d{1,2}月\d{1,2}日|\d+日後|\d+日前|\d+週間後|\d+ヶ月後/g
const TIME_RE = /午前|午後|早朝|朝|昼|夕方|夜|\d{1,2}時(?:\d{1,2}分)?(?:半)?|\d{1,2}:\d{2}/g
const DURATION_RE = /\d+\s*時間半?|\d+\s*分(?!前|後)|半日|1日|終日/g
const LOCATION_HINT_RE = /場所は[^\s、。]*|[@＠]\s*\S+/g
const PARTICLE_RE = /から|まで/g
// 口語フィラー・依頼語
const FILLER_RE = /なんだけど|なんですが|なんですけど|なのですが|なのですけど|だけど|ですが|けど|してほしい|したい|して(?:ください)?|お願い(?:します)?|ちょうだい|でいいかな|でいい|っていうか|というか|みたいな|感じで|感じかな|頼む|頼んで|取って|とって|入れて|登録|予約|設定|出して|作って/g

// ---- ヘルパー ----

const pad = (n: number) => String(n).padStart(2, '0')
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const dateShift = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

const nextWeekday = (target: number, baseAddDays = 0, allowToday = false): string => {
  const d = new Date()
  d.setDate(d.getDate() + baseAddDays)
  const current = d.getDay()
  let diff = target - current
  if (diff < 0) diff += 7
  if (diff === 0 && !allowToday) diff += 7
  d.setDate(d.getDate() + diff)
  return localDateStr(d)
}

// ---- 抽出関数 ----

export function detectScheduleIntent(text: string): boolean {
  if (eventRegex.test(text)) return true
  // 日時のみでもスケジュール意図と見なす
  const hasTime = /\d{1,2}時|\d{1,2}:\d{2}/.test(text)
  const hasDate = /明日|今日|明後日|来週|今週|来月|月曜|火曜|水曜|木曜|金曜|土曜|日曜|\d{1,2}月\d{1,2}日/.test(text)
  return hasTime || hasDate
}

export function extractTargetDate(text: string): string | undefined {
  if (/明々後日|しあさって/.test(text)) return dateShift(3)
  if (/明後日|あさって/.test(text)) return dateShift(2)
  if (/明日|あした|あす/.test(text)) return dateShift(1)
  if (/今日|本日|きょう/.test(text)) return dateShift(0)

  const sarainext = text.match(/再来週(?:の)?(月|火|水|木|金|土|日)曜/)
  if (sarainext) return nextWeekday(DAY_LABELS.indexOf(sarainext[1]), 14)

  const next = text.match(/来週(?:の)?(月|火|水|木|金|土|日)曜/)
  if (next) return nextWeekday(DAY_LABELS.indexOf(next[1]), 7)

  const thisw = text.match(/今週(?:の)?(月|火|水|木|金|土|日)曜/)
  if (thisw) return nextWeekday(DAY_LABELS.indexOf(thisw[1]), 0, true)

  const dayOnly = text.match(/(月|火|水|木|金|土|日)曜/)
  if (dayOnly) return nextWeekday(DAY_LABELS.indexOf(dayOnly[1]))

  const mmdd = text.match(/(\d{1,2})月(\d{1,2})日/)
  if (mmdd) {
    const now = new Date()
    const d = new Date(now.getFullYear(), parseInt(mmdd[1]) - 1, parseInt(mmdd[2]))
    if (d.getTime() < now.getTime()) d.setFullYear(d.getFullYear() + 1)
    return localDateStr(d)
  }

  return undefined
}

export function extractTargetHour(text: string): number | undefined {
  const colon = text.match(/(\d{1,2}):(\d{2})/)
  if (colon) {
    let h = parseInt(colon[1])
    if (/午後/.test(text.substring(0, colon.index ?? 0)) && h < 12) h += 12
    return h
  }

  const hour = text.match(/(?:(午前|午後|朝|昼|夕方|夜)\s*)?(\d{1,2})時/)
  if (hour) {
    let h = parseInt(hour[2])
    const prefix = hour[1] ?? ''
    const isPM = /午後|夕方/.test(prefix)
    const isNight = /夜/.test(prefix)
    const isAM = /午前|朝/.test(prefix)
    if ((isPM || isNight) && h < 12) h += 12
    if (isAM && h >= 12) h -= 12
    return h
  }

  return undefined
}

export function extractDuration(text: string): number {
  const halfHour = text.match(/(\d+)\s*時間半/)
  if (halfHour) return parseInt(halfHour[1]) * 60 + 30

  const decimalHour = text.match(/(\d+(?:\.\d+)?)\s*時間/)
  if (decimalHour) return Math.round(parseFloat(decimalHour[1]) * 60)

  const mins = text.match(/(\d+)\s*分(?!前|後)/)
  if (mins) return parseInt(mins[1])

  if (/半日/.test(text)) return 240
  if (/終日|1日/.test(text)) return 480

  // カテゴリ別の推定デフォルト
  if (/ランチ|昼食/.test(text)) return 60
  if (/ディナー|夕食|食事|会食|飲み会|懇親|親睦/.test(text)) return 120
  if (/挨拶|顔合わせ|アポ|アポイント/.test(text)) return 30
  if (/取締役会|戦略会議|定例|セミナー|研修|講演|ワークショップ|カンファレンス|展示/.test(text))
    return 90

  return 60
}

export function extractLocation(text: string): string | undefined {
  const explicit = text.match(/(?:場所は|[@＠]\s*)([^\s、。]+)/)
  if (explicit?.[1]) return explicit[1].trim()

  for (const kw of LOCATION_KEYWORDS) {
    if (text.includes(kw)) return kw
  }

  const deMatch = text.match(
    /([^\s、。から]+?)で(?=\s|、|。|$|MTG|会議|ミーティング|打合せ|打ち合わせ|定例|アポ|商談|面談|食事|ランチ|ディナー|相談|プレゼン)/,
  )
  if (deMatch?.[1]) {
    const candidate = deMatch[1].trim()
    if (!/^(明日|今日|明後日|来週|今週|来月|午前|午後|\d+時)/.test(candidate)) {
      return candidate
    }
  }

  return undefined
}

const stripNoise = (text: string): string => {
  let result = text
  result = result.replace(DATE_RE, ' ')
  result = result.replace(TIME_RE, ' ')
  result = result.replace(DURATION_RE, ' ')
  result = result.replace(LOCATION_HINT_RE, ' ')
  result = result.replace(PARTICLE_RE, ' ')
  result = result.replace(FILLER_RE, ' ')
  for (const kw of LOCATION_KEYWORDS) {
    result = result.split(kw).join(' ')
  }
  return result
}

export function extractTitle(text: string): string {
  // 「、」「。」「,」で分割 → ノイズ除去後の最長セグメントをタイトルとする
  const segments = text
    .split(/[、。,]/)
    .map((s) => s.trim())
    .filter(Boolean)

  let candidate = ''
  for (const seg of segments) {
    const cleaned = stripNoise(seg).replace(/\s+/g, '').trim()
    if (cleaned.length > candidate.length) candidate = cleaned
  }
  if (!candidate) {
    candidate = stripNoise(text).replace(/\s+/g, '').trim()
  }
  // 語頭・語尾の助詞・接続詞を除去
  candidate = candidate.replace(/^[でにをとはがのもから　\s]+/, '').trim()
  candidate = candidate.replace(/[でにをとはがのも、。　\s]+$/, '').trim()
  // 20文字を超えたらイベントキーワード前後で切る
  if (candidate.length > 20) {
    const m = candidate.match(new RegExp(`^(.{0,12}(?:${EVENT_KEYWORDS.join('|')}))`, 'i'))
    if (m) candidate = m[1]
    else candidate = candidate.slice(0, 16)
  }
  return candidate || '新しい予定'
}

export function extractIntent(text: string): ExtractedIntent {
  return {
    title: extractTitle(text),
    location: extractLocation(text),
    durationMinutes: extractDuration(text),
    targetDate: extractTargetDate(text),
    targetHour: extractTargetHour(text),
    rawText: text,
  }
}
