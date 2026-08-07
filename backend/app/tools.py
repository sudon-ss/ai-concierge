import asyncio
from datetime import datetime, timedelta

from .calendar_service import get_adapter, get_connected_adapters, get_write_adapters
from .database import get_supabase

IMPORTANT_KEYWORDS = ["持っていく", "準備", "印刷", "届ける", "提出", "用意", "締め切り", "締切"]


def judge_memo_importance(text: str) -> dict:
    """キーワードベースの簡易重要度判定（v3.0付録の「プロトタイプではキーワードベースも可」に準拠）。"""
    is_important = any(kw in text for kw in IMPORTANT_KEYWORDS)
    return {"priority": "high" if is_important else "normal", "flagged": False}


async def get_free_slots(user_id: str, date_from: str, date_to: str) -> dict:
    """§6-3設計思想: Google + Outlook を必ず並列で呼び出し、空いている1時間枠を最大3つ返す。
    3件見つかった時点で探索を打ち切るため、結果には実際に調べ終えた範囲(searched_until)を
    含める。呼び出し側（Claude）が「調べていない期間」を「埋まっている」と誤認しないための情報。
    """
    adapters = await get_connected_adapters(user_id)
    if not adapters:
        return {"slots": [], "searched_until": date_from, "note": "カレンダーが未連携です"}

    time_min = datetime.fromisoformat(date_from)
    time_max = datetime.fromisoformat(date_to)

    results = await asyncio.gather(*[a.list_events(time_min, time_max) for a in adapters.values()])
    busy_ranges = [
        (datetime.fromisoformat(ev["start"]), datetime.fromisoformat(ev["end"]))
        for events in results
        for ev in events
        if ev.get("start") and ev.get("end")
    ]

    # 依頼内容に応じてClaudeが指定した時間帯（例: 会食なら夕方〜夜）を、
    # 複数日にまたがる探索でも毎日同じ時間帯として尊重する（9-19時に固定しない）。
    day_start_h, day_start_m = time_min.hour, time_min.minute
    day_end_h, day_end_m = time_max.hour, time_max.minute
    if (day_end_h, day_end_m) <= (day_start_h, day_start_m):
        day_start_h, day_start_m, day_end_h, day_end_m = 9, 0, 19, 0  # 範囲が不自然な場合の既定値

    slots: list[dict] = []
    cursor = time_min

    while cursor < time_max and len(slots) < 3:
        day_end = cursor.replace(hour=day_end_h, minute=day_end_m, second=0, microsecond=0)
        if cursor >= day_end:
            cursor = (cursor + timedelta(days=1)).replace(
                hour=day_start_h, minute=day_start_m, second=0, microsecond=0
            )
            continue
        slot_end = cursor + timedelta(hours=1)
        overlaps = any(b_start < slot_end and b_end > cursor for b_start, b_end in busy_ranges)
        if not overlaps:
            slots.append(
                {
                    "start": cursor.isoformat(),
                    "end": slot_end.isoformat(),
                    "label": cursor.strftime("%m/%d(%a) %H:%M"),
                }
            )
            cursor = slot_end
        else:
            cursor += timedelta(minutes=30)

    searched_until = min(cursor, time_max)
    note = (
        f"{date_from}から{searched_until.isoformat()}までを検索し、それ以降（{searched_until.isoformat()}〜{date_to}）は"
        "3件見つかったため未確認です。この未確認区間を「埋まっている」と述べないこと"
        if searched_until < time_max
        else f"{date_from}から{date_to}まで全範囲を確認済みです"
    )
    return {"slots": slots, "searched_until": searched_until.isoformat(), "note": note}


async def create_event(
    user_id: str,
    *,
    calendar: str,
    title: str,
    start: str,
    end: str,
    location: str | None = None,
    memo: str | None = None,
) -> list[dict]:
    """登録先として選択されている全カレンダー（最大3件）に同時登録する。"""
    adapters = await get_write_adapters(user_id, calendar)
    if not adapters:
        raise ValueError(f"{calendar} が連携されていません")

    judged = judge_memo_importance(memo) if memo else {"priority": "normal", "flagged": False}
    sb = get_supabase()
    results = []
    for adapter in adapters:
        ev = await adapter.create_event(
            title=title, start=datetime.fromisoformat(start), end=datetime.fromisoformat(end), location=location
        )
        sb.table("events").insert(
            {
                "user_id": user_id,
                "calendar": calendar,
                "ext_id": ev["id"],
                "title": ev["title"],
                "start_at": ev["start"],
                "end_at": ev["end"],
                "location": ev.get("location"),
                "memo": memo,
                "memo_priority": judged["priority"],
                "memo_flagged": judged["flagged"],
            }
        ).execute()
        results.append(ev)
    return results


async def create_task(
    user_id: str, *, title: str, due_date: str | None = None, priority: str = "medium"
) -> dict:
    res = (
        get_supabase()
        .table("tasks")
        .insert({"user_id": user_id, "title": title, "due_date": due_date, "priority": priority})
        .execute()
    )
    return res.data[0]


async def reschedule_event(user_id: str, *, calendar: str, event_id: str, new_start: str, new_end: str) -> dict:
    adapter = await get_adapter(user_id, calendar)
    if not adapter:
        raise ValueError(f"{calendar} が連携されていません")

    ev = await adapter.update_event(
        event_id, start=datetime.fromisoformat(new_start), end=datetime.fromisoformat(new_end)
    )
    get_supabase().table("events").update({"start_at": ev["start"], "end_at": ev["end"]}).eq(
        "user_id", user_id
    ).eq("ext_id", event_id).execute()
    return ev


TOOLS = [
    {
        "name": "get_free_slots",
        "description": "指定期間内でお客様のGoogle/Outlookカレンダーの空き時間を最大3枠提案する。",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string", "description": "検索開始日時 ISO8601"},
                "date_to": {"type": "string", "description": "検索終了日時 ISO8601"},
            },
            "required": ["date_from", "date_to"],
        },
    },
    {
        "name": "create_event",
        "description": "カレンダーに予定を登録する。ユーザーが明示的に承認した後にのみ呼び出すこと。",
        "input_schema": {
            "type": "object",
            "properties": {
                "calendar": {"type": "string", "enum": ["google", "outlook"]},
                "title": {"type": "string"},
                "start": {"type": "string", "description": "ISO8601"},
                "end": {"type": "string", "description": "ISO8601"},
                "location": {"type": "string"},
                "memo": {"type": "string", "description": "準備物などのメモ（任意）"},
            },
            "required": ["calendar", "title", "start", "end"],
        },
    },
    {
        "name": "reschedule_event",
        "description": "既存の予定の時刻を変更する。ユーザーが明示的に承認した後にのみ呼び出すこと。",
        "input_schema": {
            "type": "object",
            "properties": {
                "calendar": {"type": "string", "enum": ["google", "outlook"]},
                "event_id": {"type": "string"},
                "new_start": {"type": "string", "description": "ISO8601"},
                "new_end": {"type": "string", "description": "ISO8601"},
            },
            "required": ["calendar", "event_id", "new_start", "new_end"],
        },
    },
    {
        "name": "create_task",
        "description": (
            "期限はあるが特定の開始・終了時刻を持たない「やること」をタスクとして登録する"
            "（例:「資料を金曜までに作る」）。特定の時刻を伴う予定はcreate_eventを使うこと。"
            "ユーザーが明示的に承認した後にのみ呼び出すこと。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "due_date": {"type": "string", "description": "期限日 YYYY-MM-DD（任意）"},
                "priority": {"type": "string", "enum": ["low", "medium", "high"]},
            },
            "required": ["title"],
        },
    },
    {
        "name": "judge_memo_importance",
        "description": "メモ本文から重要度を判定する（持参物・締め切りなどのキーワードを検出）。",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
]


async def run_tool(name: str, user_id: str, tool_input: dict) -> dict:
    if name == "get_free_slots":
        return await get_free_slots(user_id, tool_input["date_from"], tool_input["date_to"])
    if name == "create_event":
        return await create_event(user_id, **tool_input)
    if name == "reschedule_event":
        return await reschedule_event(user_id, **tool_input)
    if name == "create_task":
        return await create_task(user_id, **tool_input)
    if name == "judge_memo_importance":
        return judge_memo_importance(tool_input["text"])
    raise ValueError(f"unknown tool: {name}")
