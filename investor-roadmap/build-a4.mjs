import { chromium } from 'playwright'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const mark = (size = 32) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="mg${size}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#ead498"/><stop offset="50%" stop-color="#d4ac4a"/><stop offset="100%" stop-color="#a98442"/>
  </linearGradient></defs>
  <g transform="translate(32 32)">
    <g transform="rotate(45)" stroke="url(#mg${size})" stroke-width="2.2" fill="none" stroke-linecap="round">
      <circle cx="-15" cy="0" r="5"/><circle cx="-15" cy="0" r="1.6" fill="url(#mg${size})" stroke="none"/>
      <line x1="-10" y1="0" x2="17" y2="0"/><line x1="10" y1="0" x2="10" y2="4"/>
      <line x1="14" y1="0" x2="14" y2="4"/><line x1="17" y1="0" x2="17" y2="3"/>
    </g>
    <g transform="rotate(-45)" stroke="url(#mg${size})" stroke-width="2.2" fill="none" stroke-linecap="round">
      <circle cx="-15" cy="0" r="5"/><circle cx="-15" cy="0" r="1.6" fill="url(#mg${size})" stroke="none"/>
      <line x1="-10" y1="0" x2="17" y2="0"/><line x1="10" y1="0" x2="10" y2="4"/>
      <line x1="14" y1="0" x2="14" y2="4"/><line x1="17" y1="0" x2="17" y2="3"/>
    </g>
  </g>
</svg>`

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Noto+Serif+JP:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --n900:#050f1e;--n800:#0a1a30;--n700:#0f223b;--n600:#162e4d;--n500:#1e3a5f;--n100:#cbd3e3;--n50:#eef1f7;
  --g500:#c9a55c;--g400:#d4ac4a;--g300:#dfbe6c;--g200:#ead498;--g100:#f4e8c4;--g600:#a98442;
  --cream:#fdfcf8;--cream2:#f7f4ea;
}
body{font-family:'Noto Sans JP',sans-serif;background:#fff;width:794px;height:1123px;overflow:hidden}
.serif{font-family:'Cormorant Garamond','Noto Serif JP',serif;letter-spacing:.04em}
.gold-line{height:1px;background:linear-gradient(90deg,transparent,rgba(201,165,92,.7),transparent)}

/* ── PAGE ── */
.page{
  width:794px;height:1123px;
  background:linear-gradient(160deg,#08152a 0%,#050f1e 50%,#020815 100%);
  color:#fff;
  display:flex;flex-direction:column;
  padding:36px 44px 28px;
  position:relative;overflow:hidden;
}
/* 背景装飾 */
.page::before{
  content:'';position:absolute;inset:0;
  background:radial-gradient(700px 500px at 80% -5%,rgba(201,165,92,.14),transparent 60%),
             radial-gradient(500px 400px at 10% 105%,rgba(30,58,95,.4),transparent 60%);
  pointer-events:none;
}
.frame{position:absolute;inset:18px;border:1px solid rgba(201,165,92,.2);border-radius:8px;pointer-events:none}

/* ── HEADER ── */
.hd{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
.hd-brand{display:flex;align-items:center;gap:10px}
.hd-brand span{font-size:15px;text-transform:uppercase;letter-spacing:.28em;color:var(--g200);font-weight:600;font-family:'Cormorant Garamond','Noto Serif JP',serif}
.hd-tag{font-size:11px;letter-spacing:.14em;color:var(--g300);border:1px solid rgba(201,165,92,.4);border-radius:999px;padding:4px 13px;font-weight:700}

/* ── HERO ── */
.hero{position:relative;z-index:2;text-align:center;padding:24px 0 18px}
.hero-en{font-size:11px;letter-spacing:.32em;color:var(--g300);font-weight:700;margin-bottom:14px}
.hero-catch{font-size:40px;font-weight:700;color:#fff;line-height:1.15;font-family:'Cormorant Garamond','Noto Serif JP',serif;letter-spacing:.04em;margin-bottom:10px}
.hero-sub{font-size:13.5px;color:var(--n100);line-height:1.6;letter-spacing:.02em}
.hero-sub b{color:var(--g200)}

/* ── PAIN → SOLUTION ── */
.ps-section{position:relative;z-index:2;display:grid;grid-template-columns:1fr 36px 1fr;gap:0;margin-top:18px}
.ps-head{font-size:10px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px}
.ps-head.pain{color:#f0a9a0;border-bottom:1px solid rgba(240,120,100,.35)}
.ps-head.sol{color:var(--g300);border-bottom:1px solid rgba(201,165,92,.45)}
.ps-arrow{display:flex;flex-direction:column;justify-content:center;align-items:center;padding-top:28px;gap:12px;opacity:.7}
.ps-arrow span{font-size:22px;color:var(--g400);line-height:1}
.ps-row{display:flex;align-items:flex-start;gap:9px;margin-bottom:9px}
.ps-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;margin-top:1px}
.ps-num.pain{background:rgba(240,120,100,.2);color:#f0a9a0;border:1px solid rgba(240,120,100,.4)}
.ps-num.sol{background:rgba(201,165,92,.15);color:var(--g300);border:1px solid rgba(201,165,92,.4)}
.ps-txt{font-size:13px;line-height:1.55;color:#fff}
.ps-txt small{display:block;font-size:11px;color:var(--n100);margin-top:1px}

/* ── VISION ── */
.vision{position:relative;z-index:2;margin-top:18px;background:rgba(201,165,92,.07);border:1px solid rgba(201,165,92,.3);border-radius:12px;padding:14px 18px}
.vision-h{font-size:10px;font-weight:800;letter-spacing:.28em;color:var(--g300);text-transform:uppercase;margin-bottom:11px}
.vision-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.vcard{display:flex;flex-direction:column;gap:5px}
.vc-ic{font-size:20px;margin-bottom:2px}
.vc-t{font-size:13px;font-weight:700;color:#fff;line-height:1.3}
.vc-s{font-size:11.5px;color:var(--n100);line-height:1.45}

/* ── BUSINESS ── */
.biz{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.bcard{border-radius:12px;padding:14px 16px}
.bcard.cost{background:rgba(10,26,48,.6);border:1px solid rgba(203,211,227,.2)}
.bcard.growth{background:rgba(201,165,92,.08);border:1px solid rgba(201,165,92,.4)}
.bc-head{font-size:10px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;margin-bottom:10px}
.bc-head.cost{color:var(--n100)}
.bc-head.growth{color:var(--g300)}
.bc-main{font-size:26px;font-weight:800;color:#fff;font-family:'Cormorant Garamond',serif;line-height:1.1;margin-bottom:4px}
.bc-sub{font-size:12px;color:var(--n100);margin-bottom:8px}
.bc-row{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--n100);margin-top:5px}
.bc-dot{width:5px;height:5px;border-radius:50%;background:var(--g400);flex-shrink:0}
.bc-row b{color:#fff}
.phase-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
.phase-chip{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px}
.phase-chip.p1{background:rgba(203,211,227,.15);color:var(--n100);border:1px solid rgba(203,211,227,.3)}
.phase-chip.p15{background:rgba(201,165,92,.15);color:var(--g200);border:1px solid rgba(201,165,92,.4)}
.phase-chip.p2{background:linear-gradient(90deg,var(--g500),var(--g400));color:var(--n900)}

/* ── FOOTER ── */
.footer{position:relative;z-index:2;margin-top:14px;display:flex;align-items:center;justify-content:space-between}
.ft-url{font-size:11px;color:var(--g200);letter-spacing:.08em}
.ft-note{font-size:10px;color:rgba(203,211,227,.5);text-align:right;line-height:1.5}
</style></head><body>
<div class="page">
  <div class="frame"></div>

  <!-- HEADER -->
  <div class="hd">
    <div class="hd-brand">
      ${mark(28)}
      <span>The Concierge</span>
    </div>
    <div class="hd-tag">INVESTOR BRIEF — CONFIDENTIAL</div>
  </div>
  <div class="gold-line" style="position:relative;z-index:2"></div>

  <!-- HERO -->
  <div class="hero">
    <p class="hero-en">AI EXECUTIVE SECRETARY</p>
    <h1 class="hero-catch serif">声で預ければ、秘書がいる。</h1>
    <p class="hero-sub">
      <b>秘書未保有の多忙な意思決定者</b>（中小社長・士業・開業医・トップ営業）が、<br>
      年間コスト <b>1/60</b> で「秘書がいる状態」を手に入れるAIアプリ。
    </p>
  </div>

  <!-- PAIN → SOLUTION -->
  <div class="ps-section">
    <!-- PAIN -->
    <div>
      <p class="ps-head pain">ペイン ― 自分でやると、こうなる</p>
      <div class="ps-row">
        <span class="ps-num pain">1</span>
        <div class="ps-txt">ダブルブッキング・遅刻<small>2カレンダーを片方しか見ていない → 取引先への謝罪 = 信頼毀損</small></div>
      </div>
      <div class="ps-row">
        <span class="ps-num pain">2</span>
        <div class="ps-txt">前回の文脈を忘れる<small>「また同じこと聞いてる」と思われ、プロの格が落ちる</small></div>
      </div>
      <div class="ps-row">
        <span class="ps-num pain">3</span>
        <div class="ps-txt">日程調整メールに時間がかかる<small>敬語・候補日・返信・再調整のサイクルが重い</small></div>
      </div>
    </div>

    <!-- ARROW -->
    <div class="ps-arrow">
      <span>↓</span><span>↓</span><span>↓</span>
    </div>

    <!-- SOLUTION -->
    <div>
      <p class="ps-head sol">ソリューション ― 秘書が代わりにやる</p>
      <div class="ps-row">
        <span class="ps-num sol">✓</span>
        <div class="ps-txt">Google＋Outlook を横断確認<small>2カレンダーを同時に見るのは市場でほぼ唯一。承認1タップで実行完結</small></div>
      </div>
      <div class="ps-row">
        <span class="ps-num sol">✓</span>
        <div class="ps-txt">対人記憶・会議前ブリーフィング<small>前回の文脈が会議前に自動で出てくる。毎朝7時にPush配信</small></div>
      </div>
      <div class="ps-row">
        <span class="ps-num sol">✓</span>
        <div class="ps-txt">音声一声 → 敬語の調整文を自動生成<small>候補3枠＋仮押さえ＋コピーボタンでLINE/メールに即貼付</small></div>
      </div>
    </div>
  </div>

  <!-- VISION -->
  <div class="vision">
    <p class="vision-h">導入後の未来</p>
    <div class="vision-grid">
      <div class="vcard">
        <div class="vc-ic">🌅</div>
        <div class="vc-t">毎朝、頭に入った状態で動ける</div>
        <div class="vc-s">朝7時のブリーフィングが、今日の"地図"になる</div>
      </div>
      <div class="vcard">
        <div class="vc-ic">🤝</div>
        <div class="vc-t">前回の文脈を持って商談に臨める</div>
        <div class="vc-s">「覚えてくれている」が、信頼と受注を生む</div>
      </div>
      <div class="vcard">
        <div class="vc-ic">🛡️</div>
        <div class="vc-t">ミスゼロで、プロの品格が守られる</div>
        <div class="vc-s">ダブルブッキング・漏れ・遅刻が構造的に消える</div>
      </div>
    </div>
  </div>

  <!-- BUSINESS -->
  <div class="biz">
    <div class="bcard cost">
      <p class="bc-head cost">コスト</p>
      <div class="bc-main serif">¥5,000<span style="font-size:15px;font-weight:500"> /席/月</span></div>
      <p class="bc-sub">BtoB エンタープライズプラン</p>
      <div class="bc-row"><span class="bc-dot"></span><b>50席</b>：月額 ¥250,000</div>
      <div class="bc-row"><span class="bc-dot"></span>秘書採用コストの <b>約 1/60</b></div>
      <div class="bc-row"><span class="bc-dot"></span>1席が1商談を守れば、即 ROI 回収</div>
    </div>
    <div class="bcard growth">
      <p class="bc-head growth">グロース性</p>
      <div class="bc-row" style="margin-top:0"><span class="bc-dot"></span>使うほど<b>対人記憶が蓄積</b>→ 解約コスト増</div>
      <div class="bc-row"><span class="bc-dot"></span>法人50席が毎日起動 → <b>チャーン構造的に低い</b></div>
      <div class="bc-row"><span class="bc-dot"></span>Google / Outlook 混在企業の<b>唯一の統合口</b></div>
      <div class="phase-row">
        <span class="phase-chip p1">Phase1: Android配信</span>
        <span class="phase-chip p15">Phase1.5: 対人記憶</span>
        <span class="phase-chip p2">Phase2: iOS + LINE</span>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="ft-url">https://the-concierge-delta.vercel.app</div>
    <div class="ft-note">
      本資料の裏付け：ロードマップ / 財務戦略 / 技術スタック / 開発スケジュール<br>
      詳細資料は別添にてご提供いたします
    </div>
  </div>
</div>
</body></html>`

const htmlPath = join(__dirname, 'top-sheet.html')
writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('file://' + htmlPath.split('\\').join('/'))
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(700)
await page.screenshot({ path: join(__dirname, 'top-sheet.png'), fullPage: false })
await browser.close()
console.log('done')
