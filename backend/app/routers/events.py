import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..calendar_service import get_connected_adapters
from ..dependencies import get_current_user
from ..models import CalendarSource, SessionUser
from ..tools import create_event

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("")
async def list_events_endpoint(days: int = 30, user: SessionUser = Depends(get_current_user)):
    """カレンダー画面用: Phase 0のデモデータではなく、実際に連携済みのGoogle/Outlookの
    予定をそのまま一覧表示するためのエンドポイント。
    """
    now = datetime.now().astimezone()
    time_max = now + timedelta(days=days)

    adapters = await get_connected_adapters(user.user_id)
    events_lists = await asyncio.gather(*[a.list_events(now, time_max) for a in adapters.values()])
    events = [ev for lst in events_lists for ev in lst]
    events.sort(key=lambda e: e["start"] or "")
    return events


class CreateEventRequest(BaseModel):
    calendar: CalendarSource
    title: str
    start: str
    end: str
    location: str | None = None
    memo: str | None = None


@router.post("")
async def create_event_endpoint(body: CreateEventRequest, user: SessionUser = Depends(get_current_user)):
    """SlotPickerでユーザーが候補を選び「確定」した際に、会話を介さず直接カレンダーへ登録する。
    Claudeの提案（get_free_slots）とユーザーの確定操作を分離することで、
    ボタン操作からの意図をチャットの文脈解釈に頼らず確実に反映する。
    """
    try:
        ev = await create_event(
            user.user_id,
            calendar=body.calendar,
            title=body.title,
            start=body.start,
            end=body.end,
            location=body.location,
            memo=body.memo,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ev
