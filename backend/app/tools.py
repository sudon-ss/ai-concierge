import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .calendar_service import (
    dedupe_events,
    get_adapter,
    get_connected_adapters,
    get_write_adapters,
    normalize_instant,
)
from .database import get_supabase

IMPORTANT_KEYWORDS = ["持っていく", "準備", "印刷", "届ける", "提出", "用意", "締め切り", "締切"]

JST = ZoneInfo("Asia/Tokyo")


def _parse_dt(value: str) -> datetime:
    """Claudeがツールに渡すISO8601日時文字列をパースする。タイムゾーンが省略されている
    場合はJST（Asia/Tokyo）を補う。これを怠ると、下流でdatetime.isoformat()した際に
    オフセットの無い文字列がGoogle/Outlookのカレンダーにそのまま渡ってしまい、
    「timeMin/timeMaxにタイムゾーンが無い」として400 Bad Requestで拒否されたり、
    最悪の場合は意図しない時刻で登録されたりする。ISO8601はタイムゾーン省略を許容する
    仕様のため、通常のfromisoformatだけでは防げない。
    """
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=JST)


def judge_memo_importance(text: str) -> dict:
    """キーワードベースの簡易重要度判定（v3.0付録の「プロトタイプではキーワードベースも可」に準拠）。"""
    is_important = any(kw in text for kw in IMPORTANT_KEYWORDS)
    return {"priority": "high" if is_important else "normal", "flagged": False}


def _as_aware(dt: datetime, tz) -> datetime:
    """終日予定はタイムゾーン無しの日付のみ（例: 2026-09-17）で返ってくることがあるため、
    検索側と同じタイムゾーンを補って比較可能にする。時刻付きの予定はそのまま返す。"""
    return dt if dt.tzinfo else dt.replace(tzinfo=tz)


BROAD_RANGE_DAYS = 10  # これより広い範囲の問い合わせは「ざっくり系」とみなす
BROAD_MAX_SLOTS = 5
BROAD_MIN_GAP_DAYS = 5  # ざっくり系では候補日をこの日数以上離し、月内で偏らないようにする
NARROW_MAX_SLOTS = 3


async def get_free_slots(user_id: str, date_from: str, date_to: str) -> dict:
    """§6-3設計思想: Google + Outlook を必ず並列で呼び出し、空いている1時間枠を提案する。
    「来週空いてる？」のような狭い範囲では最大3件、「今月どこか空いてる？」のような
    広い範囲（BROAD_RANGE_DAYS超）では最大5件を、日付が偏らないよう間隔を空けて返す。
    件数の上限に達した時点で探索を打ち切るため、結果には実際に調べ終えた範囲
    (searched_until)を含める。呼び出し側（Claude）が「調べていない期間」を
    「埋まっている」と誤認しないための情報で、ユーザーから「他にはある？」と
    追加で聞かれた場合は、この searched_until を新しい date_from として
    続きから検索すること（date_from をやり直さない）。

    終日予定（在宅、リフォーム工事など）は検索の主対象にはせず、個別の時刻指定予定とだけ
    衝突判定する。個別予定と被らなければ候補にはなるが、終日予定と重なる分は優先度を下げ、
    tentative_slots として「確実な空き」とは別枠で返す。呼び出し側（Claude）は slots を
    「確実に空いています」、tentative_slots は「終日の予定はありますが、こちらもいかがですか」
    という程度の温度感で提案すること。
    """
    adapters = await get_connected_adapters(user_id)
    if not adapters:
        return {"slots": [], "tentative_slots": [], "searched_until": date_from, "note": "カレンダーが未連携です"}

    time_min = _parse_dt(date_from)
    time_max = _parse_dt(date_to)
    is_broad = (time_max - time_min) > timedelta(days=BROAD_RANGE_DAYS)
    max_slots = BROAD_MAX_SLOTS if is_broad else NARROW_MAX_SLOTS
    min_gap = timedelta(days=BROAD_MIN_GAP_DAYS) if is_broad else timedelta(0)

    results = await asyncio.gather(*[a.list_events(time_min, time_max) for a in adapters.values()])

    hard_ranges: list[tuple[datetime, datetime]] = []  # 時刻指定の個別予定
    allday_ranges: list[tuple[datetime, datetime]] = []  # 終日予定
    for events in results:
        for ev in events:
            if not (ev.get("start") and ev.get("end")):
                continue
            b_start = _as_aware(datetime.fromisoformat(ev["start"]), time_min.tzinfo)
            b_end = _as_aware(datetime.fromisoformat(ev["end"]), time_min.tzinfo)
            (allday_ranges if ev.get("all_day") else hard_ranges).append((b_start, b_end))

    def _overlaps(ranges: list[tuple[datetime, datetime]], start: datetime, end: datetime) -> bool:
        return any(b_start < end and b_end > start for b_start, b_end in ranges)

    # 依頼内容に応じてClaudeが指定した時間帯（例: 会食なら夕方〜夜）を、
    # 複数日にまたがる探索でも毎日同じ時間帯として尊重する（9-19時に固定しない）。
    day_start_h, day_start_m = time_min.hour, time_min.minute
    day_end_h, day_end_m = time_max.hour, time_max.minute
    if (day_end_h, day_end_m) <= (day_start_h, day_start_m):
        day_start_h, day_start_m, day_end_h, day_end_m = 9, 0, 19, 0  # 範囲が不自然な場合の既定値

    slots: list[dict] = []
    tentative_slots: list[dict] = []
    cursor = time_min
    last_picked: datetime | None = None  # 直近で候補にした日時（偏り防止の間隔チェック用）

    while cursor < time_max and len(slots) < max_slots:
        day_end = cursor.replace(hour=day_end_h, minute=day_end_m, second=0, microsecond=0)
        if cursor >= day_end:
            cursor = (cursor + timedelta(days=1)).replace(
                hour=day_start_h, minute=day_start_m, second=0, microsecond=0
            )
            continue

        if last_picked is not None and (cursor.date() - last_picked.date()) < min_gap:
            # 広い範囲の探索で候補が近い日に偏らないよう、直近の候補からmin_gap分先まで飛ばす
            cursor = (last_picked + min_gap).replace(
                hour=day_start_h, minute=day_start_m, second=0, microsecond=0
            )
            continue

        slot_end = cursor + timedelta(hours=1)
        if _overlaps(hard_ranges, cursor, slot_end):
            cursor += timedelta(minutes=30)
            continue

        entry = {
            "start": cursor.isoformat(),
            "end": slot_end.isoformat(),
            "label": cursor.strftime("%m/%d(%a) %H:%M"),
        }
        if _overlaps(allday_ranges, cursor, slot_end):
            if len(tentative_slots) < max_slots:
                entry["note"] = "終日の予定が入っていますが、個別のご予定とは重なっていません"
                tentative_slots.append(entry)
                last_picked = cursor
        else:
            slots.append(entry)
            last_picked = cursor
        cursor = slot_end

    searched_until = min(cursor, time_max)
    note = (
        f"{date_from}から{searched_until.isoformat()}までを検索し、それ以降（{searched_until.isoformat()}〜{date_to}）は"
        f"{max_slots}件見つかったため未確認です。この未確認区間を「埋まっている」と述べないこと。"
        "ユーザーから「他には？」等、追加の候補を聞かれた場合は、date_fromに"
        f"{searched_until.isoformat()}を指定して続きから検索すること（最初のdate_fromからやり直さない）"
        if searched_until < time_max
        else f"{date_from}から{date_to}まで全範囲を確認済みです"
    )
    return {
        "slots": slots,
        "tentative_slots": tentative_slots,
        "searched_until": searched_until.isoformat(),
        "note": note,
    }


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
            title=title, start=_parse_dt(start), end=_parse_dt(end), location=location
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
            start=_parse_dt(slot["start"]),
            end=_parse_dt(slot["end"]),
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
    events = await _load_events(user_id, _parse_dt(date_from), _parse_dt(date_to))
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
    start = _parse_dt(new_start)
    end = _parse_dt(new_end)
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

    start_dt = _parse_dt(start) if start else None
    end_dt = _parse_dt(end) if end else None

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


async def confirm_tentative_slot(
    user_id: str, *, event_id: str, final_title: str | None = None
) -> dict:
    """hold_tentative_slotsで押さえた候補群のうち1つを本確定し、選ばれなかった
    他の候補（同じ交渉で使われた「[仮] ...」予定）を自動で解放（削除）する。

    仮押さえの確定・解除は本来Schedule画面のボタン操作（フロント側でtentativeRefsを
    追跡）で行う設計だが、それはUIカードを直接操作した場合にしか機能しない。
    「先方は水曜の枠でOKと言っています」のようにテキストで確定連絡を受けた場合、
    Claude側はどの候補を仮押さえしていたか（フロントのローカル状態）を知る術が無いため、
    実際のカレンダー上に残っている「[仮] ...」というタイトルを手がかりに探し直す。
    """
    target = await _find_target_event(user_id, event_id)
    old_title = target["title"]
    base_title = old_title.removeprefix("[仮] ") if old_title.startswith("[仮] ") else old_title
    new_title = final_title or base_title
    search_title = old_title if old_title.startswith("[仮] ") else f"[仮] {base_title}"

    # 1) 本確定: 新規作成ではなく、既存の仮予定のタイトルから「[仮] 」を外して昇格させる
    #    （新規にcreate_eventすると仮予定と重複登録になってしまうため）
    confirmed = await update_event_fields(
        user_id, calendar=target["source"], event_id=event_id, title=new_title
    )

    # 2) 同じ元タイトルを持つ、選ばれなかった他の「[仮] ...」候補を検索して削除する
    now = datetime.now().astimezone()
    others = await _load_events(user_id, now - timedelta(days=1), now + timedelta(days=RESCHEDULE_SEARCH_DAYS))
    released = 0
    for ev in others:
        if ev["id"] == event_id or any(c["id"] == event_id for c in ev.get("copies", [])):
            continue
        if ev["title"] != search_title:
            continue
        try:
            await delete_event(user_id, calendar=ev["source"], event_id=ev["id"])
            released += 1
        except Exception:  # noqa: BLE001
            pass  # 1件消せなくても他の後片付けは続行する

    return {**confirmed, "released_tentative_count": released}


TOOLS = [
    {
        "name": "get_free_slots",
        "description": (
            "指定期間内でお客様のGoogle/Outlookカレンダーの空き時間を提案する。"
            f"{BROAD_RANGE_DAYS}日を超える広い期間（「今月中」「来月あたり」等）を指定した場合は"
            f"最大{BROAD_MAX_SLOTS}枠を日付が偏らないよう間隔を空けて返し、それ以下の狭い期間では"
            f"最大{NARROW_MAX_SLOTS}枠を返す。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string", "description": "検索開始日時 ISO8601（例: 2026-10-01T18:00:00+09:00、必ずタイムゾーンオフセットを含めること）"},
                "date_to": {"type": "string", "description": "検索終了日時 ISO8601（必ずタイムゾーンオフセットを含めること）"},
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
                "start": {"type": "string", "description": "ISO8601（必ずタイムゾーンオフセットを含めること。例: 2026-10-01T18:00:00+09:00）"},
                "end": {"type": "string", "description": "ISO8601（必ずタイムゾーンオフセットを含めること）"},
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
                "date_from": {"type": "string", "description": "検索開始日時 ISO8601（例: 2026-10-01T18:00:00+09:00、必ずタイムゾーンオフセットを含めること）"},
                "date_to": {"type": "string", "description": "検索終了日時 ISO8601（必ずタイムゾーンオフセットを含めること）"},
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
                "new_start": {"type": "string", "description": "ISO8601（必ずタイムゾーンオフセットを含めること）"},
                "new_end": {"type": "string", "description": "ISO8601（必ずタイムゾーンオフセットを含めること）"},
            },
            "required": ["calendar", "event_id", "new_start", "new_end"],
        },
    },
    {
        "name": "update_event_details",
        "description": (
            "既存の予定のタイトル・場所・メモだけを変更する（時刻は変えない）。"
            "「場所だけ渋谷に変えて」「件名を◯◯に直して」のように、日時はそのままで"
            "内容だけ変更したい場合に使うこと。日時も変える場合はreschedule_eventを使うこと。"
            "event_id は find_events で取得したものを使うこと。"
            "同じ予定が複数のカレンダーに登録されている場合は自動的に全て同時に変更される。"
            "ユーザーが明示的に承認した後にのみ呼び出すこと。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "calendar": {"type": "string", "enum": ["google", "outlook"]},
                "event_id": {"type": "string", "description": "find_eventsで取得したevent_id"},
                "title": {"type": "string", "description": "変更後のタイトル（任意）"},
                "location": {"type": "string", "description": "変更後の場所（任意）"},
                "memo": {"type": "string", "description": "変更後のメモ（任意）"},
            },
            "required": ["calendar", "event_id"],
        },
    },
    {
        "name": "confirm_tentative_slot",
        "description": (
            "以前提示して仮押さえ（「[仮] ...」）した候補のうち1つを本確定し、"
            "同じ交渉で使われた他の候補（選ばれなかった「[仮] ...」予定）を"
            "自動で解放（削除）する。「先方は水曜の枠でOKと言っています」"
            "「2番目の候補で決まりました」のように、以前提示した候補についてテキストで"
            "確定の返事を伝えられた場合に使うこと（候補提示時にお客様がその場で画面の"
            "ボタンから確定した場合は自動処理されるため、この道具を呼ぶ必要はない）。"
            "まずfind_eventsで対象期間の「[仮] ...」という予定を検索し、"
            "確定する1件のevent_idを特定してから呼ぶこと。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {
                    "type": "string",
                    "description": "find_eventsで取得した、確定する「[仮] ...」予定のevent_id",
                },
                "final_title": {
                    "type": "string",
                    "description": "本確定後のタイトル（省略時は「[仮] 」を外しただけの元タイトルを使う）",
                },
            },
            "required": ["event_id"],
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
            "また、「次回は1か月後に」のような、まだ日時が確定していないざっくりした"
            "将来の約束を思い出させるためのリマインダーとしても使うこと（詳細な運用は"
            "システムプロンプト参照）。ユーザーが明示的に承認した後にのみ呼び出すこと。"
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
    if name == "update_event_details":
        return await update_event_fields(user_id, **tool_input)
    if name == "confirm_tentative_slot":
        return await confirm_tentative_slot(user_id, **tool_input)
    if name == "stage_event_deletion":
        return await stage_event_deletion(user_id, event_id=tool_input["event_id"])
    if name == "create_task":
        return await create_task(user_id, **tool_input)
    if name == "judge_memo_importance":
        return judge_memo_importance(tool_input["text"])
    raise ValueError(f"unknown tool: {name}")
