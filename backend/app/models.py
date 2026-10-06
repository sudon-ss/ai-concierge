from datetime import date
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


MAX_TASK_TITLE_LENGTH = 500


def validate_task_title(v: Optional[str]) -> Optional[str]:
    """空・空白のみの件名は拒否（画面は既定名で登録するが、APIの直叩きでは空件名が作れてしまっていた）。"""
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("件名を入力してください")
    if len(v) > MAX_TASK_TITLE_LENGTH:
        raise ValueError(f"件名は{MAX_TASK_TITLE_LENGTH}文字以内にしてください")
    return v


def validate_task_due_date(v: Optional[str]) -> Optional[str]:
    """期限は YYYY-MM-DD のみ受け付ける。不正な文字列がDBまで届くと500エラーになっていた。"""
    if v is None or v == "":
        return None
    try:
        return date.fromisoformat(v).isoformat()
    except ValueError:
        raise ValueError("期限は YYYY-MM-DD の形式で指定してください") from None


class TaskCreate(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"

    _check_title = field_validator("title")(validate_task_title)
    _check_due_date = field_validator("due_date")(validate_task_due_date)


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
