"""Web Push の送信まわり。

アプリを閉じている間にお知らせを届けるための仕組み。
iOS は 16.4 以降、ホーム画面に追加した PWA に限り対応している。
"""
import json
import logging

from pywebpush import WebPushException, webpush

from .config import settings
from .database import get_supabase

logger = logging.getLogger(__name__)

# 宛先が無効になったことを示すHTTPステータス。購読を消してよい合図
GONE_STATUSES = (404, 410)


def is_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def get_subscriptions(user_id: str) -> list[dict]:
    return (
        get_supabase()
        .table("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", user_id)
        .execute()
        .data
    )


def save_subscription(user_id: str, endpoint: str, p256dh: str, auth: str) -> None:
    """同じ端末から再登録されることがあるため endpoint で upsert する。"""
    get_supabase().table("push_subscriptions").upsert(
        {"user_id": user_id, "endpoint": endpoint, "p256dh": p256dh, "auth": auth},
        on_conflict="endpoint",
    ).execute()


def delete_subscription(endpoint: str) -> None:
    get_supabase().table("push_subscriptions").delete().eq("endpoint", endpoint).execute()


def send_to_user(user_id: str, *, title: str, body: str, url: str = "/", tag: str | None = None) -> int:
    """ユーザーの全端末へ送り、成功した件数を返す。
    宛先が失効していた場合はその購読を削除する（放置すると毎回失敗し続けるため）。
    """
    if not is_configured():
        logger.warning("VAPID鍵が未設定のため通知を送信できません")
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag}, ensure_ascii=False)
    sent = 0

    for sub in get_subscriptions(user_id):
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in GONE_STATUSES:
                delete_subscription(sub["endpoint"])
                logger.info("失効した購読を削除しました: %s", status)
            else:
                logger.warning("プッシュ送信に失敗: %s", status or exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("プッシュ送信で予期しないエラー: %s", exc)

    return sent


def claim_once(user_id: str, kind: str, dedup_key: str) -> bool:
    """同じ通知を二重に送らないための予約。
    先にDBへ入れて、unique違反なら既に送信済みとみなす。
    送信してから記録すると、多重起動時に同じ通知が複数回飛ぶ。
    """
    try:
        get_supabase().table("sent_notifications").insert(
            {"user_id": user_id, "kind": kind, "dedup_key": dedup_key}
        ).execute()
        return True
    except Exception:  # noqa: BLE001  unique違反を含む
        return False
