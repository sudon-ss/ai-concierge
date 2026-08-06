import { chromium } from 'playwright'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const I = {
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
}
const icon = (n, s = 22, cls = '') =>
  `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`

const mark = (size = 26) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="m${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ead498"/><stop offset="50%" stop-color="#d4ac4a"/><stop offset="100%" stop-color="#a98442"/></linearGradient></defs>
  <g transform="translate(32 32)">
    <g transform="rotate(45)" stroke="url(#m${size})" stroke-width="2.2" fill="none" stroke-linecap="round"><circle cx="-15" cy="0" r="5"/><circle cx="-15" cy="0" r="1.6" fill="url(#m${size})" stroke="none"/><line x1="-10" y1="0" x2="17" y2="0"/><line x1="10" y1="0" x2="10" y2="4"/><line x1="14" y1="0" x2="14" y2="4"/><line x1="17" y1="0" x2="17" y2="3"/></g>
    <g transform="rotate(-45)" stroke="url(#m${size})" stroke-width="2.2" fill="none" stroke-linecap="round"><circle cx="-15" cy="0" r="5"/><circle cx="-15" cy="0" r="1.6" fill="url(#m${size})" stroke="none"/><line x1="-10" y1="0" x2="17" y2="0"/><line x1="10" y1="0" x2="10" y2="4"/><line x1="14" y1="0" x2="14" y2="4"/><line x1="17" y1="0" x2="17" y2="3"/></g>
  </g></svg>`

const chip = (ic, t) => `<div class="cap"><div class="cap-ic">${icon(ic, 18)}</div><span>${t}</span></div>`
const tbl = (t, sub) => `<div class="tchip"><span class="tt">${t}</span>${sub ? `<span class="tsub">${sub}</span>` : ''}</div>`
const ext = (ic, t, s) => `<div class="extc"><div class="ext-ic">${icon(ic, 22)}</div><div><p class="extt">${t}</p><p class="exts">${s}</p></div></div>`
const point = (n, t, s) => `<div class="pt"><span class="pt-n">${n}</span><div><p class="pt-t">${t}</p><p class="pt-s">${s}</p></div></div>`

const slide = `
<section class="slide" id="a1">
  <div class="bg-key">${mark(620)}</div><div class="frame"></div>
  <header class="s-head">
    <div><span class="chip">ARCHITECTURE</span><h1 class="serif s-title">「2アプリ」ではない ― 1アプリ＋薄い層</h1><p class="s-en">One App, One Backend — Low Build Risk</p></div>
    <div class="brand">${mark(26)}<span class="serif">The Concierge</span></div>
  </header>
  <main class="s-main">
    <div class="diagram">
      <!-- CLIENT -->
      <div class="band"><span class="band-label">CLIENT ― 同一コードベース（ロールで出し分け）</span>
        <div class="client-row">
          <div class="cli-card"><div class="cli-ic">${icon('smartphone', 26)}</div><div class="cli-tx"><p class="cli-t">個人秘書（モバイル）</p><p class="cli-s">音声入力・朝ブリーフィング・承認・移動ガード</p></div><span class="role member">全社員</span></div>
          <div class="cli-card"><div class="cli-ic">${icon('monitor', 26)}</div><div class="cli-tx"><p class="cli-t">管理ダッシュボード（Web）</p><p class="cli-s">稼働KPI・席管理・チーム調整・監査</p></div><span class="role admin">部長 / 管理者</span></div>
        </div>
      </div>
      <div class="flow"><span>↕ 同一 React アプリ・同一API（読み書き）</span></div>
      <!-- BACKEND -->
      <div class="band band-core"><span class="band-label gold">BACKEND ― Supabase 1個（新しいバックエンドは作らない）</span>
        <div class="core-head">${icon('database', 22, 'gold')}<span>Supabase（PostgreSQL）= 単一バックエンド</span></div>
        <div class="caps">
          ${chip('lock', 'Auth / SSO')}
          ${chip('shield', 'RLS：席ごとにデータ分離')}
          ${chip('sparkles', 'pgvector：記憶（前回◯◯社の宿題）')}
          ${chip('zap', 'Edge Functions：Cron / Push')}
        </div>
        <div class="data-box"><p class="data-label">データ層</p>
          <div class="tbls">
            ${tbl('events', '予定')}${tbl('tasks', 'タスク')}${tbl('messages', '会話')}
            ${tbl('contacts', '取引先 ★')}${tbl('telemetry', '行動ログ ★')}${tbl('org', '組織・席 ★')}
          </div>
        </div>
        <div class="views">${icon('layers', 16, 'gold')}<span><b>集計ビュー（SQL Views）</b> → 管理ダッシュボードは"読むだけ"。組織機能の8割は RLS＋ビューで完結</span></div>
      </div>
      <div class="flow"><span>↕ OAuth・外部API</span></div>
      <!-- EXTERNAL -->
      <div class="band"><span class="band-label">EXTERNAL ― 外部連携</span>
        <div class="ext-row">
          ${ext('calendar', 'Google / Outlook', 'OAuth・双方向同期')}
          ${ext('cpu', 'Claude API', '音声→予定の解析・メモ判定')}
          ${ext('map', 'Google Maps', '移動時間ガード')}
        </div>
      </div>
    </div>
    <div class="side">
      <p class="side-h">なぜ「2アプリ」に<br>ならないのか</p>
      ${point('1', '1コードベース / 1 Supabase', '認証もDBも同期も二重化しない')}
      ${point('2', '組織レイヤー＝既存データの読み取り・集計', '新しいドメイン（書き込み）を作らない')}
      ${point('3', 'RLSで席分離が"標準装備"', '組織機能の8割をSupabaseが肩代わり')}
      ${point('4', 'スキーマ先・UI後', 'Phase1でorg_id/RLS/telemetryを先に。retrofit回避')}
      <div class="cost">
        <p class="cost-x">開発コスト</p>
        <p class="cost-v"><s>2倍</s> ではなく</p>
        <p class="cost-big">1× ＋ 20–30%</p>
      </div>
    </div>
  </main>
</section>`

const css = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Noto+Serif+JP:wght@500;600&family=Noto+Sans+JP:wght@400;500;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--navy900:#050f1e;--navy800:#0a1a30;--navy700:#0f223b;--navy600:#162e4d;--navy500:#1e3a5f;--navy100:#cbd3e3;
--gold500:#c9a55c;--gold400:#d4ac4a;--gold300:#dfbe6c;--gold200:#ead498;--gold600:#a98442;--cream50:#fdfcf8}
body{font-family:'Noto Sans JP',sans-serif;background:#000}
.serif{font-family:'Cormorant Garamond','Noto Serif JP',serif;letter-spacing:.04em}
.ic{display:block}.ic.gold{color:var(--gold400)}
.slide{position:relative;width:1920px;height:1080px;overflow:hidden;color:var(--cream50);padding:50px 64px;display:flex;flex-direction:column;
background:radial-gradient(1200px 700px at 82% -10%,rgba(201,165,92,.16),transparent 60%),linear-gradient(135deg,#08152a,#050f1e 45%,#020815)}
.bg-key{position:absolute;right:-120px;bottom:-160px;opacity:.05;transform:rotate(8deg)}
.frame{position:absolute;inset:26px;border:1px solid rgba(201,165,92,.22);border-radius:10px}
.s-head{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-start}
.chip{display:inline-block;font-size:14px;font-weight:700;letter-spacing:.28em;color:var(--gold300);border:1px solid rgba(201,165,92,.45);border-radius:999px;padding:6px 16px;background:rgba(201,165,92,.06)}
.s-title{font-size:48px;font-weight:600;color:#fff;margin-top:13px;line-height:1.05}
.s-en{font-size:17px;color:var(--gold200);letter-spacing:.16em;margin-top:6px}
.brand{display:flex;align-items:center;gap:10px}
.brand span{font-size:21px;color:var(--gold200);text-transform:uppercase;letter-spacing:.22em;font-weight:600}
.s-main{position:relative;z-index:2;flex:1;display:flex;gap:44px;margin-top:22px;min-height:0}

/* diagram */
.diagram{flex:1.65;display:flex;flex-direction:column;justify-content:center}
.band{position:relative;border:1px solid rgba(201,165,92,.25);border-radius:16px;padding:20px;background:rgba(5,15,30,.4)}
.band-core{border-color:rgba(201,165,92,.5);background:rgba(201,165,92,.05)}
.band-label{position:absolute;top:-11px;left:22px;background:#071226;padding:0 12px;font-size:12px;letter-spacing:.16em;color:var(--navy100);font-weight:700}
.band-label.gold{color:var(--gold300)}
.client-row{display:flex;gap:16px}
.cli-card{flex:1;display:flex;align-items:center;gap:14px;background:linear-gradient(145deg,rgba(22,46,77,.6),rgba(10,26,48,.4));border:1px solid rgba(201,165,92,.3);border-radius:12px;padding:14px 16px}
.cli-ic{width:48px;height:48px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 30%,rgba(201,165,92,.25),rgba(201,165,92,.05));color:var(--gold300);border:1px solid rgba(201,165,92,.3)}
.cli-tx{flex:1;min-width:0}
.cli-t{font-size:19px;font-weight:700;color:#fff}
.cli-s{font-size:13px;color:var(--navy100);margin-top:3px}
.role{font-size:12px;font-weight:700;padding:4px 11px;border-radius:999px;flex-shrink:0}
.role.member{background:rgba(203,211,227,.15);color:var(--navy100);border:1px solid rgba(203,211,227,.3)}
.role.admin{background:linear-gradient(90deg,var(--gold500),var(--gold400));color:var(--navy900)}
.flow{display:flex;justify-content:center;margin:11px 0}
.flow span{font-size:13px;color:var(--gold200);background:rgba(201,165,92,.1);border:1px solid rgba(201,165,92,.3);border-radius:999px;padding:5px 18px;font-weight:600}
.core-head{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700;color:#fff;margin-bottom:14px}
.caps{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.cap{display:flex;align-items:center;gap:10px;background:rgba(10,26,48,.6);border:1px solid rgba(201,165,92,.25);border-radius:10px;padding:9px 13px}
.cap-ic{width:34px;height:34px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(201,165,92,.12);color:var(--gold300)}
.cap span{font-size:14.5px;font-weight:600;color:var(--cream50)}
.data-box{border:1px dashed rgba(201,165,92,.35);border-radius:10px;padding:12px 14px;background:rgba(5,15,30,.4)}
.data-label{font-size:11px;letter-spacing:.18em;color:var(--gold300);font-weight:700;margin-bottom:9px}
.tbls{display:flex;flex-wrap:wrap;gap:9px}
.tchip{display:flex;flex-direction:column;background:rgba(22,46,77,.7);border:1px solid rgba(203,211,227,.2);border-radius:8px;padding:7px 13px}
.tt{font-size:14px;font-weight:700;color:#fff;font-family:ui-monospace,monospace}
.tsub{font-size:10.5px;color:var(--navy100);margin-top:1px}
.views{display:flex;align-items:center;gap:9px;margin-top:13px;font-size:14px;color:var(--cream50);background:rgba(201,165,92,.1);border:1px solid rgba(201,165,92,.3);border-radius:10px;padding:11px 14px}
.views b{color:var(--gold200)}
.ext-row{display:flex;gap:14px}
.extc{flex:1;display:flex;align-items:center;gap:12px;background:rgba(10,26,48,.5);border:1px solid rgba(201,165,92,.22);border-radius:11px;padding:12px 14px}
.ext-ic{width:42px;height:42px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(201,165,92,.1);color:var(--gold300);border:1px solid rgba(201,165,92,.25)}
.extt{font-size:16px;font-weight:700;color:#fff}
.exts{font-size:12px;color:var(--navy100);margin-top:2px}

/* side */
.side{flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px}
.side-h{font-size:27px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:2px}
.pt{display:flex;gap:14px;align-items:flex-start}
.pt-n{flex-shrink:0;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--gold500),var(--gold400));color:var(--navy900);font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center}
.pt-t{font-size:18px;font-weight:700;color:#fff;line-height:1.3}
.pt-s{font-size:14px;color:var(--navy100);margin-top:2px}
.cost{margin-top:10px;border:1px solid rgba(201,165,92,.5);border-radius:16px;padding:18px 22px;background:rgba(201,165,92,.08);text-align:center}
.cost-x{font-size:13px;letter-spacing:.2em;color:var(--gold300);font-weight:700}
.cost-v{font-size:18px;color:var(--navy100);margin-top:5px}
.cost-v s{color:#f0a9a0;opacity:.8}
.cost-big{font-size:40px;font-weight:800;color:#fff;margin-top:4px;font-family:'Cormorant Garamond','Noto Serif JP',serif;letter-spacing:.02em}
`

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}</style></head><body>${slide}</body></html>`
const htmlPath = join(__dirname, 'architecture.html')
writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('file://' + htmlPath.split('\\').join('/'))
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(600)
const el = await page.$('#a1')
await el.screenshot({ path: join(__dirname, 'architecture.png') })
await browser.close()
console.log('done')
