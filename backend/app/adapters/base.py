from abc import ABC, abstractmethod
from datetime import datetime


class CalendarAdapter(ABC):
    """Google / Outlook を意識しないAIコア側から見た共通インターフェース。"""

    @abstractmethod
    async def list_events(self, time_min: datetime, time_max: datetime) -> list[dict]:
        """[{id, title, start, end, location}] のリストを返す（両アダプター共通フォーマット）。"""

    @abstractmethod
    async def create_event(
        self, *, title: str, start: datetime, end: datetime, location: str | None = None
    ) -> dict:
        """作成したイベントを共通フォーマットで返す。"""

    @abstractmethod
    async def update_event(
        self, event_id: str, *, start: datetime | None = None, end: datetime | None = None
    ) -> dict:
        """更新後のイベントを共通フォーマットで返す。"""
