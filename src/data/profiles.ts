import type { CalendarEvent, Task } from '../types'
import type { ProfileId } from '../types/profile'

const today = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const at = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const dateOnly = (dayOffset = 0) => {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)
  return localDateStr(d)
}

interface ProfileData {
  events: CalendarEvent[]
  tasks: Task[]
}

const ceo: ProfileData = {
  events: [
    {
      id: 'ceo1',
      title: '取締役会',
      start: at(10, 0),
      end: at(12, 0),
      source: 'google',
      location: '本社役員会議室',
      memo: 'Q3決算承認資料・配当方針案を持参',
      memoPriority: 'critical',
      memoFlagged: true,
    },
    {
      id: 'ceo2',
      title: 'A社・佐藤社長 会食',
      start: at(13, 0),
      end: at(14, 30),
      source: 'outlook',
      location: '銀座・割烹「松濤」',
      memo: '提携合意書の最終確認',
      memoPriority: 'high',
    },
    {
      id: 'ceo3',
      title: 'IR ミーティング（機関投資家3社）',
      start: at(15, 0),
      end: at(17, 0),
      source: 'google',
      memo: '中期経営計画スライド最終版',
      memoPriority: 'high',
    },
    {
      id: 'ceo4',
      title: '日経新聞 取材',
      start: at(18, 0),
      end: at(19, 0),
      source: 'outlook',
      location: '本社応接室',
    },
    { id: 'ceo5', title: '株主総会リハーサル', start: at(10, 0, 1), end: at(11, 30, 1), source: 'google' },
    { id: 'ceo6', title: '海外子会社CEO定例', start: at(17, 0, 1), end: at(18, 0, 1), source: 'outlook' },
    { id: 'ceo7', title: '経済同友会 朝食会', start: at(7, 30, 2), end: at(9, 0, 2), source: 'google' },
  ],
  tasks: [
    { id: 'ceotask1', title: '株主総会想定問答 最終確認', dueDate: dateOnly(0), priority: 'high', done: false },
    { id: 'ceotask2', title: 'Q4予算承認サイン', dueDate: dateOnly(1), priority: 'high', done: false },
    { id: 'ceotask3', title: 'M&A 案件 NDA 確認', dueDate: dateOnly(2), priority: 'medium', done: false },
    { id: 'ceotask4', title: '社外取締役推薦書 確認', dueDate: dateOnly(5), priority: 'medium', done: false },
  ],
}

const director: ProfileData = {
  events: [
    {
      id: 'dir1',
      title: '経営会議',
      start: at(9, 0),
      end: at(11, 0),
      source: 'google',
      location: '本社A会議室',
      memo: '部門別予算実績の説明資料',
      memoPriority: 'high',
    },
    {
      id: 'dir2',
      title: '部門長会議（事業本部）',
      start: at(13, 0),
      end: at(14, 30),
      source: 'outlook',
      location: '本社B会議室',
    },
    {
      id: 'dir3',
      title: '主要取引先・山田常務 訪問',
      start: at(15, 30),
      end: at(17, 0),
      source: 'outlook',
      location: '東京・丸の内',
      memo: '次年度発注見込みのヒアリング',
      memoPriority: 'high',
    },
    {
      id: 'dir4',
      title: '社内表彰式 出席',
      start: at(18, 0),
      end: at(19, 30),
      source: 'google',
      location: 'パレスホテル',
    },
    { id: 'dir5', title: '人事委員会', start: at(10, 0, 1), end: at(11, 30, 1), source: 'google' },
    { id: 'dir6', title: '監査役会 報告', start: at(14, 0, 2), end: at(15, 30, 2), source: 'outlook' },
  ],
  tasks: [
    { id: 'dirtask1', title: '取締役会議事録 確認', dueDate: dateOnly(0), priority: 'high', done: false },
    { id: 'dirtask2', title: '次年度事業計画レビュー', dueDate: dateOnly(1), priority: 'high', done: false },
    { id: 'dirtask3', title: '部下評価シート 確認', dueDate: dateOnly(3), priority: 'medium', done: false },
    { id: 'dirtask4', title: '社外役員候補リスト 整理', dueDate: dateOnly(6), priority: 'low', done: false },
  ],
}

const cfo: ProfileData = {
  events: [
    {
      id: 'cfo1',
      title: '監査法人ミーティング',
      start: at(9, 30),
      end: at(11, 0),
      source: 'google',
      location: '本社財務会議室',
      memo: 'Q3監査調書の質疑応答',
      memoPriority: 'critical',
      memoFlagged: true,
    },
    {
      id: 'cfo2',
      title: 'メガバンク・融資担当者面談',
      start: at(13, 30),
      end: at(14, 30),
      source: 'outlook',
      location: '大手町',
      memo: '長期借入枠拡大の交渉',
      memoPriority: 'high',
    },
    {
      id: 'cfo3',
      title: '機関投資家とのリモートMTG',
      start: at(15, 0),
      end: at(16, 0),
      source: 'google',
      location: 'Zoom',
      memo: 'EPS見通しと配当方針の説明',
    },
    {
      id: 'cfo4',
      title: '税理士・四半期定例',
      start: at(17, 0),
      end: at(18, 0),
      source: 'outlook',
    },
    { id: 'cfo5', title: '財務部 朝会', start: at(8, 30, 1), end: at(9, 0, 1), source: 'google' },
    { id: 'cfo6', title: '経理システム移行レビュー', start: at(14, 0, 2), end: at(16, 0, 2), source: 'outlook' },
  ],
  tasks: [
    { id: 'cfotask1', title: 'Q3決算短信 最終確認', dueDate: dateOnly(0), priority: 'high', done: false },
    { id: 'cfotask2', title: '銀行団との借換条件 整理', dueDate: dateOnly(1), priority: 'high', done: false },
    { id: 'cfotask3', title: '監査法人への追加資料 提出', dueDate: dateOnly(2), priority: 'medium', done: false },
    { id: 'cfotask4', title: '為替ヘッジ方針 見直し', dueDate: dateOnly(5), priority: 'medium', done: false },
  ],
}

const PROFILE_DATA: Record<ProfileId, ProfileData> = {
  ceo,
  director,
  cfo,
}

export const getProfileEvents = (id: ProfileId): CalendarEvent[] =>
  PROFILE_DATA[id].events

export const getProfileTasks = (id: ProfileId): Task[] => PROFILE_DATA[id].tasks
