import clsx from 'clsx'
import { Check, MapPin } from 'lucide-react'
import type { ChatMessage, FreeSlot, CalendarEvent } from '../types'
import { ConciergeMark } from './ConciergeMark'
import { BriefingCard } from './BriefingCard'
import { SlotPicker } from './SlotPicker'
import { CalendarBadge } from './CalendarBadge'

interface Props {
  message: ChatMessage
  onConfirmSlot?: (
    id: string,
    slot: FreeSlot,
    calendar: CalendarEvent['source'],
    location: string,
  ) => void
  onCancelSlot?: (id: string) => void
  onToggleFlag?: (eventId: string) => void
  onBlockAll?: (id: string) => void
  googleConnected?: boolean
  outlookConnected?: boolean
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

export function MessageBubble({
  message,
  onConfirmSlot,
  onCancelSlot,
  onToggleFlag,
  onBlockAll,
  googleConnected,
  outlookConnected,
}: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={clsx('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="shrink-0 mt-1">
          <ConciergeMark size={32} />
        </div>
      )}
      <div className={clsx('max-w-[85%] space-y-1', isUser && 'items-end flex flex-col')}>
        {message.content.type === 'text' && (
          <div
            className={clsx(
              'rounded-md px-4 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-line',
              isUser
                ? 'bg-navy-800 text-white rounded-br-sm'
                : 'bg-white text-navy-900 border border-gold-200/50 rounded-bl-sm',
            )}
          >
            {message.content.text}
          </div>
        )}
        {message.content.type === 'briefing' && (
          <BriefingCard
            date={message.content.date}
            events={message.content.events}
            tasks={message.content.tasks}
            onToggleFlag={onToggleFlag}
          />
        )}
        {message.content.type === 'slots' && (
          <div className="card-elevated p-3 w-full">
            <SlotPicker
              question={message.content.question}
              slots={message.content.slots}
              title={message.content.draft?.title}
              defaultLocation={message.content.draft?.location}
              tentativeGroupId={message.content.tentativeGroupId}
              onConfirm={(slot, calendar, location) =>
                onConfirmSlot?.(message.id, slot, calendar, location)
              }
              onCancel={() => onCancelSlot?.(message.id)}
              onBlockAll={() => onBlockAll?.(message.id)}
              googleConnected={googleConnected}
              outlookConnected={outlookConnected}
            />
          </div>
        )}
        {message.content.type === 'approval' && (
          <div className="card-elevated p-3 w-full">
            {message.content.status === 'done' ? (
              <div className="flex items-start gap-2">
                <Check size={16} className="bg-gold-500 text-navy-900 rounded-full p-0.5 mt-0.5" />
                <div className="text-sm flex-1 min-w-0">
                  <p className="font-medium text-navy-900">ご予定を登録いたしました</p>
                  <p className="text-xs text-navy-700 mt-0.5">
                    {message.content.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {message.content.selectedSlot.label}
                  </p>
                  {message.content.location && (
                    <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-0.5">
                      <MapPin size={10} /> {message.content.location}
                    </p>
                  )}
                </div>
                {message.content.calendar && (
                  <div className="shrink-0">
                    <CalendarBadge source={message.content.calendar} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">取り消しいたしました</p>
            )}
          </div>
        )}
        {message.content.type === 'reschedule' && (
          <div className="card-elevated p-3 text-sm">
            {message.content.status === 'done' ? (
              <div className="flex items-center gap-2 text-navy-800">
                <Check size={16} className="text-gold-600" />
                <span>
                  「{message.content.eventTitle}」を {fmtTime(message.content.oldStart)} →{' '}
                  {fmtTime(message.content.newStart)} へ変更いたしました
                </span>
              </div>
            ) : (
              <p className="text-slate-500">変更を取り消しいたしました</p>
            )}
          </div>
        )}
        <div className={clsx('text-[10px] text-slate-400 px-1', isUser && 'text-right')}>
          {fmtTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}
