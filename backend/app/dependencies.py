import time

from fastapi import Header, HTTPException, Response

from .auth import SESSION_RENEW_AFTER_SECONDS, create_session_token, decode_session_token
from .models import SessionUser

RENEWED_SESSION_HEADER = "X-Session-Token"


def get_current_user(response: Response, authorization: str | None = Header(default=None)) -> SessionUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="ログインが必要です")

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_session_token(token)
    if not payload or "sub" not in payload or "email" not in payload:
        raise HTTPException(status_code=401, detail="セッションが無効です。再ログインしてください")

    # 発行から一定期間がたったセッションは、新しいトークンをヘッダーで返す（フロントが差し替える）。
    # 使い続けている間は30日で切れないようにするため。ストリーミング応答（チャット）では
    # ヘッダーを付けられないが、画面を開けば他のAPIで更新される
    if time.time() - int(payload.get("iat", 0)) > SESSION_RENEW_AFTER_SECONDS:
        response.headers[RENEWED_SESSION_HEADER] = create_session_token(payload["sub"], payload["email"])

    return SessionUser(user_id=payload["sub"], email=payload["email"])
