import asyncio
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from .adapters.base import CalendarAdapter
from .adapters.google_calendar import GoogleCalendarAdapter, list_google_calendars, refresh_google_token
from .adapters.outlook_calendar import OutlookCalendarAdapter, list_outlook_calendars, refresh_microsoft_token
from .auth import get_oauth_tokens, save_oauth_tokens

REFRESH_BUFFER_SECONDS = 120

JST = ZoneInfo("Asia/Tokyo")


def normalize_instant(value: str | None) -> datetime:
    """日時文字列を比較可能なawareなdatetimeに正規化する。
    Googleはオフセット付き（+09:00）、Outlookはオフセットなしの文字列を返すなど
    プロバイダによって表記形式が異なり、文字列のまま比較すると同一の予定でも
    一致判定・並び替えに失敗することがあるため、実際の日時としてパースしてから使う。
    """
    if not value:
        return datetime.min.replace(tzinfo=JST)
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=JST)
    return dt if dt.tzinfo else dt.replace(tzinfo=JST)


async def _get_valid_token_row(user_id: str, provider: str) -> dict | None:
    """有効なアクセストークンを含むoauth_tokens行を返す。未連携ならNone。期限切れなら自動リフレッシュする。"""
    row = get_oauth_tokens(user_id=user_id, provider=provider)
    if not row:
        return None

    if row["expires_at"] <= int(time.time()) + REFRESH_BUFFER_SECONDS:
        if not row.get("refresh_token"):
            return None
        if provider == "google":
            access_token, expires_in = await refresh_google_token(row["refresh_token"])
        else:
            access_token, expires_in = await refresh_microsoft_token(row["refresh_token"])
        save_oauth_tokens(
            user_id=user_id,
            provider=provider,
            access_token=access_token,
            refresh_token=row["refresh_token"],
            expires_in=expires_in,
        )
        row["access_token"] = access_token

    return row


async def get_adapter(user_id: str, provider: str) -> CalendarAdapter | None:
    """読み取り用（get_free_slots等）、または単一の書き込み先（reschedule_event等）向け。
    書き込み先が複数選択されている場合は先頭のものを使う。複数カレンダーへの同時登録には
    get_write_adapters() を使うこと。
    """
    row = await _get_valid_token_row(user_id, provider)
    if not row:
        return None

    read_ids = row.get("selected_calendar_ids") or None
    write_ids = row.get("write_calendar_ids") or []
    write_id = write_ids[0] if write_ids else None
    if provider == "google":
        return GoogleCalendarAdapter(row["access_token"], read_ids, write_id)
    return OutlookCalendarAdapter(row["access_token"], read_ids, write_id)


async def get_write_adapters(user_id: str, provider: str) -> list[CalendarAdapter]:
    """新規予定の登録先として選ばれている全カレンダー分のアダプターを返す（§10-4後続: 複数登録先対応）。
    未選択の場合はprimary/既定カレンダー1件分を返す。
    """
    row = await _get_valid_token_row(user_id, provider)
    if not row:
        return []

    write_ids: list[str | None] = list(row.get("write_calendar_ids") or [])
    if not write_ids:
        write_ids = [None]

    adapters = []
    for wid in write_ids:
        if provider == "google":
            adapters.append(GoogleCalendarAdapter(row["access_token"], None, wid))
        else:
            adapters.append(OutlookCalendarAdapter(row["access_token"], None, wid))
    return adapters


def _copy_ref(ev: dict) -> dict:
    return {"id": ev["id"], "calendar_id": ev.get("calendar_id"), "source": ev.get("source")}


def dedupe_events(events: list[dict]) -> list[dict]:
    """同一の予定が複数カレンダーに登録されている場合、表示上1件にまとめる。
    登録先を複数選んでいると同じ予定がその数だけ返るため、予定一覧・ブリーフィング・
    リマインダーで同じ予定が何度も現れてしまう。件名・開始・終了が一致するものを
    同一の予定とみなす。Google と Outlook の両方にある場合は source を "both" にする。

    まとめた元の予定は copies に残す。予定を変更する際、まとめて表示している
    3件を1回の指示で同時に動かすために必要になる。

    突き合わせにはstart/endの生文字列ではなく正規化した日時を使う。Googleは
    オフセット付き（+09:00）、Outlookはオフセットなしの文字列を返すなど表記が
    異なり、文字列のままだと同一の予定でも一致しないことがあるため。
    """
    merged: dict[tuple, dict] = {}
    for ev in events:
        key = (ev.get("title"), normalize_instant(ev.get("start")), normalize_instant(ev.get("end")))
        existing = merged.get(key)
        if existing is None:
            merged[key] = {**ev, "copies": [_copy_ref(ev)]}
            continue
        existing["copies"].append(_copy_ref(ev))
        if existing.get("source") != ev.get("source"):
            existing["source"] = "both"
        # 片方にしか場所が入っていないケースを拾う
        if not existing.get("location") and ev.get("location"):
            existing["location"] = ev["location"]
    return list(merged.values())


async def get_connected_adapters(user_id: str) -> dict[str, CalendarAdapter]:
    """ユーザーが連携済みの全カレンダーアダプターを返す（トークンのリフレッシュも並列で行う）。"""
    providers = ("google", "outlook")
    results = await asyncio.gather(*[get_adapter(user_id, p) for p in providers])
    return {p: a for p, a in zip(providers, results) if a is not None}


async def list_calendars(user_id: str, provider: str) -> list[dict] | None:
    """連携済みプロバイダのカレンダー一覧を返す。未連携ならNone。"""
    row = await _get_valid_token_row(user_id, provider)
    if not row:
        return None
    if provider == "google":
        return await list_google_calendars(row["access_token"])
    return await list_outlook_calendars(row["access_token"])
