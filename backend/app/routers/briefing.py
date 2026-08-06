import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from ..calendar_service import get_connected_adapters
from ..database import get_supabase
from ..dependencies import get_current_user
from ..models import SessionUser

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


@router.get("")
async def get_briefing(user: SessionUser = Depends(get_current_user)):
    now = datetime.now().astimezone()
    time_max = now + timedelta(days=3)

    adapters = await get_connected_adapters(user.user_id)
    events_lists = await asyncio.gather(*[a.list_events(now, time_max) for a in adapters.values()])
    events = [ev for lst in events_lists for ev in lst]
    events.sort(key=lambda e: e["start"] or "")

    sb = get_supabase()
    tasks_res = (
        sb.table("tasks")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("done", False)
        .lte("due_date", time_max.date().isoformat())
        .order("due_date")
        .execute()
    )

    return {"events": events, "tasks": tasks_res.data}
