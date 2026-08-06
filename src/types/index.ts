export type CalendarSource = 'google' | 'outlook'

export type MemoPriority = 'normal' | 'high' | 'critical'

export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO
  end: string   // ISO
  source: CalendarSource | 'both'
  location?: string
  memo?: string
  memoPriority?: MemoPriority
  memoFlagged?: boolean
  /** 仮押さえフラグ */
  tentative?: boolean
  /** 仮押さえグループID（同じIDの複数枠をまとめて管理） */
  tentativeGroupId?: string
}

export interface Task {
  id: string
  title: string
  dueDate: string // ISO date
  priority: 'low' | 'medium' | 'high'
  done: boolean
}

export interface FreeSlot {
  start: string
  end: string
  label: string
}

export interface ExtractedDraft {
  title: string
  location?: string
  durationMinutes: number
  targetDate?: string // YYYY-MM-DD
  targetHour?: number // 0-23
}

export type MessageRole = 'user' | 'assistant'

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'slots'; question: string; slots: FreeSlot[]; draft?: ExtractedDraft; tentativeGroupId?: string }
  | {
      type: 'approval'
      selectedSlot: FreeSlot
      title: string
      location?: string
      eventId?: string
      status: 'pending' | 'done' | 'cancelled'
      calendar?: CalendarEvent['source']
    }
  | { type: 'briefing'; date: string; events: CalendarEvent[]; tasks: Task[] }
  | {
      type: 'reschedule'
      eventId?: string
      eventTitle: string
      oldStart: string
      newStart: string
      status: 'pending' | 'done' | 'cancelled'
    }

export interface ChatMessage {
  id: string
  role: MessageRole
  content: MessageContent
  createdAt: string
}
