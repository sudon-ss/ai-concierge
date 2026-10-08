"""results/*.json から docs/qa/test-report-<日付>.md を生成する。"""
import json
import sys
from pathlib import Path

here = Path(__file__).parent
date = sys.argv[1] if len(sys.argv) > 1 else "2026-09-19"
mark = {"PASS": "✅", "FAIL": "❌", "NOTE": "⚠️", "SKIP": "⏭"}
parts = {"nocal": "1. API・認証・タスク・設定・チャット異常系・タスク照会・セッション（ダミーユーザー・未連携状態）", "ui": "2. ブラウザ画面（モバイル幅375px）",
         "notes": "4. 会議メモ（保存・紐付け・検索・権限・入力検証・予定一覧・チャット）",
         "cal": "3. カレンダー連携ありの機能（予定CRUD・仮押さえ・空き時間・チャット操作）"}
head = (here / "report_head.md").read_text(encoding="utf-8") if (here / "report_head.md").exists() else ""
out = [f"# THE CONCIERGE 動作テスト記録（{date}）", "", head, ""]
tot = {"PASS": 0, "FAIL": 0, "NOTE": 0, "SKIP": 0}
for key, title in parts.items():
    p = here / "results" / f"{key}.json"
    if not p.exists():
        continue
    rows = json.loads(p.read_text(encoding="utf-8"))
    for r in rows:
        tot[r["verdict"]] += 1
    out += [f"## {title}", "", "| 結果 | ID | 領域 | 確認内容 | 期待 | 実際 |", "|---|---|---|---|---|---|"]
    for r in rows:
        esc = lambda s: str(s).replace("|", "\\|").replace("\n", " ")
        out.append(f"| {mark[r['verdict']]} | {r['id']} | {esc(r['area'])} | {esc(r['title'])} | {esc(r['expect'])} | {esc(r['actual'])}{' ／ ' + esc(r['note']) if r['note'] else ''} |")
    out.append("")
out.insert(3, f"**集計**: ✅ {tot['PASS']} ／ ❌ {tot['FAIL']} ／ ⚠️ {tot['NOTE']} ／ ⏭ {tot['SKIP']}（合計 {sum(tot.values())}）")
(here / f"test-report-{date}.md").write_text("\n".join(out), encoding="utf-8")
print(tot)
