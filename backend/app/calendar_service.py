import asyncio
import time

from .adapters.base import CalendarAdapter
from .adapters.google_calendar import GoogleCalendarAdapter, list_google_calendars, refresh_google_token
from .adapters.outlook_calendar import OutlookCalendarAdapter, list_outlook_calendars, refresh_microsoft_token
from .auth import get_oauth_tokens, save_oauth_tokens

REFRESH_BUFFER_SECONDS = 120


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
    row = await _get_valid_token_row(user_id, provider)
    if not row:
        return None

    read_ids = row.get("selected_calendar_ids") or None
    write_id = row.get("write_calendar_id")
    if provider == "google":
        return GoogleCalendarAdapter(row["access_token"], read_ids, write_id)
    return OutlookCalendarAdapter(row["access_token"], read_ids, write_id)


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
