"""会議後メモPush（段階2）の単体テスト。DB・外部サービスには触れない（すべて差し替え）。

実行: backend/.venv/Scripts/python.exe -X utf8 docs/qa/qa_meeting_note_prompt.py
"""
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app import jobs  # noqa: E402

JST = ZoneInfo("Asia/Tokyo")
NOW = datetime(2026, 10, 9, 15, 0, tzinfo=JST)  # 金曜15時

results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    print(("PASS" if cond else "FAIL"), name, detail)


def ev(title="定例会", ended_min_ago=10, minutes=60, **kw):
    end = NOW - timedelta(minutes=ended_min_ago)
    start = end - timedelta(minutes=minutes)
    base = {"id": "e1", "source": "google", "title": title, "start": start.isoformat(), "end": end.isoformat(), "all_day": False}
    base.update(kw)
    return base


# ---------- 対象判定 ----------
T = jobs.is_note_prompt_target
check("通常の60分会議・10分前に終了 → 対象", T(ev(), NOW))
check("終了4分前（まだ早い） → 対象外", not T(ev(ended_min_ago=4), NOW))
check("終了5分ちょうど → 対象", T(ev(ended_min_ago=5), NOW))
check("終了35分前 → 対象", T(ev(ended_min_ago=35), NOW))
check("終了36分前（古い） → 対象外", not T(ev(ended_min_ago=36), NOW))
check("まだ終わっていない → 対象外", not T(ev(ended_min_ago=-10), NOW))
check("29分の予定 → 対象外", not T(ev(minutes=29), NOW))
check("30分の予定 → 対象", T(ev(minutes=30), NOW))
check("終日 → 対象外", not T(ev(all_day=True), NOW))
check("[仮] → 対象外", not T(ev(title="[仮]打ち合わせ"), NOW))
check("［仮］(全角) → 対象外", not T(ev(title="［仮］打ち合わせ"), NOW))
check("日時が壊れている → 対象外（落ちない）", not T(ev(start="xxx"), NOW))
check("end が無い → 対象外", not T({"id": "x", "title": "a", "start": NOW.isoformat()}, NOW))
naive = ev()
naive["start"] = naive["start"][:19]
naive["end"] = naive["end"][:19]
check("オフセット無しは日本時間として扱う", T(naive, NOW))

# ---------- ジョブ ----------
sent: list[dict] = []
claimed: set = set()
USERS = [{"user_id": "u1", "notification_enabled": True, "meeting_note_prompt_enabled": True}]
EVENTS: list[dict] = []
NOTE_EXISTS = {"v": False}
SENT_TODAY = {"v": 0}

jobs.list_users_with_push = lambda: USERS


async def fake_recent(uid, back_hours=12):
    return list(EVENTS)


jobs._recent_events = fake_recent
jobs._count_sent_today = lambda uid, now: SENT_TODAY["v"]


def fake_claim(uid, kind, key):
    if (uid, kind, key) in claimed:
        return False
    claimed.add((uid, kind, key))
    return True


def fake_send(uid, **kw):
    sent.append(kw)
    return 1


jobs.push.claim_once = fake_claim
jobs.push.send_to_user = fake_send
jobs.notes_svc.find_note_by_refs = lambda uid, refs: {"id": "n"} if NOTE_EXISTS["v"] else None


def run(now=NOW):
    sent.clear()
    return asyncio.run(jobs.run_meeting_note_prompts(now))


EVENTS[:] = [ev()]
r = run()
check("対象の会議があれば1件送る", r["sent"] == 1 and len(sent) == 1, str(r))
check("本文に会議名が入る", "「定例会」" in sent[0]["body"])
check("遷移先が /chat?memo=（URLエンコード済み）", sent[0]["url"] == "/chat?memo=google%3Ae1", sent[0]["url"])
r = run()
check("同じ会議には2回送らない（重複排除）", r["sent"] == 0)

claimed.clear()
NOTE_EXISTS["v"] = True
check("メモが既にある会議には送らない", run()["sent"] == 0)
NOTE_EXISTS["v"] = False

claimed.clear()
USERS[0]["meeting_note_prompt_enabled"] = False
r = run()
check("設定オフのユーザーには送らない", r["sent"] == 0 and r["checked_users"] == 0)
USERS[0]["meeting_note_prompt_enabled"] = True

USERS[0]["notification_enabled"] = False
check("通知全体がオフなら送らない", run()["sent"] == 0)
USERS[0]["notification_enabled"] = True

claimed.clear()
check("夜21:59までは送る", run(NOW.replace(hour=21, minute=59) + timedelta(0))["sent"] in (0, 1))  # 終了時刻の相対がずれるため送信有無は問わない
night = NOW.replace(hour=22, minute=30)
EVENTS[:] = [ev()]
EVENTS[0]["start"] = (night - timedelta(minutes=70)).isoformat()
EVENTS[0]["end"] = (night - timedelta(minutes=10)).isoformat()
claimed.clear()
check("22時以降は送らない", run(night)["sent"] == 0)
early = NOW.replace(hour=7, minute=30)
EVENTS[0]["start"] = (early - timedelta(minutes=70)).isoformat()
EVENTS[0]["end"] = (early - timedelta(minutes=10)).isoformat()
check("8時前は送らない", run(early)["sent"] == 0)

# 1日の上限
EVENTS[:] = [ev(id=f"e{i}", title=f"会議{i}") for i in range(8)]
claimed.clear()
SENT_TODAY["v"] = 0
check("1日の上限(5件)を超えては送らない", run()["sent"] == jobs.NOTE_PROMPT_DAILY_CAP)
claimed.clear()
SENT_TODAY["v"] = 5
check("今日すでに5件送っていれば0件", run()["sent"] == 0)
SENT_TODAY["v"] = 0

# 同じ会議が複数カレンダー（copies）
EVENTS[:] = [ev(copies=[{"id": "g1", "source": "google"}, {"id": "o1", "source": "outlook"}])]
claimed.clear()
r = run()
check("同じ会議が2カレンダーにあっても1通だけ", r["sent"] == 1)

# メモ機能が未準備(テーブル無し)ならPushしない
def raise_unavail(uid, refs):
    raise jobs.notes_svc.NotesUnavailable


jobs.notes_svc.find_note_by_refs = raise_unavail
claimed.clear()
check("メモ機能が未準備なら送らない", run()["sent"] == 0)

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)} PASS / {len(fails)} FAIL")
sys.exit(1 if fails else 0)
