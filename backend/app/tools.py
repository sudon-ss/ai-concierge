import asyncio
from datetime import datetime, timedelta

from .calendar_service import (
    dedupe_events,
    get_adapter,
    get_connected_adapters,
    get_write_adapters,
    normalize_instant,
)
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


async def hold_tentative_slots(
    user_id: str, *, calendar: str, title: str, slots: list[dict]
) -> list[dict]:
    """候補枠を「[仮]」付きの予定として実際のカレンダーへ登録し、押さえた枠の一覧を返す。
    相手の返答待ちの間に他の予定で埋まってしまうのを防ぐための機能。
    登録先が複数選択されていれば、その全カレンダーに押さえる。
    確定・キャンセル時に release_tentative_slots() で消せるよう、
    削除に必要な calendar_id を含めて返す。
    """
    adapters = await get_write_adapters(user_id, calendar)
    if not adapters:
        raise ValueError(f"{calendar} が連携されていません")

    async def hold_one(adapter, slot: dict) -> dict:
        return await adapter.create_event(
            title=f"[仮] {title}",
            start=datetime.fromisoformat(slot["start"]),
            end=datetime.fromisoformat(slot["end"]),
        )

    # 枠数×カレンダー数を直列で作ると体感が遅いため並列で登録する
    return list(
        await asyncio.gather(*[hold_one(a, s) for s in slots for a in adapters])
    )


async def release_tentative_slots(user_id: str, *, items: list[dict]) -> int:
    """仮押さえした枠を削除する。items は [{calendar, event_id, calendar_id}]。
    確定時（選ばれなかった枠と、確定枠に置き換わる元の仮枠の両方）と
    キャンセル時の両方から呼ばれる。
    一部が既に手動で消されていても全体を失敗させない。
    """
    adapters: dict[str, object] = {}
    for provider in {item["calendar"] for item in items}:
        adapter = await get_adapter(user_id, provider)
        if adapter:
            adapters[provider] = adapter

    async def release_one(item: dict) -> bool:
        adapter = adapters.get(item["calendar"])
        if not adapter:
            return False
        try:
            await adapter.delete_event(item["event_id"], calendar_id=item.get("calendar_id"))
            return True
        except Exception:
            return False

    results = await asyncio.gather(*[release_one(i) for i in items])

    deleted_ids = [i["event_id"] for i, ok in zip(items, results) if ok]
    if deleted_ids:
        get_supabase().table("events").delete().eq("user_id", user_id).in_(
            "ext_id", deleted_ids
        ).execute()
    return sum(results)


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


RESCHEDULE_SEARCH_DAYS = 120


async def _load_events(user_id: str, time_min: datetime, time_max: datetime) -> list[dict]:
    """連携済みの全カレンダーから予定を取得し、重複を1件にまとめて返す。"""
    adapters = await get_connected_adapters(user_id)
    if not adapters:
        return []
    results = await asyncio.gather(*[a.list_events(time_min, time_max) for a in adapters.values()])
    events = dedupe_events([ev for lst in results for ev in lst])
    events.sort(key=lambda e: normalize_instant(e["start"]))
    return events


async def find_events(user_id: str, date_from: str, date_to: str) -> dict:
    """既存の予定を検索する。予定の変更にはevent_idが必要なため、
    reschedule_eventを呼ぶ前にこのツールで対象を特定する。
    """
    events = await _load_events(user_id, datetime.fromisoformat(date_from), datetime.fromisoformat(date_to))
    if not events:
        return {"events": [], "note": f"{date_from}から{date_to}の間に予定はありません"}
    # copiesは内部管理用（同時変更のため）なのでClaudeには渡さず、件数だけ伝える
    return {
        "events": [
            {
                "event_id": e["id"],
                "calendar": e["source"],
                "title": e["title"],
                "start": e["start"],
                "end": e["end"],
                "location": e.get("location"),
                "registered_calendars": len(e.get("copies", [])),
            }
            for e in events
        ]
    }


async def _find_target_event(user_id: str, event_id: str) -> dict:
    """event_id（コピーのidも含む）から、変更・削除対象の予定を1件特定する。"""
    now = datetime.now().astimezone()
    events = await _load_events(
        user_id, now - timedelta(days=1), now + timedelta(days=RESCHEDULE_SEARCH_DAYS)
    )
    target = next(
        (e for e in events if e["id"] == event_id or any(c["id"] == event_id for c in e.get("copies", []))),
        None,
    )
    if target is None:
        raise ValueError("対象の予定が見つかりませんでした。find_eventsで予定を確認してください")
    return target


async def _adapters_for_copies(user_id: str, copies: list[dict]) -> dict[str, object]:
    adapters: dict[str, object] = {}
    for provider in {c["source"] for c in copies}:
        adapter = await get_adapter(user_id, provider)
        if adapter:
            adapters[provider] = adapter
    return adapters


async def reschedule_event(
    user_id: str, *, calendar: str, event_id: str, new_start: str, new_end: str
) -> dict:
    """予定の時刻を変更する。同じ予定を複数カレンダーに登録している場合は、
    その全コピーを同時に動かす（片方だけ動いて食い違うのを防ぐ）。
    """
    target = await _find_target_event(user_id, event_id)
    start = datetime.fromisoformat(new_start)
    end = datetime.fromisoformat(new_end)
    copies = target.get("copies") or [{"id": event_id, "calendar_id": None, "source": calendar}]
    adapters = await _adapters_for_copies(user_id, copies)

    async def move_one(copy: dict) -> dict | None:
        adapter = adapters.get(copy["source"])
        if not adapter:
            return None
        try:
            return await adapter.update_event(
                copy["id"], start=start, end=end, calendar_id=copy.get("calendar_id")
            )
        except Exception:
            return None

    moved = [ev for ev in await asyncio.gather(*[move_one(c) for c in copies]) if ev]
    if not moved:
        raise ValueError("予定の変更に失敗しました")

    get_supabase().table("events").update({"start_at": moved[0]["start"], "end_at": moved[0]["end"]}).eq(
        "user_id", user_id
    ).in_("ext_id", [c["id"] for c in copies]).execute()

    return {**moved[0], "updated_calendars": len(moved), "total_calendars": len(copies)}


async def stage_event_deletion(user_id: str, *, event_id: str) -> dict:
    """予定削除の確認カードを表示するため、対象イベントの情報を返す（この時点では削除しない）。
    実際の削除はユーザーが画面のボタンで確認した後、APIから直接delete_eventが呼ばれる。
    """
    target = await _find_target_event(user_id, event_id)
    return {
        "event_id": target["id"],
        "calendar": target["source"],
        "title": target["title"],
        "start": target["start"],
        "end": target["end"],
        "location": target.get("location"),
    }


async def delete_event(user_id: str, *, calendar: str, event_id: str) -> dict:
    """予定を削除する。同じ予定を複数カレンダーに登録している場合は、その全コピーを削除する。"""
    target = await _find_target_event(user_id, event_id)
    copies = target.get("copies") or [{"id": event_id, "calendar_id": None, "source": calendar}]
    adapters = await _adapters_for_copies(user_id, copies)

    async def delete_one(copy: dict) -> bool:
        adapter = adapters.get(copy["source"])
        if not adapter:
            return False
        try:
            await adapter.delete_event(copy["id"], calendar_id=copy.get("calendar_id"))
            return True
        except Exception:
            return False

    results = await asyncio.gather(*[delete_one(c) for c in copies])
    if not any(results):
        raise ValueError("予定の削除に失敗しました")

    get_supabase().table("events").delete().eq("user_id", user_id).in_(
        "ext_id", [c["id"] for c in copies]
    ).execute()

    return {"event_id": event_id, "title": target["title"], "deleted_calendars": sum(results)}


async def update_event_fields(
    user_id: str,
    *,
    calendar: str,
    event_id: str,
    title: str | None = None,
    start: str | None = None,
    end: str | None = None,
    location: str | None = None,
    memo: str | None = None,
    memo_flagged: bool | None = None,
) -> dict:
    """Schedule画面の編集モーダルからの更新。件名・時刻・場所はカレンダー本体に、
    メモ・フラグはSupabase側のみに反映する（カレンダーAPIにメモ欄が無いため）。
    同じ予定が複数カレンダーに登録されている場合は全コピーへ反映する。
    """
    target = await _find_target_event(user_id, event_id)
    copies = target.get("copies") or [{"id": event_id, "calendar_id": None, "source": calendar}]
    adapters = await _adapters_for_copies(user_id, copies)

    start_dt = datetime.fromisoformat(start) if start else None
    end_dt = datetime.fromisoformat(end) if end else None

    async def update_one(copy: dict) -> dict | None:
        adapter = adapters.get(copy["source"])
        if not adapter:
            return None
        try:
            return await adapter.update_event(
                copy["id"],
                title=title,
                start=start_dt,
                end=end_dt,
                location=location,
                calendar_id=copy.get("calendar_id"),
            )
        except Exception:
            return None

    updated = [ev for ev in await asyncio.gather(*[update_one(c) for c in copies]) if ev]
    if not updated:
        raise ValueError("予定の更新に失敗しました")

    sb_updates: dict = {}
    if title is not None:
        sb_updates["title"] = updated[0]["title"]
    if start_dt is not None:
        sb_updates["start_at"] = updated[0]["start"]
    if end_dt is not None:
        sb_updates["end_at"] = updated[0]["end"]
    if location is not None:
        sb_updates["location"] = updated[0].get("location")
    if memo is not None:
        sb_updates["memo"] = memo
    if memo_flagged is not None:
        sb_updates["memo_flagged"] = memo_flagged
    if sb_updates:
        get_supabase().table("events").update(sb_updates).eq("user_id", user_id).in_(
            "ext_id", [c["id"] for c in copies]
        ).execute()

    return {**updated[0], "updated_calendars": len(updated), "total_calendars": len(copies)}


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
        "name": "find_events",
        "description": (
            "既存の予定を検索して event_id を調べる。"
            "予定の変更・確認を依頼された場合は、まずこのツールで対象の予定を特定すること。"
        ),
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
        "name": "reschedule_event",
        "description": (
            "既存の予定の時刻を変更する。event_id は find_events で取得したものを使うこと。"
            "同じ予定が複数のカレンダーに登録されている場合は自動的に全て同時に変更される。"
            "ユーザーが明示的に承認した後にのみ呼び出すこと。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "calendar": {"type": "string", "enum": ["google", "outlook"]},
                "event_id": {"type": "string", "description": "find_eventsで取得したevent_id"},
                "new_start": {"type": "string", "description": "ISO8601"},
                "new_end": {"type": "string", "description": "ISO8601"},
            },
            "required": ["calendar", "event_id", "new_start", "new_end"],
        },
    },
    {
        "name": "stage_event_deletion",
        "description": (
            "予定の削除意思を確認するため、対象イベントの情報を画面に提示する"
            "（この時点ではまだ削除されない）。event_id は find_events で取得したものを使うこと。"
            "呼び出すと画面に削除確認のボタン（はい/いいえ）が表示され、ユーザーがボタンで"
            "最終回答するため、この後テキストで改めて「よろしいですか」と尋ねる必要はない。"
            "実際の削除はボタン操作から直接行われるため、削除用の道具は別途存在しない。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string", "description": "find_eventsで取得したevent_id"},
            },
            "required": ["event_id"],
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
    if name == "find_events":
        return await find_events(user_id, tool_input["date_from"], tool_input["date_to"])
    if name == "reschedule_event":
        return await reschedule_event(user_id, **tool_input)
    if name == "stage_event_deletion":
        return await stage_event_deletion(user_id, event_id=tool_input["event_id"])
    if name == "create_task":
        return await create_task(user_id, **tool_input)
    if name == "judge_memo_importance":
        return judge_memo_importance(tool_input["text"])
    raise ValueError(f"unknown tool: {name}")
