from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..database import get_supabase
from ..dependencies import get_current_user
from ..models import SessionUser
from ..models import TaskCreate as TaskCreateModel

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
def list_tasks(user: SessionUser = Depends(get_current_user)):
    """完了済みも含めて全件返す（画面側で「期限3日以内」「その他」に振り分けるため）。"""
    sb = get_supabase()
    res = (
        sb.table("tasks")
        .select("*")
        .eq("user_id", user.user_id)
        .order("due_date")
        .execute()
    )
    return res.data


@router.post("")
def create_task(body: TaskCreateModel, user: SessionUser = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("tasks")
        .insert(
            {
                "user_id": user.user_id,
                "title": body.title,
                "due_date": body.due_date,
                "priority": body.priority,
            }
        )
        .execute()
    )
    return res.data[0]


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    done: Optional[bool] = None


@router.patch("/{task_id}")
def update_task(task_id: str, body: TaskUpdate, user: SessionUser = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="更新内容がありません")
    sb = get_supabase()
    res = (
        sb.table("tasks")
        .update(updates)
        .eq("id", task_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    return res.data[0]


@router.patch("/{task_id}/done")
def complete_task(task_id: str, user: SessionUser = Depends(get_current_user)):
    sb = get_supabase()
    sb.table("tasks").update({"done": True}).eq("id", task_id).eq("user_id", user.user_id).execute()
    return {"ok": True}


@router.delete("/{task_id}")
def delete_task(task_id: str, user: SessionUser = Depends(get_current_user)):
    sb = get_supabase().table("tasks").delete().eq("id", task_id).eq("user_id", user.user_id).execute()
    return {"ok": True}
