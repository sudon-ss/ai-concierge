from fastapi import Header, HTTPException

from .auth import decode_session_token
from .models import SessionUser


def get_current_user(authorization: str | None = Header(default=None)) -> SessionUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="ログインが必要です")

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_session_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="セッションが無効です。再ログインしてください")

    return SessionUser(user_id=payload["sub"], email=payload["email"])
