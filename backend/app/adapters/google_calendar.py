import asyncio
from datetime import datetime
from urllib.parse import quote

import httpx

from ..config import settings
from .base import CalendarAdapter

API_BASE = "https://www.googleapis.com/calendar/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"


async def refresh_google_token(refresh_token: str) -> tuple[str, int]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["access_token"], data["expires_in"]


async def list_google_calendars(access_token: str) -> list[dict]:
    """ユーザーが持つ全カレンダー一覧（primary以外の追加・共有カレンダーを含む）を返す。"""
    async with httpx.AsyncClient(
        base_url=API_BASE, headers={"Authorization": f"Bearer {access_token}"}
    ) as client:
        resp = await client.get("/users/me/calendarList")
        resp.raise_for_status()
        return [
            {
                "id": c["id"],
                "name": c.get("summaryOverride") or c.get("summary", c["id"]),
                "primary": c.get("primary", False),
            }
            for c in resp.json().get("items", [])
        ]


def _to_common(ev: dict) -> dict:
    start = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date")
    end = ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date")
    return {
        "id": ev["id"],
        "title": ev.get("summary", "(タイトルなし)"),
        "start": start,
        "end": end,
        "location": ev.get("location"),
        "source": "google",
    }


class GoogleCalendarAdapter(CalendarAdapter):
    def __init__(
        self,
        access_token: str,
        read_calendar_ids: list[str] | None = None,
        write_calendar_id: str | None = None,
    ):
        self._client = httpx.AsyncClient(
            base_url=API_BASE, headers={"Authorization": f"Bearer {access_token}"}
        )
        # 未選択時はprimary（既定カレンダー）にフォールバック（§10-4後続: 複数カレンダー対応、最大3件）
        self._read_paths = [quote(cid, safe="") for cid in (read_calendar_ids or ["primary"])]
        self._write_path = quote(write_calendar_id or (read_calendar_ids or ["primary"])[0], safe="")

    async def list_events(self, time_min: datetime, time_max: datetime) -> list[dict]:
        params = {
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "singleEvents": "true",
            "orderBy": "startTime",
        }

        async def fetch_one(path: str) -> list[dict]:
            resp = await self._client.get(f"/calendars/{path}/events", params=params)
            resp.raise_for_status()
            return [_to_common(ev) for ev in resp.json().get("items", [])]

        # 複数カレンダー選択時も選択数に比例して遅くならないよう並列取得する
        results = await asyncio.gather(*[fetch_one(p) for p in self._read_paths])
        return [ev for group in results for ev in group]

    async def create_event(
        self, *, title: str, start: datetime, end: datetime, location: str | None = None
    ) -> dict:
        body = {
            "summary": title,
            "start": {"dateTime": start.isoformat()},
            "end": {"dateTime": end.isoformat()},
        }
        if location:
            body["location"] = location
        resp = await self._client.post(f"/calendars/{self._write_path}/events", json=body)
        resp.raise_for_status()
        return _to_common(resp.json())

    async def update_event(
        self, event_id: str, *, start: datetime | None = None, end: datetime | None = None
    ) -> dict:
        body = {}
        if start:
            body["start"] = {"dateTime": start.isoformat()}
        if end:
            body["end"] = {"dateTime": end.isoformat()}
        resp = await self._client.patch(f"/calendars/{self._write_path}/events/{event_id}", json=body)
        resp.raise_for_status()
        return _to_common(resp.json())
