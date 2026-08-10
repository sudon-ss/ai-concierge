"""配信ジョブをアプリ内で定期実行する。

外部のCronサービス（Render Cron Jobは1本あたり最低$1/月の別課金）を使わず、
常時起動しているWebサービスの中で回すことで追加費用をゼロにしている。

インスタンスが複数に増えると各インスタンスがこのループを持つが、
送信前に sent_notifications へ予約を入れる方式（push.claim_once）のため
同じ通知が重複して飛ぶことはない。
"""
import asyncio
import logging

from .config import settings
from .jobs import REMINDER_TICK_MINUTES, run_briefing, run_reminders

logger = logging.getLogger(__name__)

# 起動直後は他の初期化と重なるため、少し待ってから最初の実行に入る
STARTUP_DELAY_SECONDS = 30


async def _tick() -> None:
    for name, job in (("reminders", run_reminders), ("briefing", run_briefing)):
        try:
            result = await job()
            if result.get("sent"):
                logger.info("配信ジョブ %s: %s", name, result)
        except Exception as exc:  # noqa: BLE001
            # 1回の失敗でループごと止めない（次のtickで自然に復帰する）
            logger.warning("配信ジョブ %s が失敗しました: %s", name, exc)


async def run_forever() -> None:
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    interval = REMINDER_TICK_MINUTES * 60
    logger.info("配信スケジューラを開始しました（%d分間隔）", REMINDER_TICK_MINUTES)
    while True:
        await _tick()
        await asyncio.sleep(interval)


def should_run() -> bool:
    """VAPID未設定なら送りようがないので回さない。
    外部Cronへ移行したくなった場合は ENABLE_SCHEDULER=false で止められる。
    """
    return settings.enable_scheduler and bool(settings.vapid_private_key)
