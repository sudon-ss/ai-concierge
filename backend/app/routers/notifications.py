from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from .. import push
from ..config import settings
from ..dependencies import get_current_user
from ..jobs import run_briefing, run_reminders
from ..models import SessionUser
from ..settings_store import get_settings, save_settings

router = APIRouter(prefix="/api", tags=["notifications"])


# ---------- プッシュ購読 ----------

@router.get("/push/public-key")
def public_key():
    """ブラウザが購読する際に必要なVAPID公開鍵。
    ビルド時の環境変数にせずAPIで配ることで、鍵を変えてもフロントの再デプロイが要らない。
    """
    return {"publicKey": settings.vapid_public_key, "configured": push.is_configured()}


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.post("/push/subscribe")
def subscribe(body: SubscribeRequest, user: SessionUser = Depends(get_current_user)):
    push.save_subscription(user.user_id, body.endpoint, body.p256dh, body.auth)
    return {"ok": True}


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/push/unsubscribe")
def unsubscribe(body: UnsubscribeRequest, user: SessionUser = Depends(get_current_user)):
    push.delete_subscription(body.endpoint)
    return {"ok": True}


@router.post("/push/test")
def send_test(user: SessionUser = Depends(get_current_user)):
    """設定画面から通知の到達確認をするためのエンドポイント。
    iOSは設定手順が煩雑なので、その場で届くか試せるようにしておく。
    """
    sent = push.send_to_user(
        user.user_id,
        title="THE CONCIERGE",
        body="通知のテストでございます。こちらが表示されていれば設定は完了です。",
        url="/",
        tag="test",
    )
    return {"sent": sent}


# ---------- 通知設定 ----------

class SettingsPatch(BaseModel):
    briefing_enabled: bool | None = None
    briefing_time: str | None = None
    notification_enabled: bool | None = None
    reminder_minutes: int | None = None


@router.get("/settings")
def read_settings(user: SessionUser = Depends(get_current_user)):
    return get_settings(user.user_id)


@router.put("/settings")
def update_settings(body: SettingsPatch, user: SessionUser = Depends(get_current_user)):
    return save_settings(user.user_id, body.model_dump())


# ---------- 配信ジョブ（外部Cronから呼ぶ） ----------

def _verify_cron(secret: str | None) -> None:
    if not settings.cron_secret:
        # 未設定のまま公開すると誰でもジョブを起動できてしまう
        raise HTTPException(status_code=503, detail="CRON_SECRET が未設定です")
    if secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="不正なシークレットです")


@router.post("/jobs/reminders")
async def job_reminders(x_cron_secret: str | None = Header(default=None)):
    _verify_cron(x_cron_secret)
    return await run_reminders()


@router.post("/jobs/briefing")
async def job_briefing(x_cron_secret: str | None = Header(default=None)):
    _verify_cron(x_cron_secret)
    return await run_briefing()
