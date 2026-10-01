from typing import Literal, Optional

from pydantic import BaseModel, field_validator

CalendarSource = Literal["google", "outlook"]
MemoPriority = Literal["normal", "high", "critical"]


class CalendarEvent(BaseModel):
    id: str
    title: str
    start: str  # ISO
    end: str  # ISO
    source: CalendarSource
    location: Optional[str] = None
    memo: Optional[str] = None
    memo_priority: MemoPriority = "normal"
    memo_flagged: bool = False


class Task(BaseModel):
    id: str
    title: str
    due_date: Optional[str] = None  # ISO date
    priority: Literal["low", "medium", "high"] = "medium"
    done: bool = False


class TaskCreate(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"


class FreeSlot(BaseModel):
    start: str
    end: str
    label: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    # デモプロファイル（社長/役員/CFO）選択に応じて二人称の呼び方を変える
    profile: Optional[Literal["ceo", "director", "cfo"]] = None

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, v: str) -> str:
        """空・空白のみのメッセージはAnthropic API側で400になり、履歴の自動リトライ
        （event_stream）が発動して会話履歴を丸ごと消してしまう。ここで事前に弾いて
        そもそもその経路に入らないようにする。"""
        if not v.strip():
            raise ValueError("メッセージを入力してください")
        return v


class SessionUser(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
