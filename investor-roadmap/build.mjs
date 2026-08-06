import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ============================ アイコン (lucide風) ============================ */
const I = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 7 7 0 0 0-13-2"/><path d="M3 4l17 17"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  play: '<path d="M6 4l13 8-13 8z"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>',
  apple: '<path d="M16 3c0 1.7-1.3 3-3 3 0-1.7 1.3-3 3-3z"/><path d="M18 14c-.2 2.3-1.8 5-3.5 5-1 0-1.4-.6-2.5-.6s-1.6.6-2.5.6C7.5 19 5.5 14.5 5.5 11.5 5.5 9 7.3 7.5 9 7.5c1 0 1.8.6 2.5.6s1.4-.6 2.5-.6c1 0 2.2.4 3 1.4-2.4 1.4-2 4.6 1 5.1z"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>',
  utensils: '<path d="M4 2v7c0 1.6 1.3 3 3 3M7 2v20M7 12v-2M14 2c-1.4 1-2 3-2 5 0 2 1 3 2.5 3.2V22"/>',
  message: '<path d="M21 11.5a8 8 0 0 1-8.5 8 9 9 0 0 1-3.8-.9L3 21l1.9-5.7A8 8 0 0 1 4 11.5 8 8 0 0 1 12.5 3.5 8 8 0 0 1 21 11.5z"/>',
  wave: '<path d="M4 10v4M8 6v12M12 8v8M16 5v14M20 10v4"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M16.5 6.5 16 2H8l-.5 4.5M7.5 17.5 8 22h8l.5-4.5"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
}
const icon = (name, size = 22, cls = '') =>
  `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`

/* ============================ 金鍵マーク ============================ */
const conciergeMark = (size = 30, plain = true) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cg${size}${plain ? 'p' : 'b'}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ead498"/><stop offset="50%" stop-color="#d4ac4a"/><stop offset="100%" stop-color="#a98442"/>
    </linearGradient>
  </defs>
  ${plain ? '' : `<rect width="64" height="64" rx="12" fill="#0a1a30"/><rect x="3" y="3" width="58" height="58" rx="9" fill="none" stroke="url(#cg${size}b)" stroke-width="0.7" opacity="0.6"/>`}
  <g transform="translate(32 32)">
    <g transform="rotate(45)" stroke="url(#cg${size}${plain ? 'p' : 'b'})" stroke-width="2.2" fill="none" stroke-linecap="round">
      <circle cx="-15" cy="0" r="5"/><circle cx="-15" cy="0" r="1.6" fill="url(#cg${size}${plain ? 'p' : 'b'})" stroke="none"/>
      <line x1="-10" y1="0" x2="17" y2="0"/><line x1="10" y1="0" x2="10" y2="4"/><line x1="14" y1="0" x2="14" y2="4"/><line x1="17" y1="0" x2="17" y2="3"/>
    </g>
    <g transform="rotate(-45)" stroke="url(#cg${size}${plain ? 'p' : 'b'})" stroke-width="2.2" fill="none" stroke-linecap="round">
      <circle cx="-15" cy="0" r="5"/><circle cx="-15" cy="0" r="1.6" fill="url(#cg${size}${plain ? 'p' : 'b'})" stroke="none"/>
      <line x1="-10" y1="0" x2="17" y2="0"/><line x1="10" y1="0" x2="10" y2="4"/><line x1="14" y1="0" x2="14" y2="4"/><line x1="17" y1="0" x2="17" y2="3"/>
    </g>
  </g>
</svg>`

/* ============================ アプリ部品 ============================ */
const calBadge = (src) => {
  const map = {
    google: ['Google', '#1a73e8', '#e8f0fe'],
    outlook: ['Outlook', '#0a66c2', '#e6f0fb'],
    both: ['G + O', '#a98442', '#f4e8c4'],
  }
  const [t, c, bg] = map[src]
  return `<span class="cal-badge" style="color:${c};background:${bg}">${t}</span>`
}
const appHeader = () => `
  <div class="app-header">
    <div class="app-wm">${conciergeMark(18, true)}<span>The Concierge</span></div>
  </div>
  <div class="gold-divider"></div>`
const bottomNav = (active) => {
  const items = [['home', 'Home', 'M3 11l9-8 9 8M5 10v10h14V10'], ['chat', 'Chat', 'M21 11.5a8 8 0 0 1-8.5 8 9 9 0 0 1-3.8-.9L3 21l1.9-5.7A8 8 0 0 1 4 11.5 8 8 0 0 1 12.5 3.5 8 8 0 0 1 21 11.5z'], ['cal', 'Schedule', 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18'], ['task', 'Task', 'm3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8'], ['profile', 'Profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0']]
  return `<div class="bnav"><div class="gold-divider"></div><div class="bnav-row">${items
    .map(
      ([id, label, d]) =>
        `<div class="bnav-item ${id === active ? 'on' : ''}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d
          .split('M')
          .filter(Boolean)
          .map((p) => `<path d="M${p}"/>`)
          .join('')}</svg><span>${label}</span></div>`,
    )
    .join('')}</div></div>`
}

/* ============================ スマホ画面：各Phase ============================ */
// Phase0: チャット＋ブリーフィング
const screen0 = () => `
${appHeader()}
<div class="app-body">
  <div class="msg assistant">
    <div class="avatar">${conciergeMark(28, false)}</div>
    <div class="brief card-elev">
      <p class="brief-label">MORNING BRIEFING</p>
      <p class="brief-date">5月25日(月)</p>
      <h2 class="serif brief-title">本日のご予定でございます</h2>
      <div class="gold-divider"></div>
      <p class="sec-h">${icon('calendar', 13)} SCHEDULE（2件）</p>
      <div class="ev"><div class="ev-top"><span class="ev-time">10:00–11:00</span>${calBadge('google')}</div><p class="ev-title">経営会議</p></div>
      <div class="ev"><div class="ev-top"><span class="ev-time">15:00–16:00</span>${calBadge('outlook')}<span class="ev-loc">📍渋谷</span></div><p class="ev-title">資金調達 商談</p></div>
      <p class="sec-h mt">${icon('check', 13)} TASKS（期限3日以内：2件）</p>
      <div class="tk"><span class="pri hi">高</span><span class="tk-t">決算資料の最終確認</span><span class="tk-d">5/26</span></div>
      <div class="tk"><span class="pri mid">中</span><span class="tk-t">採用面談フィードバック</span><span class="tk-d">5/27</span></div>
    </div>
  </div>
  <div class="msg user"><div class="bubble user-b">明日の午後、空いてる？</div></div>
</div>
${inputBar(false)}
${bottomNav('chat')}`

// Phase1: 7時Push自動配信＋実カレンダー空き枠
const screen1 = () => `
${appHeader()}
<div class="app-body">
  <div class="push-toast">${icon('bell', 16)}<div><p class="pt-h">The Concierge · 7:00</p><p class="pt-b">おはようございます。本日のご予定をお届けしました</p></div></div>
  <div class="msg assistant">
    <div class="avatar">${conciergeMark(28, false)}</div>
    <div class="bubble bot-b">来週の打ち合わせ、<b>実カレンダー</b>から空き枠を3つご用意しました。</div>
  </div>
  <div class="msg assistant">
    <div class="avatar" style="opacity:0"></div>
    <div class="slot card-elev">
      <div class="slot-row sel"><div class="slot-line">${icon('clock', 15, 'gold')}<span>6/2(火) 14:00–15:00</span>${icon('check', 15, 'gold')}</div>
        <div class="slot-actions"><span class="loc-input">${icon('map', 13)} 場所（任意）</span><div class="btn-grid"><span class="sbtn navy">Googleへ登録</span><span class="sbtn navy2">Outlookへ登録</span><span class="sbtn gold">両方へ登録</span></div></div>
      </div>
      <div class="slot-row"><div class="slot-line">${icon('clock', 15)}<span>6/3(水) 10:00–11:00</span></div></div>
      <div class="slot-row"><div class="slot-line">${icon('clock', 15)}<span>6/4(木) 16:00–17:00</span></div></div>
    </div>
  </div>
</div>
${inputBar(false)}
${bottomNav('chat')}`

// Phase2: 移動時間ガード＋レコメンド＋TTS
const screen2 = () => `
${appHeader()}
<div class="app-body">
  <div class="msg assistant"><div class="avatar">${conciergeMark(28, false)}</div>
    <div class="guard card-elev"><div class="guard-h">${icon('map', 16, 'gold')}<span>移動時間ガード</span></div>
      <p class="guard-b">次の「資金調達 商談」まで移動に<b>約25分</b>必要です。<br>15分前のご出発をおすすめいたします。</p>
      <div class="route"><span class="dot"></span><span class="route-l">渋谷</span><span class="route-line"></span><span class="route-t">25分</span><span class="route-line"></span><span class="dot gold"></span><span class="route-l">六本木</span></div>
    </div>
  </div>
  <div class="msg assistant"><div class="avatar" style="opacity:0"></div>
    <div class="reco card-elev"><div class="reco-h">${icon('utensils', 14, 'gold')} おすすめ（徒歩3分）</div><p class="reco-t">日本料理 ○○亭<span class="reco-tag">接待向き</span></p></div>
  </div>
  <div class="msg assistant"><div class="avatar" style="opacity:0"></div>
    <div class="bubble bot-b tts">${icon('volume', 14, 'gold')} 音声で読み上げております…</div>
  </div>
</div>
${inputBar(true)}
${bottomNav('chat')}`

const inputBar = (tts) => `
<div class="input-bar">
  <div class="mic">${icon('mic', 20)}</div>
  <div class="field">${tts ? 'お申し付けください（音声対応）' : 'ご指示をお聞かせください'}</div>
  <div class="send">${icon('send', 18)}</div>
</div>`

/* ============================ 機能カード ============================ */
const featCard = ({ ic, t, s, tag }) => `
<div class="fcard">
  <div class="fic">${icon(ic, 22)}</div>
  <div class="ftxt"><p class="ft">${t}</p><p class="fs">${s}</p></div>
  <span class="ftag ${tag.k}">${tag.l}</span>
</div>`

const SOLID = { k: 'solid', l: '完成' }
const DEMO = { k: 'outline', l: 'デモ' }
const NEW = { k: 'solid', l: 'NEW' }
const REAL = { k: 'outline', l: '本番化' }
const EVO = { k: 'outline', l: '進化' }

const cards0 = [
  { ic: 'check', t: '承認ワークフロー', s: '登録・変更前に1タップ確認', tag: SOLID },
  { ic: 'shield', t: 'マルチカレンダー接続', s: 'Google / Outlook OAuth実接続', tag: SOLID },
  { ic: 'users', t: '3プロファイル切替', s: '経営者 / 営業 / フリーランス', tag: SOLID },
  { ic: 'database', t: '会話履歴の保存・復元', s: 'プロファイル別に永続化', tag: SOLID },
  { ic: 'bell', t: '朝のブリーフィング', s: '今日・明日・明後日＋タスク', tag: DEMO },
  { ic: 'mic', t: '音声スケジュール登録', s: 'Web Speech ＋ 辞書解析', tag: DEMO },
  { ic: 'clock', t: '空き時間の提案', s: '候補を3枠ボタンでご提示', tag: DEMO },
  { ic: 'sparkles', t: 'メモAI重要度判定', s: '辞書ベースで自動フラグ', tag: DEMO },
]
const cards1 = [
  { ic: 'sparkles', t: 'Claude AI 解析', s: '音声→予定をAIが構造化', tag: NEW },
  { ic: 'calendar', t: '実カレンダー突合', s: '本物の空き時間で提案', tag: REAL },
  { ic: 'bell', t: '朝7時 Cron 自動配信', s: 'Push通知でブリーフィング', tag: NEW },
  { ic: 'zap', t: 'Web Push / フラッシュ通知', s: '見逃しを物理的に防止', tag: REAL },
  { ic: 'database', t: 'Supabase 永続化', s: '予定・タスク・会話を保存', tag: NEW },
  { ic: 'check', t: '承認 → 実API更新', s: '登録・リスケを本番反映', tag: REAL },
  { ic: 'cloud', t: 'オフライン対応', s: 'BG同期＋暫定バナー', tag: NEW },
  { ic: 'smartphone', t: 'ウィジェット＋即マイク', s: 'ホームからワンタップ起動', tag: NEW },
  { ic: 'shield', t: '本番OAuth（審査通過）', s: 'Google機密スコープ対応', tag: REAL },
  { ic: 'play', t: 'Google Play 有料配信', s: 'Android 正式ローンチ', tag: NEW },
]
const cards2 = [
  { ic: 'map', t: '移動時間ガード', s: 'Google Mapsで間に合わない予定を警告', tag: NEW },
  { ic: 'clock', t: 'コンサル型提案 進化', s: '移動・余裕を考慮した最適枠', tag: EVO },
  { ic: 'apple', t: 'Apple Calendar 対応', s: 'iCloud CalDAV 連携', tag: NEW },
  { ic: 'volume', t: '音声出力（TTS）', s: '返答を上品に読み上げ', tag: NEW },
  { ic: 'utensils', t: 'レコメンド', s: 'レストラン・お土産を提案', tag: NEW },
  { ic: 'message', t: 'LINE 連携Bot', s: 'Messaging API でどこでも', tag: NEW },
  { ic: 'message', t: 'Slack 連携Bot', s: 'チーム業務をテキスト操作', tag: NEW },
  { ic: 'wave', t: '「ヘイSiri」「OK Google」', s: '音声で即起動', tag: NEW },
  { ic: 'watch', t: 'Apple / Galaxy Watch', s: '腕時計からタップ起動', tag: NEW },
  { ic: 'apple', t: 'App Store 配信', s: 'iOS 正式対応', tag: NEW },
]

/* ============================ スライド ============================ */
const progress = (cur) =>
  `<div class="prog">${[0, 1, 2]
    .map(
      (n) =>
        `<div class="pseg ${n === cur ? 'on' : n < cur ? 'done' : ''}"><span class="pdot"></span>PHASE ${n}</div>${n < 2 ? '<span class="pbar"></span>' : ''}`,
    )
    .join('')}</div>`

const slide = ({ id, chip, title, en, tagline, screen, cards, legend, cur }) => `
<section class="slide" id="${id}">
  <div class="bg-glow"></div>
  <div class="bg-key">${conciergeMark(620, true)}</div>
  <div class="frame"></div>
  <header class="s-head">
    <div class="s-head-l">
      <span class="chip">${chip}</span>
      <h1 class="serif s-title">${title}</h1>
      <p class="s-en">${en}</p>
    </div>
    <div class="s-head-r">
      <div class="brand">${conciergeMark(26, true)}<span class="serif">The Concierge</span></div>
      ${progress(cur)}
    </div>
  </header>
  <main class="s-main">
    <div class="phone-col">
      <div class="phone"><div class="island"></div><div class="screen">${screen}</div></div>
      <p class="phone-cap">${tagline}</p>
    </div>
    <div class="cards-col">
      <div class="cards-grid">${cards.map(featCard).join('')}</div>
      <div class="legend">${legend}</div>
    </div>
  </main>
</section>`

const slides = [
  slide({
    id: 'p0',
    cur: 0,
    chip: 'PHASE 0 · WORKING DEMO',
    title: '現状 ― すでに動くプロダクト',
    en: 'PWA Web Demo',
    tagline: '主要機能のUI/UXは“今すぐ”体験可能。OAuth実接続と承認フローは本番品質で完成済み。',
    screen: screen0(),
    cards: cards0,
    legend: `<span class="lg"><span class="ldot solid"></span>実装完成</span><span class="lg"><span class="ldot outline"></span>デモ動作（モック）</span><span class="lg-note">※ 28機能中、主要UIは全て体験可能</span>`,
  }),
  slide({
    id: 'p1',
    cur: 1,
    chip: 'PHASE 1 · MVP LAUNCH',
    title: '有料リリース（MVP）',
    en: 'PWA + Google Play',
    tagline: 'モックを本番実装へ。Claude AI・実カレンダー連動・Push通知・データ永続化を実装し、Androidで有料配信を開始。',
    screen: screen1(),
    cards: cards1,
    legend: `<span class="lg"><span class="ldot solid"></span>新規実装</span><span class="lg"><span class="ldot outline"></span>本番化（モック→実装）</span><span class="lg-note">※ 少なくともこの機能をリリース</span>`,
  }),
  slide({
    id: 'p2',
    cur: 2,
    chip: 'PHASE 2 · EXPANSION',
    title: '機能拡充',
    en: '+ App Store / Multi-Platform',
    tagline: '移動時間ガード、LINE / Slack / ウォッチ、音声起動。iOS対応で“生活インフラ”へ拡張。',
    screen: screen2(),
    cards: cards2,
    legend: `<span class="lg"><span class="ldot solid"></span>新規機能</span><span class="lg"><span class="ldot outline"></span>進化</span><span class="lg-note">※ さらに、ここまでできるようになる</span>`,
  }),
]

/* ============================ CSS ============================ */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Noto+Serif+JP:wght@500;600&family=Noto+Sans+JP:wght@400;500;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --navy950:#020815;--navy900:#050f1e;--navy800:#0a1a30;--navy700:#0f223b;--navy600:#162e4d;--navy500:#1e3a5f;
  --navy100:#cbd3e3;--navy50:#eef1f7;
  --gold500:#c9a55c;--gold400:#d4ac4a;--gold300:#dfbe6c;--gold200:#ead498;--gold100:#f4e8c4;--gold600:#a98442;
  --cream50:#fdfcf8;--cream100:#f7f4ea;--cream200:#efe9d3;
}
body{font-family:'Noto Sans JP',-apple-system,'Segoe UI',sans-serif;background:#000}
.serif{font-family:'Cormorant Garamond','Noto Serif JP',serif;letter-spacing:.04em}
.gold-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(201,165,92,.6),transparent)}
.ic{display:block}.ic.gold{color:var(--gold500)}

.slide{position:relative;width:1920px;height:1080px;overflow:hidden;color:var(--cream50);
  background:radial-gradient(1200px 700px at 82% -10%,rgba(201,165,92,.16),transparent 60%),linear-gradient(135deg,#08152a 0%,#050f1e 45%,#020815 100%);
  padding:52px 64px;display:flex;flex-direction:column}
.bg-glow{position:absolute;inset:0;background:radial-gradient(900px 500px at 12% 115%,rgba(30,58,95,.5),transparent 60%);pointer-events:none}
.bg-key{position:absolute;right:-120px;bottom:-160px;opacity:.05;transform:rotate(8deg);pointer-events:none}
.frame{position:absolute;inset:26px;border:1px solid rgba(201,165,92,.22);border-radius:10px;pointer-events:none}

/* header */
.s-head{position:relative;display:flex;justify-content:space-between;align-items:flex-start;z-index:2}
.chip{display:inline-block;font-size:14px;font-weight:700;letter-spacing:.28em;color:var(--gold300);
  border:1px solid rgba(201,165,92,.45);border-radius:999px;padding:6px 16px;background:rgba(201,165,92,.06)}
.s-title{font-size:54px;font-weight:600;color:#fff;margin-top:14px;line-height:1.05}
.s-en{font-size:18px;color:var(--gold200);letter-spacing:.18em;margin-top:6px;font-weight:500}
.s-head-r{display:flex;flex-direction:column;align-items:flex-end;gap:18px}
.brand{display:flex;align-items:center;gap:10px}
.brand span{font-size:22px;color:var(--gold200);text-transform:uppercase;letter-spacing:.22em;font-weight:600}
.prog{display:flex;align-items:center;gap:8px}
.pseg{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.14em;color:rgba(203,211,227,.5)}
.pseg .pdot{width:9px;height:9px;border-radius:50%;border:1.5px solid rgba(203,211,227,.4);background:transparent}
.pseg.done{color:var(--gold200)}.pseg.done .pdot{background:var(--gold500);border-color:var(--gold500)}
.pseg.on{color:#fff}.pseg.on .pdot{background:var(--gold400);border-color:var(--gold200);box-shadow:0 0 0 4px rgba(201,165,92,.25)}
.pbar{width:34px;height:1.5px;background:rgba(201,165,92,.3)}

/* main */
.s-main{position:relative;z-index:2;flex:1;display:flex;gap:54px;margin-top:30px;min-height:0}
.phone-col{display:flex;flex-direction:column;align-items:center;gap:18px;flex-shrink:0}
.phone-cap{width:392px;font-size:15px;line-height:1.6;color:var(--navy100);text-align:center;font-weight:500}

/* phone */
.phone{position:relative;width:392px;height:806px;background:linear-gradient(160deg,#1a2336,#05080f);border-radius:50px;
  padding:11px;box-shadow:0 0 0 2px rgba(201,165,92,.3),0 40px 80px -20px rgba(0,0,0,.8),inset 0 0 0 1px rgba(255,255,255,.05)}
.island{position:absolute;top:22px;left:50%;transform:translateX(-50%);width:108px;height:28px;background:#000;border-radius:999px;z-index:10}
.screen{width:100%;height:100%;background:var(--cream50);border-radius:40px;overflow:hidden;display:flex;flex-direction:column;color:var(--navy900)}

/* app header */
.app-header{background:var(--navy900);padding:34px 16px 12px;display:flex;justify-content:center}
.app-wm{display:flex;flex-direction:column;align-items:center;gap:3px}
.app-wm span{font-family:'Cormorant Garamond','Noto Serif JP',serif;color:#fff;text-transform:uppercase;letter-spacing:.22em;font-size:13px}
.app-body{flex:1;overflow:hidden;padding:14px 12px;display:flex;flex-direction:column;gap:12px;background:var(--cream50)}

/* messages */
.msg{display:flex;gap:8px}.msg.user{justify-content:flex-end}
.avatar{flex-shrink:0;margin-top:2px}
.bubble{max-width:255px;font-size:13px;line-height:1.55;padding:9px 13px;border-radius:12px;box-shadow:0 1px 2px rgba(5,15,30,.08)}
.user-b{background:var(--navy800);color:#fff;border-bottom-right-radius:4px}
.bot-b{background:#fff;color:var(--navy900);border:1px solid rgba(201,165,92,.4);border-bottom-left-radius:4px}
.bot-b b{color:var(--gold600)}
.card-elev{background:#fff;border-radius:14px;border:1px solid rgba(201,165,92,.4);box-shadow:0 8px 24px -8px rgba(30,58,95,.25)}

/* briefing */
.brief{padding:14px 15px;width:262px}
.brief-label{font-size:9px;letter-spacing:.2em;color:var(--gold600);font-weight:700}
.brief-date{font-size:11px;color:var(--navy600);margin-top:2px}
.brief-title{font-size:18px;color:var(--navy900);margin:3px 0 8px;font-weight:600}
.sec-h{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--navy700);letter-spacing:.04em;margin-top:11px;text-transform:uppercase}
.sec-h .ic{color:var(--gold600)}
.ev{border:1px solid var(--navy50);background:rgba(253,252,248,.6);border-radius:8px;padding:8px 10px;margin-top:7px}
.ev-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ev-time{font-size:12px;color:var(--navy700);font-variant-numeric:tabular-nums;font-weight:500}
.ev-loc{font-size:10px;color:var(--navy600)}
.ev-title{font-size:13px;font-weight:600;color:var(--navy900);margin-top:3px}
.cal-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px}
.tk{display:flex;align-items:center;gap:7px;border:1px solid var(--navy50);background:rgba(253,252,248,.6);border-radius:8px;padding:6px 10px;margin-top:7px}
.pri{font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px}
.pri.hi{background:#fde2e2;color:#c0392b}.pri.mid{background:var(--gold100);color:var(--gold600)}
.tk-t{font-size:12px;color:var(--navy800);flex:1}.tk-d{font-size:10px;color:var(--navy500)}

/* push toast */
.push-toast{display:flex;gap:10px;align-items:center;background:rgba(10,26,48,.96);color:#fff;border-radius:14px;padding:11px 13px;border:1px solid rgba(201,165,92,.4);box-shadow:0 10px 24px -10px rgba(0,0,0,.5)}
.push-toast .ic{color:var(--gold300);flex-shrink:0}
.pt-h{font-size:11px;color:var(--gold200);font-weight:700;letter-spacing:.06em}
.pt-b{font-size:12px;margin-top:2px;line-height:1.4}

/* slot */
.slot{padding:11px;width:262px}
.slot-row{border:1px solid var(--navy50);border-radius:9px;margin-bottom:8px;overflow:hidden;background:#fff}
.slot-row.sel{border-color:var(--gold400);background:rgba(244,232,196,.25)}
.slot-line{display:flex;align-items:center;gap:8px;padding:9px 11px;font-size:13px;font-weight:600;color:var(--navy900)}
.slot-line span{font-variant-numeric:tabular-nums}
.slot-line .ic:last-child{margin-left:auto}
.slot-actions{border-top:1px solid var(--gold200);background:var(--cream100);padding:9px}
.loc-input{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--navy500);background:#fff;border:1px solid var(--navy100);border-radius:7px;padding:7px 9px}
.btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}
.sbtn{font-size:11px;font-weight:700;text-align:center;padding:8px 0;border-radius:7px;color:#fff}
.sbtn.navy{background:var(--navy700)}.sbtn.navy2{background:var(--navy600)}
.sbtn.gold{grid-column:span 2;background:linear-gradient(90deg,var(--gold500),var(--gold400));color:var(--navy900)}

/* guard / reco */
.guard{padding:13px 14px;width:262px}
.guard-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--navy800);letter-spacing:.04em}
.guard-b{font-size:12.5px;line-height:1.55;color:var(--navy800);margin-top:8px}
.guard-b b{color:var(--gold600)}
.route{display:flex;align-items:center;gap:6px;margin-top:11px;padding-top:10px;border-top:1px solid var(--navy50)}
.route .dot{width:8px;height:8px;border-radius:50%;background:var(--navy500)}.route .dot.gold{background:var(--gold500)}
.route-l{font-size:11px;color:var(--navy700);font-weight:600}
.route-line{flex:1;height:1px;background:repeating-linear-gradient(90deg,var(--navy100) 0 4px,transparent 4px 8px)}
.route-t{font-size:10px;color:var(--gold600);font-weight:700}
.reco{padding:11px 13px;width:230px}
.reco-h{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--navy700)}
.reco-t{font-size:13px;font-weight:600;color:var(--navy900);margin-top:5px;display:flex;align-items:center;gap:7px}
.reco-tag{font-size:9px;background:var(--gold100);color:var(--gold600);padding:2px 7px;border-radius:4px;font-weight:700}
.tts{display:flex;align-items:center;gap:6px}

/* input bar */
.input-bar{background:#fff;border-top:1px solid rgba(201,165,92,.4);padding:11px 12px;display:flex;align-items:center;gap:9px}
.mic{width:42px;height:42px;border-radius:50%;background:var(--navy800);color:var(--gold300);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px rgba(201,165,92,.4)}
.field{flex:1;font-size:12px;color:var(--navy500);background:#fff;border:1px solid var(--navy100);border-radius:8px;padding:11px 13px}
.send{width:42px;height:42px;border-radius:50%;background:var(--navy800);color:var(--gold300);display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* bottom nav */
.bnav{background:var(--navy900)}
.bnav-row{display:grid;grid-template-columns:repeat(5,1fr)}
.bnav-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 0 11px;color:rgba(255,255,255,.55);font-size:9px;letter-spacing:.1em;text-transform:uppercase}
.bnav-item.on{color:var(--gold400)}

/* cards column */
.cards-col{flex:1;display:flex;flex-direction:column;min-width:0}
.cards-grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:14px}
.fcard{display:flex;align-items:center;gap:15px;background:linear-gradient(145deg,rgba(22,46,77,.55),rgba(10,26,48,.35));
  border:1px solid rgba(201,165,92,.22);border-radius:14px;padding:0 18px;position:relative;backdrop-filter:blur(2px)}
.fic{width:46px;height:46px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 30% 30%,rgba(201,165,92,.25),rgba(201,165,92,.05));color:var(--gold300);border:1px solid rgba(201,165,92,.3)}
.ftxt{flex:1;min-width:0}
.ft{font-size:17px;font-weight:700;color:#fff;line-height:1.25}
.fs{font-size:13px;color:var(--navy100);margin-top:3px;line-height:1.3}
.ftag{font-size:11px;font-weight:700;padding:4px 11px;border-radius:999px;flex-shrink:0;letter-spacing:.04em}
.ftag.solid{background:linear-gradient(90deg,var(--gold500),var(--gold400));color:var(--navy900)}
.ftag.outline{background:transparent;border:1px solid rgba(201,165,92,.55);color:var(--gold200)}

/* legend */
.legend{display:flex;align-items:center;gap:22px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(201,165,92,.18)}
.lg{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--navy100);font-weight:500}
.ldot{width:14px;height:14px;border-radius:50%}
.ldot.solid{background:linear-gradient(90deg,var(--gold500),var(--gold400))}
.ldot.outline{background:transparent;border:1.5px solid var(--gold400)}
.lg-note{margin-left:auto;font-size:13px;color:var(--gold200);font-style:italic;letter-spacing:.02em}
`

/* ============================ HTML 出力 ============================ */
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}</style></head><body>${slides.join('\n')}</body></html>`
const htmlPath = join(__dirname, 'slides.html')
writeFileSync(htmlPath, html)
console.log('wrote', htmlPath)

/* ============================ スクショ ============================ */
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('file://' + htmlPath.replace(/\\/g, '/'))
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(600)
for (const id of ['p0', 'p1', 'p2']) {
  const el = await page.$('#' + id)
  await el.screenshot({ path: join(__dirname, `roadmap-${id}.png`) })
  console.log('shot', id)
}
await browser.close()
console.log('done')
