from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from ..auth import get_oauth_tokens, set_calendar_selection
from ..calendar_service import list_calendars as fetch_calendars
from ..dependencies import get_current_user
from ..models import CalendarSource, SessionUser

router = APIRouter(prefix="/api/calendars", tags=["calendars"])

MAX_SELECTED_CALENDARS = 3


@router.get("")
async def get_calendars(user: SessionUser = Depends(get_current_user)):
    """連携済みの各プロバイダについて、選択可能なカレンダー一覧と現在の選択状態を返す。
    1つのGoogle/Outlookアカウント内に複数カレンダー（仕事用・個人用・共有等）がある場合に、
    どのカレンダーを空き時間チェック対象にするか（最大3件）・新規予定の登録先はどれかを
    ユーザーに選ばせるためのAPI（§10-4後続）。
    """
    result = {}
    for provider in ("google", "outlook"):
        calendars = await fetch_calendars(user.user_id, provider)
        if calendars is None:
            result[provider] = {
                "connected": False,
                "calendars": [],
                "selectedIds": [],
                "writeId": None,
            }
            continue
        token_row = get_oauth_tokens(user_id=user.user_id, provider=provider) or {}
        result[provider] = {
            "connected": True,
            "calendars": calendars,
            "selectedIds": token_row.get("selected_calendar_ids") or [],
            "writeId": token_row.get("write_calendar_id"),
        }
    return result


class SelectCalendarsRequest(BaseModel):
    calendar_ids: list[str] | None = None  # None/空リスト = primary/既定カレンダーのみに戻す
    write_calendar_id: str | None = None  # None = calendar_idsの先頭を使う

    @field_validator("calendar_ids")
    @classmethod
    def limit_count(cls, v: list[str] | None) -> list[str] | None:
        if v and len(v) > MAX_SELECTED_CALENDARS:
            raise ValueError(f"カレンダーは最大{MAX_SELECTED_CALENDARS}件まで選択できます")
        return v


@router.put("/{provider}/selection")
def select_calendars(
    provider: CalendarSource, body: SelectCalendarsRequest, user: SessionUser = Depends(get_current_user)
):
    token_row = get_oauth_tokens(user_id=user.user_id, provider=provider)
    if not token_row:
        raise HTTPException(status_code=400, detail=f"{provider} が連携されていません")
    set_calendar_selection(
        user_id=user.user_id,
        provider=provider,
        calendar_ids=body.calendar_ids or None,
        write_calendar_id=body.write_calendar_id,
    )
    return {"ok": True, "selectedIds": body.calendar_ids or [], "writeId": body.write_calendar_id}
