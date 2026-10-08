"""リマインダーと朝のブリーフィングの配信ジョブ。

外部のCronから定期的に叩かれる想定（§UC-1 / UC-7）。
アプリが開いていなくても届くよう、サーバー側からWeb Pushを送る。
"""
import asyncio
import logging
from datetime import datetime, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

from . import notes as notes_svc
from . import push
from .calendar_service import dedupe_events, get_connected_adapters
from .database import get_supabase
from .settings_store import list_users_with_push

logger = logging.getLogger(__name__)

JST = ZoneInfo("Asia/Tokyo")

# リマインダー判定の実行間隔（分）。Cronをこの間隔で回す前提で取りこぼしを防ぐ
REMINDER_TICK_MINUTES = 5
# ブリーフィングの時刻一致に許容する幅（分）。Cronの起動ゆらぎを吸収する
BRIEFING_WINDOW_MINUTES = 15

# 会議後メモの促し: 終了から何分後に送るか／何分前までに終わった会議を対象にするか
NOTE_PROMPT_DELAY_MINUTES = 5
NOTE_PROMPT_LOOKBACK_MINUTES = 35  # 一時的な停止で取りこぼしても、同じ予定は1回だけ送る（claim_onceで重複排除）
NOTE_PROMPT_MIN_DURATION_MINUTES = 30
NOTE_PROMPT_DAILY_CAP = 5
# 夜間・早朝には送らない（日本時間の 8:00〜21:59 のみ）
NOTE_PROMPT_HOURS = range(8, 22)


async def _upcoming_events(user_id: str, until_minutes: int) -> list[dict]:
    now = datetime.now(JST)
    adapters = await get_connected_adapters(user_id)
    if not adapters:
        return []
    results = await asyncio.gather(
        *[a.list_events(now, now + timedelta(minutes=until_minutes)) for a in adapters.values()],
        return_exceptions=True,
    )
    events: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning("予定取得に失敗 user=%s: %s", user_id, r)
            continue
        events.extend(r)
    return dedupe_events(events)


PREVIOUS_NOTE_PUSH_CHARS = 40  # 通知はロック画面に出るため、メモの内容は短く切る


async def _previous_note_text(user_id: str, ev: dict) -> str | None:
    """予定の「前回のメモ」を、通知に添える短い文にする。無い・取得できない場合は None（通知は止めない）。"""
    if ev.get("all_day") or not ev.get("start"):
        return None
    try:
        note = await asyncio.to_thread(
            notes_svc.previous_note,
            user_id,
            refs=notes_svc.refs_for_event(ev),
            title=ev.get("title") or "",
            series_key=ev.get("series_id"),
            before=ev["start"],
        )
    except Exception:  # noqa: BLE001  メモ未準備・不正な日時などでも、本来の通知は送る
        return None
    if not note:
        return None
    text = notes_svc.snippet_of(note["body"])
    return text[:PREVIOUS_NOTE_PUSH_CHARS] + ("…" if len(text) > PREVIOUS_NOTE_PUSH_CHARS else "")


def _fmt_time(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).astimezone(JST).strftime("%H:%M")
    except ValueError:
        return ""


async def run_reminders() -> dict:
    """開始が「設定した分数＋実行間隔」以内に迫った予定を1件ずつ通知する。"""
    now = datetime.now(JST)
    total_sent = 0
    checked = 0

    for user in list_users_with_push():
        if not user["notification_enabled"]:
            continue
        checked += 1
        lead = int(user["reminder_minutes"])
        # 次回実行までに開始してしまう予定も取りこぼさないよう幅を持たせる
        horizon = lead + REMINDER_TICK_MINUTES

        for ev in await _upcoming_events(user["user_id"], horizon):
            if not ev.get("start"):
                continue
            try:
                start = datetime.fromisoformat(ev["start"]).astimezone(JST)
            except ValueError:
                continue
            minutes_until = (start - now).total_seconds() / 60
            if not (0 <= minutes_until <= horizon):
                continue
            # 予定IDで重複排除。時刻変更時は別IDにならないが、
            # 二重に鳴らすより鳴らさない方を選ぶ
            if not push.claim_once(user["user_id"], "reminder", ev["id"]):
                continue

            mins = max(0, round(minutes_until))
            body = (
                f"まもなく {_fmt_time(ev['start'])} より「{ev['title']}」でございます"
                if mins <= 1
                else f"{mins}分後 {_fmt_time(ev['start'])} より「{ev['title']}」でございます"
            )
            if ev.get("location"):
                body += f"（{ev['location']}）"
            prev = await _previous_note_text(user["user_id"], ev)
            if prev:
                body += f"／前回のメモ: {prev}"
            total_sent += push.send_to_user(
                user["user_id"], title="まもなくお時間です", body=body, url="/", tag=ev["id"]
            )

    return {"checked_users": checked, "sent": total_sent}


async def run_briefing() -> dict:
    """各ユーザーの指定時刻に、その日の予定と期限の近いタスクをまとめて通知する。"""
    now = datetime.now(JST)
    today = now.date().isoformat()
    sb = get_supabase()
    total_sent = 0
    checked = 0

    for user in list_users_with_push():
        if not user["briefing_enabled"]:
            continue
        try:
            hh, mm = str(user["briefing_time"]).split(":")
            target = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
        except (ValueError, AttributeError):
            continue

        elapsed = (now - target).total_seconds() / 60
        # 指定時刻を過ぎた直後だけ送る。前倒しでは送らない
        if not (0 <= elapsed <= BRIEFING_WINDOW_MINUTES):
            continue
        checked += 1

        if not push.claim_once(user["user_id"], "briefing", today):
            continue

        # 当日の残りの予定
        end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=0)
        minutes_left = max(1, int((end_of_day - now).total_seconds() / 60))
        events = await _upcoming_events(user["user_id"], minutes_left)

        tasks = (
            sb.table("tasks")
            .select("title")
            .eq("user_id", user["user_id"])
            .eq("done", False)
            .lte("due_date", (now + timedelta(days=3)).date().isoformat())
            .execute()
            .data
        )

        if events:
            head = "、".join(f"{_fmt_time(e['start'])} {e['title']}" for e in events[:3])
            body = f"本日のご予定は{len(events)}件でございます。{head}"
            if len(events) > 3:
                body += " ほか"
        else:
            body = "本日のご予定はございません"
        # 前回のメモがある会議を、最大2件まで添える
        recalled = []
        for e in events[:5]:
            prev = await _previous_note_text(user["user_id"], e)
            if prev:
                recalled.append(f"{e['title']}「{prev}」")
            if len(recalled) >= 2:
                break
        if recalled:
            body += "／前回のメモ: " + "、".join(recalled)
        if tasks:
            body += f"／期限の近いタスクが{len(tasks)}件ございます"

        total_sent += push.send_to_user(
            user["user_id"], title="おはようございます", body=body, url="/", tag=f"briefing-{today}"
        )

    return {"checked_users": checked, "sent": total_sent}


def is_note_prompt_target(ev: dict, now: datetime) -> bool:
    """会議後メモの促しの対象か。終日・短い予定・［仮］・まだ終わっていない（または古すぎる）予定は対象外。"""
    if ev.get("all_day") or not ev.get("start") or not ev.get("end"):
        return False
    title = ev.get("title") or ""
    if "［仮］" in title or "[仮]" in title:
        return False
    try:
        start = datetime.fromisoformat(ev["start"])
        end = datetime.fromisoformat(ev["end"])
    except ValueError:
        return False
    # オフセットなしの値は日本時間として扱う
    start = start if start.tzinfo else start.replace(tzinfo=JST)
    end = end if end.tzinfo else end.replace(tzinfo=JST)
    if (end - start).total_seconds() / 60 < NOTE_PROMPT_MIN_DURATION_MINUTES:
        return False
    ended_min_ago = (now - end).total_seconds() / 60
    return NOTE_PROMPT_DELAY_MINUTES <= ended_min_ago <= NOTE_PROMPT_LOOKBACK_MINUTES


def _count_sent_today(user_id: str, now: datetime) -> int:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        rows = (
            get_supabase()
            .table("sent_notifications")
            .select("id")
            .eq("user_id", user_id)
            .eq("kind", "meeting_note")
            .gte("sent_at", midnight.isoformat())
            .execute()
            .data
        )
    except Exception:  # noqa: BLE001  数えられなければ0扱い（上限がゆるくなるだけで、送信は止めない）
        return 0
    return len(rows)


async def _recent_events(user_id: str, back_hours: int = 12) -> list[dict]:
    now = datetime.now(JST)
    adapters = await get_connected_adapters(user_id)
    if not adapters:
        return []
    results = await asyncio.gather(
        *[a.list_events(now - timedelta(hours=back_hours), now) for a in adapters.values()],
        return_exceptions=True,
    )
    events: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning("予定取得に失敗 user=%s: %s", user_id, r)
            continue
        events.extend(r)
    return dedupe_events(events)


async def run_meeting_note_prompts(now: datetime | None = None) -> dict:
    """終わったばかりの会議について、メモを残すかどうかを尋ねるPushを送る（設定がオンの人だけ）。
    メモが既にある会議・夜間・1日の上限を超える分は送らない。"""
    now = now or datetime.now(JST)
    if now.hour not in NOTE_PROMPT_HOURS:
        return {"checked_users": 0, "sent": 0}
    total_sent = 0
    checked = 0

    for user in list_users_with_push():
        if not user.get("meeting_note_prompt_enabled") or not user["notification_enabled"]:
            continue
        checked += 1
        uid = user["user_id"]
        # 1日の上限は、今日すでに送った通知の数で見る（再起動しても数え直しにならない）
        sent_today = _count_sent_today(uid, now)
        for ev in sorted(await _recent_events(uid), key=lambda e: e["start"]):
            if not is_note_prompt_target(ev, now):
                continue
            if sent_today >= NOTE_PROMPT_DAILY_CAP:
                break
            refs = notes_svc.refs_for_event(ev)
            try:
                if await asyncio.to_thread(notes_svc.find_note_by_refs, uid, refs):
                    continue
            except notes_svc.NotesUnavailable:
                break  # メモ機能が未準備のユーザーには送らない
            if not push.claim_once(uid, "meeting_note", refs[0]):
                continue
            total_sent += push.send_to_user(
                uid,
                title="お疲れさまでした",
                body=f"「{ev['title']}」のメモを残しますか？",
                url=f"/chat?memo={quote(refs[0], safe='')}",
                tag=f"meeting-note-{refs[0]}",
            )
            sent_today += 1

    return {"checked_users": checked, "sent": total_sent}
