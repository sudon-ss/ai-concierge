import asyncio
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from .. import notes as notes_svc
from ..dependencies import get_current_user
from ..models import SessionUser

router = APIRouter(prefix="/api/notes", tags=["notes"])

UNAVAILABLE = HTTPException(status_code=503, detail="メモ機能は準備中です。しばらくしてからお試しください")


def _note_id(note_id: str) -> str:
    """UUIDでないIDがDBまで届くと500になるため、存在しないIDと同じ404で返す。"""
    try:
        return str(uuid.UUID(note_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="メモが見つかりません") from None


class NoteUpsert(BaseModel):
    # 予定の識別情報。"google:<予定ID>" "outlook:<予定ID>"（同じ会議が複数カレンダーにあれば複数）
    refs: list[str] = Field(min_length=1, max_length=6)
    title: str = Field(min_length=1, max_length=500)
    start: str
    end: str | None = None
    series_key: str | None = Field(default=None, max_length=500)
    body: str = Field(default="", max_length=notes_svc.MAX_BODY_LENGTH)
    flagged: bool | None = None
    # 画面の設定「AIによるメモ重要度判定」。OFFのときはキーワード判定だけにする
    use_ai: bool = True

    @field_validator("refs")
    @classmethod
    def check_refs(cls, v: list[str]) -> list[str]:
        for r in v:
            provider, _, ext = r.partition(":")
            if provider not in ("google", "outlook") or not ext or len(r) > 300:
                raise ValueError("予定の識別情報の形式が正しくありません")
        return v


@router.put("")
async def save_note(body: NoteUpsert, user: SessionUser = Depends(get_current_user)):
    """予定にメモを保存する（既にあれば更新）。保存するときに、重要度を1回だけ判定する。
    本文を空にして保存すると、メモは削除される。"""
    priority = await notes_svc.judge_importance(body.body, use_ai=body.use_ai)
    try:
        note = await asyncio.to_thread(
            notes_svc.upsert_note,
            user.user_id,
            refs=body.refs,
            title=body.title,
            start=body.start,
            end=body.end,
            series_key=body.series_key,
            body=body.body,
            priority=priority,
            flagged=body.flagged,
        )
    except notes_svc.NotesUnavailable:
        raise UNAVAILABLE from None
    except ValueError:
        raise HTTPException(status_code=422, detail="予定の日時の形式が正しくありません") from None
    return notes_svc.to_public(note) if note else {"deleted": True}


class ExtractTasksRequest(BaseModel):
    text: str = Field(min_length=1, max_length=notes_svc.MAX_BODY_LENGTH)


@router.post("/extract-tasks")
async def extract_tasks(body: ExtractTasksRequest, user: SessionUser = Depends(get_current_user)):
    """メモ本文から、本人がやるべきことの候補を取り出す（登録はしない。画面で「はい」を押したときに登録）。"""
    today = datetime.now(notes_svc.JST).date().isoformat()
    return {"tasks": await notes_svc.extract_tasks(body.text, today)}


@router.get("/previous")
async def previous(
    refs: str = Query(max_length=1000, description="この会議の識別情報（カンマ区切り）"),
    title: str = Query(max_length=500),
    start: str = Query(max_length=64),
    series_key: str | None = Query(default=None, max_length=500),
    user: SessionUser = Depends(get_current_user),
):
    """この会議の「前回のメモ」（同じ定例・同じ件名の、これより前の会議で一番新しいメモ）。無ければ note=null。"""
    ref_list = [r for r in refs.split(",") if r][:6]
    try:
        note = await asyncio.to_thread(
            notes_svc.previous_note, user.user_id, refs=ref_list, title=title, series_key=series_key, before=start
        )
    except notes_svc.NotesUnavailable:
        return {"note": None}  # 準備中でも、画面は「前回なし」として扱う（編集画面を壊さない）
    except ValueError:
        raise HTTPException(status_code=422, detail="予定の日時の形式が正しくありません") from None
    return {"note": notes_svc.to_public(note) if note else None}


# 注意: "/search" は "/{note_id}" より前に定義する（後ろだと、"search"がIDとして扱われてしまう）
@router.get("/search")
async def search(
    q: str | None = Query(default=None, max_length=200),
    start: str | None = None,
    end: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    user: SessionUser = Depends(get_current_user),
):
    """メモをキーワード・期間（開始日〜終了日、YYYY-MM-DD）で探す。新しい予定のメモから順に返す。"""
    try:
        rows = await asyncio.to_thread(
            notes_svc.search_notes,
            user.user_id,
            query=q,
            date_from=f"{start}T00:00:00+09:00" if start else None,
            date_to=f"{end}T23:59:59+09:00" if end else None,
            limit=limit,
        )
    except notes_svc.NotesUnavailable:
        raise UNAVAILABLE from None
    except ValueError:
        raise HTTPException(status_code=422, detail="期間は YYYY-MM-DD の形式で指定してください") from None
    return [notes_svc.to_public(r, full=False) for r in rows]


@router.get("/{note_id}")
async def get_note(note_id: str, user: SessionUser = Depends(get_current_user)):
    try:
        note = await asyncio.to_thread(notes_svc.get_note, user.user_id, _note_id(note_id))
    except notes_svc.NotesUnavailable:
        raise UNAVAILABLE from None
    if not note:
        raise HTTPException(status_code=404, detail="メモが見つかりません")
    return notes_svc.to_public(note)


@router.delete("/{note_id}")
async def remove_note(note_id: str, user: SessionUser = Depends(get_current_user)):
    try:
        await asyncio.to_thread(notes_svc.delete_note, user.user_id, _note_id(note_id))
    except notes_svc.NotesUnavailable:
        raise UNAVAILABLE from None
    return {"ok": True}
