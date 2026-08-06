export type ProfileId = 'ceo' | 'director' | 'cfo'

export interface Profile {
  id: ProfileId
  label: string
  emoji: string
  tagline: string
  description: string
  greeting: string
}

export const PROFILES: Record<ProfileId, Profile> = {
  ceo: {
    id: 'ceo',
    label: '社長',
    emoji: '🗝️',
    tagline: '取締役会・IR・経営判断の連続',
    description: '取締役会・株主・VC・業界交流',
    greeting:
      'おはようございます。社長、本日もよろしくお願いいたします。本日のご予定をご確認くださいませ。',
  },
  director: {
    id: 'director',
    label: '役員',
    emoji: '🗝️',
    tagline: '経営会議と現場の橋渡し',
    description: '経営会議・部門戦略・ステークホルダー対応',
    greeting:
      'おはようございます。本日のご予定をご報告申し上げます。承りましたら、ご指示くださいませ。',
  },
  cfo: {
    id: 'cfo',
    label: 'CFO',
    emoji: '🗝️',
    tagline: '財務・投資家・監査の三本柱',
    description: '監査法人・銀行・投資家・税理士',
    greeting:
      'おはようございます。本日の財務関連のご予定でございます。ご確認のうえ、ご指示くださいませ。',
  },
}

export const DEFAULT_PROFILE_ID: ProfileId = 'ceo'
