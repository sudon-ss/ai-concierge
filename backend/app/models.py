from typing import Literal, Optional

from pydantic import BaseModel

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


class SessionUser(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
