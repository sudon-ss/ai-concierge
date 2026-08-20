import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from ..calendar_service import dedupe_events, get_connected_adapters
from ..dependencies import get_current_user
from ..models import CalendarSource, SessionUser
from ..tools import create_event, hold_tentative_slots, release_tentative_slots

router = APIRouter(prefix="/api/events", tags=["events"])

MAX_TENTATIVE_SLOTS = 5

JST = ZoneInfo("Asia/Tokyo")


def _sort_key(start: str | None) -> datetime:
    """開始時刻を比較可能なawareなdatetimeに正規化する。
    Googleはオフセット付き（+09:00）、Outlookはオフセットなしのdatetime文字列を返すなど
    プロバイダによって表記形式が異なり、文字列の単純比較では並び順が崩れることがあるため、
    実際の日時としてパースしてから比較する。
    """
    if not start:
        return datetime.min.replace(tzinfo=JST)
    try:
        dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=JST)
    return dt if dt.tzinfo else dt.replace(tzinfo=JST)


@router.get("")
async def list_events_endpoint(days: int = 30, user: SessionUser = Depends(get_current_user)):
    """カレンダー画面用: Phase 0のデモデータではなく、実際に連携済みのGoogle/Outlookの
    予定をそのまま一覧表示するためのエンドポイント。
    """
    now = datetime.now().astimezone()
    time_max = now + timedelta(days=days)

    adapters = await get_connected_adapters(user.user_id)
    events_lists = await asyncio.gather(*[a.list_events(now, time_max) for a in adapters.values()])
    events = dedupe_events([ev for lst in events_lists for ev in lst])
    events.sort(key=lambda e: _sort_key(e["start"]))
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
        events = await create_event(
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
    return events


class SlotInput(BaseModel):
    start: str
    end: str


class HoldTentativeRequest(BaseModel):
    calendar: CalendarSource
    title: str
    slots: list[SlotInput]

    @field_validator("slots")
    @classmethod
    def limit_slots(cls, v: list[SlotInput]) -> list[SlotInput]:
        if not v:
            raise ValueError("仮押さえする枠を指定してください")
        if len(v) > MAX_TENTATIVE_SLOTS:
            raise ValueError(f"仮押さえは最大{MAX_TENTATIVE_SLOTS}枠までです")
        return v


@router.post("/tentative")
async def hold_tentative_endpoint(
    body: HoldTentativeRequest, user: SessionUser = Depends(get_current_user)
):
    """候補枠を「[仮]」付き予定として実カレンダーへ押さえる。
    相手の返答を待つ間に他の予定で埋まるのを防ぐための機能。
    """
    try:
        return await hold_tentative_slots(
            user.user_id,
            calendar=body.calendar,
            title=body.title,
            slots=[s.model_dump() for s in body.slots],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class TentativeRef(BaseModel):
    calendar: CalendarSource
    event_id: str
    calendar_id: str | None = None


class ReleaseTentativeRequest(BaseModel):
    items: list[TentativeRef]


@router.post("/tentative/release")
async def release_tentative_endpoint(
    body: ReleaseTentativeRequest, user: SessionUser = Depends(get_current_user)
):
    """仮押さえした枠を削除する（予定確定時・キャンセル時の後片付け）。
    DELETEではなくPOSTなのは、削除対象の一覧をリクエストボディで受け取るため。
    """
    if not body.items:
        return {"deleted": 0}
    deleted = await release_tentative_slots(
        user.user_id, items=[i.model_dump() for i in body.items]
    )
    return {"deleted": deleted}
