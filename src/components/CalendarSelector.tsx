import { useState } from 'react'
import clsx from 'clsx'
import { selectCalendars, MAX_SELECTED_CALENDARS, type CalendarsResponse } from '../lib/api'

/** 1つのGoogle/Outlookアカウント内に複数カレンダーがある場合、
 *  空き時間チェック対象（参照・最大3件）と新規予定の登録先（登録先・最大3件）を
 *  個別に選ばせるためのUI。設定画面・オンボーディングどちらからも使う。
 */
export function CalendarSelector({
  provider,
  state,
  onChanged,
}: {
  provider: 'google' | 'outlook'
  state: CalendarsResponse['google'] | CalendarsResponse['outlook']
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)

  if (!state.connected || state.calendars.length <= 1) return null

  // 未選択（参照対象を明示していない）時は既定カレンダーのみ選択中として表示
  const readIds =
    state.selectedIds.length > 0 ? state.selectedIds : state.calendars.filter((c) => c.primary).map((c) => c.id)
  const writeIds =
    state.writeIds.length > 0
      ? state.writeIds
      : [state.calendars.find((c) => c.primary)?.id ?? readIds[0]].filter((id): id is string => Boolean(id))

  const save = (next: { readIds: string[]; writeIds: string[] }) => {
    setSaving(true)
    selectCalendars(provider, next.readIds, next.writeIds)
      .then(onChanged)
      .finally(() => setSaving(false))
  }

  const toggleRead = (id: string) => {
    const isChecked = readIds.includes(id)
    if (isChecked && readIds.length === 1) return // 参照ゼロは不可（最低1件）
    const next = isChecked ? readIds.filter((c) => c !== id) : [...readIds, id]
    if (!isChecked && next.length > MAX_SELECTED_CALENDARS) return
    save({ readIds: next, writeIds })
  }

  const toggleWrite = (id: string) => {
    const isChecked = writeIds.includes(id)
    if (isChecked && writeIds.length === 1) return // 登録先ゼロは不可（最低1件）
    const next = isChecked ? writeIds.filter((c) => c !== id) : [...writeIds, id]
    if (!isChecked && next.length > MAX_SELECTED_CALENDARS) return
    save({ readIds, writeIds: next })
  }

  return (
    <div className="pb-3 -mt-1 pl-0 space-y-1.5">
      <p className="text-xs text-navy-500">
        参照（空き時間チェック）・登録先（新規予定の登録先）とも最大{MAX_SELECTED_CALENDARS}件まで選べます
      </p>
      <div className="space-y-1">
        {state.calendars.map((c) => {
          const checked = readIds.includes(c.id)
          const isWrite = writeIds.includes(c.id)
          const readDisabled = saving || (!checked && readIds.length >= MAX_SELECTED_CALENDARS)
          const writeDisabled = saving || (!isWrite && writeIds.length >= MAX_SELECTED_CALENDARS)
          return (
            <div
              key={c.id}
              className={clsx(
                'flex items-center gap-2 text-xs rounded-md border px-2 py-1.5',
                checked || isWrite ? 'border-gold-300 bg-gold-50/40' : 'border-navy-100',
              )}
            >
              <label
                className={clsx(
                  'flex items-center gap-1.5 shrink-0',
                  readDisabled && !checked && 'opacity-40',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={readDisabled}
                  onChange={() => toggleRead(c.id)}
                  className="accent-gold-500"
                />
                <span className="text-navy-500">参照</span>
              </label>
              <span className="text-navy-800 flex-1 truncate">{c.name}</span>
              <button
                type="button"
                disabled={writeDisabled}
                onClick={() => toggleWrite(c.id)}
                className={clsx(
                  'shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 transition disabled:opacity-40',
                  isWrite
                    ? 'bg-gold-500 text-navy-900'
                    : 'bg-navy-100 text-navy-500 hover:bg-navy-200',
                )}
              >
                {isWrite ? '登録先 ✓' : '登録先にする'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
