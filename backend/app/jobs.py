"""リマインダーと朝のブリーフィングの配信ジョブ。

外部のCronから定期的に叩かれる想定（§UC-1 / UC-7）。
アプリが開いていなくても届くよう、サーバー側からWeb Pushを送る。
"""
import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

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
        if tasks:
            body += f"／期限の近いタスクが{len(tasks)}件ございます"

        total_sent += push.send_to_user(
            user["user_id"], title="おはようございます", body=body, url="/", tag=f"briefing-{today}"
        )

    return {"checked_users": checked, "sent": total_sent}
