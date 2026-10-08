"""会議メモ（event_notes）のQA。使い捨てのダミーユーザーで実行する（実ユーザーのデータには触れない）。

前提: backend/supabase/migration_event_notes.sql を実行済み、ローカルバックエンドが 8001 で起動中。
  cd backend && PYTHONPATH=../docs/qa .venv/Scripts/python.exe ../docs/qa/qa_notes.py
"""
import asyncio
import atexit
import sys
import uuid

sys.path.insert(0, ".")
from qa_lib import FAIL, PASS, Recorder, chat, client, get_supabase  # noqa: E402

from app import notes as n  # noqa: E402
from app import tools  # noqa: E402

R = Recorder("notes")
s = get_supabase()


def mk(tag):
    u = str(uuid.uuid4())
    s.table("users").insert({"id": u, "email": f"qa-notes-{tag}-{u[:6]}@example.invalid"}).execute()
    return u


A, B = mk("a"), mk("b")


def cleanup():
    for u in (A, B):
        for t in ("event_notes", "tasks", "messages", "user_settings"):
            try:
                s.table(t).delete().eq("user_id", u).execute()
            except Exception:  # noqa: BLE001
                pass
        s.table("users").delete().eq("id", u).execute()


atexit.register(cleanup)
a, b = client(A), client(B)

# 1. 保存・取得
base = dict(refs=["google:evt-1"], title="清原さん定例会", start="2026-10-01T15:00:00+09:00", end="2026-10-01T16:00:00+09:00",
            series_key="series-kiyohara", body="見積書を来週月曜までに送る。契約書の原本を持参。", flagged=False)
r = a.put("/api/notes", json=base)
nid = r.json().get("id")
R.check("N1", "保存", "予定にメモを保存できる（重要度はAIが判定）", "200・priority=critical/high", f"{r.status_code} priority={r.json().get('priority')}",
        r.status_code == 200 and r.json().get("priority") in ("critical", "high"))
r = a.get(f"/api/notes/{nid}")
R.check("N2", "取得", "全文を取得できる", "bodyが保存した内容と一致", r.status_code, r.status_code == 200 and r.json()["body"] == base["body"].strip())

# 2. 同じ予定への保存は更新（1予定1メモ）。同じ会議のコピー（別カレンダーのID）が増えても1つ
r = a.put("/api/notes", json={**base, "refs": ["google:evt-1", "outlook:evt-1o"], "body": base["body"] + "\n追記: 次回は11/5。"})
cnt = len(s.table("event_notes").select("id").eq("user_id", A).execute().data)
row = s.table("event_notes").select("event_refs,body").eq("user_id", A).execute().data[0]
R.check("N3", "紐付け", "同じ予定への再保存は更新（メモは1件のまま）、別カレンダーのコピーのIDも覚える", "1件・refsに両方・追記済み",
        f"{cnt}件 refs={row['event_refs']}", cnt == 1 and set(row["event_refs"]) == {"google:evt-1", "outlook:evt-1o"} and "次回は11/5" in row["body"])
# 日時を変更しても（予定のIDが同じなら）同じメモにつながる
r = a.put("/api/notes", json={**base, "start": "2026-10-03T10:00:00+09:00", "end": "2026-10-03T11:00:00+09:00", "body": "日時変更後の更新"})
cnt = len(s.table("event_notes").select("id").eq("user_id", A).execute().data)
R.check("N4", "紐付け", "予定の日時を変更しても、同じメモに紐付く（新しいメモが増えない）", "1件", cnt, cnt == 1)

# 3. 削除の扱い（本文が空→削除。重要マークだけ付いていれば残る）
r = a.put("/api/notes", json={**base, "refs": ["google:evt-flag"], "title": "旗だけ", "body": "", "flagged": True})
R.check("N5", "削除", "本文が空でも、重要マークが付いていればメモは残る", "idあり", r.json().get("id") is not None, r.json().get("id") is not None)
r = a.put("/api/notes", json={**base, "refs": ["google:evt-flag"], "title": "旗だけ", "body": "", "flagged": False})
R.check("N6", "削除", "本文が空で重要マークも無ければ、メモは削除される", "deleted", r.json(), r.json() == {"deleted": True})
r = a.put("/api/notes", json={**base, "refs": ["google:evt-2"], "title": "自動では消えない確認", "body": "残すメモ"})
n2 = r.json()["id"]
R.check("N7", "削除", "メモは個別の削除操作でのみ消える（DELETE）", "200・取得は404",
        f"{a.delete(f'/api/notes/{n2}').status_code}/{a.get(f'/api/notes/{n2}').status_code}",
        a.get(f"/api/notes/{n2}").status_code == 404)

# 4. 検索
seed = [
    ("google:s1", "清原さん定例会", "2026-09-17T15:00:00+09:00", "9月: 見積書の内容を確認。次回までに修正版を出す。"),
    ("google:s2", "清原さん定例会", "2026-09-24T15:00:00+09:00", "9月24日: 修正版の見積書を提出。工期は12月5日。"),
    ("google:s3", "DX定例会", "2026-09-30T14:00:00+09:00", "システム刷新の進捗。ベンダー選定は来月。"),
    ("outlook:s4", "［仮］ 清原さん　定例会", "2026-10-08T15:00:00+09:00", "仮予定の時点でのメモ。"),
]
for ref, t, st, body in seed:
    a.put("/api/notes", json={"refs": [ref], "title": t, "start": st, "body": body})
res = a.get("/api/notes/search", params={"q": "見積書"}).json()
R.check("N8", "検索", "キーワードで探せる（新しい会議から順）", "清原さん定例会の2件・新しい順", [x["start"][:10] for x in res],
        [x["start"][:10] for x in res] == ["2026-09-24", "2026-09-17"])
res = a.get("/api/notes/search", params={"q": "見積書 工期"}).json()
R.check("N9", "検索", "複数のキーワードは、すべてを含むメモだけ", "1件（9/24）", [x["start"][:10] for x in res], len(res) == 1 and res[0]["start"].startswith("2026-09-24"))
res = a.get("/api/notes/search", params={"start": "2026-09-20", "end": "2026-09-30"}).json()
R.check("N10", "検索", "期間で探せる", "9/24と9/30の2件", sorted(x["start"][:10] for x in res), sorted(x["start"][:10] for x in res) == ["2026-09-24", "2026-09-30"])
rows = n.search_notes(A, title="清原さん定例会", date_to="2026-10-01T00:00:00+09:00", limit=3)
R.check("N11", "検索", "会議名での検索は、全角半角・空白・［仮］の違いを吸収する（「前回の〇〇」用）", "［仮］付きを含む3件ではなく、期間内の2件",
        [r["event_start"][:10] for r in rows], len(rows) == 2)
rows = n.search_notes(A, title="清原さん定例会", limit=10)
R.check("N12", "検索", "［仮］付き・全角空白入りの同名会議も、同じ会議として見つかる", "3件", len(rows), len(rows) == 3)
res = a.get("/api/notes/search", params={"q": "ベンダー", "limit": 1}).json()
R.check("N13", "検索", "検索結果の本文は要約（全文ではない）、limitが効く", "1件", len(res), len(res) == 1)

# 5. 他のユーザーのメモは見えない・触れない
other = a.get(f"/api/notes/{nid}")
R.check("N14", "権限", "他のユーザーは、メモを取得・削除・検索で見られない", "404／消えない／0件",
        f"{b.get(f'/api/notes/{nid}').status_code}/{b.delete(f'/api/notes/{nid}').status_code}→残存{other.status_code}/検索{len(b.get('/api/notes/search', params={'q': '見積書'}).json())}件",
        b.get(f"/api/notes/{nid}").status_code == 404 and a.get(f"/api/notes/{nid}").status_code == 200
        and len(b.get("/api/notes/search", params={"q": "見積書"}).json()) == 0)
R.check("N15", "権限", "認証なしは401", "401", client(None).get("/api/notes/search").status_code, client(None).get("/api/notes/search").status_code == 401)

# 6. 不正な入力
bad = [
    ("識別情報の形式が不正", {**base, "refs": ["yahoo:1"]}),
    ("識別情報が空", {**base, "refs": []}),
    ("本文が長すぎる", {**base, "body": "あ" * 5001}),
    ("日時の形式が不正", {**base, "start": "あした"}),
    ("件名が空", {**base, "title": ""}),
]
for i, (name, body) in enumerate(bad):
    r = a.put("/api/notes", json=body)
    R.add(f"N{16+i}", "入力検証", f"不正な入力（{name}）は5xxにならず拒否される", "422", r.status_code, PASS if r.status_code == 422 else FAIL)
R.check("N21", "入力検証", "UUIDでないメモIDは404（500ではない）", "404", a.get("/api/notes/abc").status_code, a.get("/api/notes/abc").status_code == 404)
R.check("N22", "入力検証", "期間の形式が不正な検索は422", "422", a.get("/api/notes/search", params={"start": "あした"}).status_code, a.get("/api/notes/search", params={"start": "あした"}).status_code == 422)

# 7. 予定一覧への「メモあり」の付与
events = [
    {"id": "evt-1", "title": "清原さん定例会", "start": "2026-10-03T10:00:00+09:00", "source": "both",
     "copies": [{"id": "evt-1", "source": "google"}, {"id": "evt-1o", "source": "outlook"}]},
    {"id": "evt-x", "title": "メモなしの会議", "start": "2026-10-03T13:00:00+09:00", "source": "google"},
]
out = n.annotate_events(A, [dict(e) for e in events])
R.check("N23", "予定一覧", "メモのある予定にだけ、メモ（要約・重要度）が付く。複数カレンダーの同じ会議も1つのメモ", "evt-1にあり・evt-xに無し",
        [("note" in e) for e in out], ("note" in out[0]) and ("note" not in out[1]))
# 日時が大きく変わった予定（60日以内）も、IDが同じなら一覧で見つかる
moved = [{"id": "evt-1", "title": "清原さん定例会", "start": "2026-11-20T10:00:00+09:00", "source": "google"}]
R.check("N24", "予定一覧", "予定を別の日へ移しても（IDが同じなら）、一覧でメモが見つかる", "noteあり", "note" in n.annotate_events(A, moved)[0],
        "note" in n.annotate_events(A, [dict(moved[0])])[0])

# 8. チャットからの検索・保存
o = chat(a, "前回の清原さんの定例会で、何て話したか教えて")
used = [t.get("name") for t in o["tool_events"]]
R.add("N25", "チャット", "「前回の〇〇どうだった？」でメモを検索して答える", "search_notesを呼び、修正版・工期などメモの内容に触れる",
      f"tools={used} 返答={o['reply'][:150]!r}",
      PASS if "search_notes" in used and any(k in o["reply"] for k in ("修正版", "工期", "12月5日", "見積")) else FAIL)
o = chat(a, "DX定例会のメモを探して")
used = [t.get("name") for t in o["tool_events"]]
R.add("N26", "チャット", "会議名を言われたら、その会議のメモを答える", "search_notesを呼び、システム刷新・ベンダーに触れる",
      f"tools={used} 返答={o['reply'][:120]!r}",
      PASS if "search_notes" in used and any(k in o["reply"] for k in ("刷新", "ベンダー")) else FAIL)
o = chat(a, "存在しない太郎商事との会議のメモを教えて")
R.add("N27", "チャット", "該当するメモが無いときは、無いと正直に答える（作り話をしない）", "「ない」旨", f"返答={o['reply'][:120]!r}",
      PASS if any(k in o["reply"] for k in ("ございません", "見つかりません", "ありません", "ない")) else FAIL)

# save_note（カレンダーが必要なため、予定の取得だけ差し替えて、保存と追記の動作を確認する）
fake = [{"id": "fake-evt", "title": "新規の定例会", "start": "2026-10-06T10:00:00+09:00", "end": "2026-10-06T11:00:00+09:00",
         "source": "google", "series_id": "series-fake", "copies": [{"id": "fake-evt", "source": "google"}]}]


async def fake_load(*_a, **_k):
    return fake


orig = tools._load_events
tools._load_events = fake_load
try:
    r1 = asyncio.run(tools.save_note(A, event_id="fake-evt", text="最初のメモ: 持参物は契約書。"))
    r2 = asyncio.run(tools.save_note(A, event_id="fake-evt", text="追記: 来週に再訪。"))
    r3 = asyncio.run(tools.save_note(A, event_id="fake-evt", text="置き換え後の本文", mode="replace"))
    r4 = None
    try:
        asyncio.run(tools.save_note(A, event_id="no-such", text="x"))
    except ValueError as e:
        r4 = str(e)
finally:
    tools._load_events = orig
body2 = r2["note"]["body"]
R.check("N28", "チャット(保存)", "save_note：保存→追記（既存に足す）→置き換えができ、シリーズIDも保存される", "追記で両方残る・置換で上書き・series_key保存",
        f"追記後={body2!r} 置換後={r3['note']['body']!r} series={r3['note']['series_key']}",
        "最初のメモ" in body2 and "追記" in body2 and r3["note"]["body"] == "置き換え後の本文" and r3["note"]["series_key"] == "series-fake")
R.check("N29", "チャット(保存)", "存在しない予定IDは、分かりやすいエラー（保存しない）", "見つかりませんでした", r4, bool(r4) and "見つかりませんでした" in r4)

R.save()
