import asyncio
from datetime import datetime

import httpx

from ..config import settings
from .base import CalendarAdapter

API_BASE = "https://graph.microsoft.com/v1.0"


def _token_url() -> str:
    return f"https://login.microsoftonline.com/{settings.microsoft_tenant}/oauth2/v2.0/token"


async def refresh_microsoft_token(refresh_token: str) -> tuple[str, int]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _token_url(),
            data={
                "client_id": settings.microsoft_client_id,
                "client_secret": settings.microsoft_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
                "scope": "offline_access Calendars.ReadWrite User.Read",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["access_token"], data["expires_in"]


async def list_outlook_calendars(access_token: str) -> list[dict]:
    """ユーザーが持つ全カレンダー一覧（既定以外の追加・共有カレンダーを含む）を返す。"""
    async with httpx.AsyncClient(
        base_url=API_BASE, headers={"Authorization": f"Bearer {access_token}"}
    ) as client:
        resp = await client.get("/me/calendars")
        resp.raise_for_status()
        return [
            {"id": c["id"], "name": c.get("name", c["id"]), "primary": c.get("isDefaultCalendar", False)}
            for c in resp.json().get("value", [])
        ]


def _to_common(ev: dict) -> dict:
    return {
        "id": ev["id"],
        "title": ev.get("subject", "(タイトルなし)"),
        "start": ev.get("start", {}).get("dateTime"),
        "end": ev.get("end", {}).get("dateTime"),
        "location": (ev.get("location") or {}).get("displayName"),
        "source": "outlook",
    }


class OutlookCalendarAdapter(CalendarAdapter):
    def __init__(
        self,
        access_token: str,
        read_calendar_ids: list[str] | None = None,
        write_calendar_id: str | None = None,
    ):
        self._client = httpx.AsyncClient(
            base_url=API_BASE,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Prefer": 'outlook.timezone="Asia/Tokyo"',
            },
        )
        # 未選択時は既定カレンダー（/me/...）にフォールバック（§10-4後続: 複数カレンダー対応、最大3件）
        self._read_paths = [f"/me/calendars/{cid}" for cid in (read_calendar_ids or [])] or ["/me"]
        write_id = write_calendar_id or (read_calendar_ids or [None])[0]
        self._write_path = f"/me/calendars/{write_id}" if write_id else "/me"

    async def list_events(self, time_min: datetime, time_max: datetime) -> list[dict]:
        params = {
            "startDateTime": time_min.isoformat(),
            "endDateTime": time_max.isoformat(),
            "$orderby": "start/dateTime",
        }

        async def fetch_one(path: str) -> list[dict]:
            resp = await self._client.get(f"{path}/calendarView", params=params)
            resp.raise_for_status()
            return [_to_common(ev) for ev in resp.json().get("value", [])]

        # 複数カレンダー選択時も選択数に比例して遅くならないよう並列取得する
        results = await asyncio.gather(*[fetch_one(p) for p in self._read_paths])
        return [ev for group in results for ev in group]

    async def create_event(
        self, *, title: str, start: datetime, end: datetime, location: str | None = None
    ) -> dict:
        body = {
            "subject": title,
            "start": {"dateTime": start.isoformat(), "timeZone": "Asia/Tokyo"},
            "end": {"dateTime": end.isoformat(), "timeZone": "Asia/Tokyo"},
        }
        if location:
            body["location"] = {"displayName": location}
        resp = await self._client.post(f"{self._write_path}/events", json=body)
        resp.raise_for_status()
        return _to_common(resp.json())

    async def update_event(
        self, event_id: str, *, start: datetime | None = None, end: datetime | None = None
    ) -> dict:
        body = {}
        if start:
            body["start"] = {"dateTime": start.isoformat(), "timeZone": "Asia/Tokyo"}
        if end:
            body["end"] = {"dateTime": end.isoformat(), "timeZone": "Asia/Tokyo"}
        resp = await self._client.patch(f"{self._write_path}/events/{event_id}", json=body)
        resp.raise_for_status()
        return _to_common(resp.json())
