from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from ..auth import (
    create_session_token,
    decode_link_token,
    decode_oauth_state,
    get_or_create_user,
    link_provider_identity,
    mark_connection_ok,
    save_oauth_tokens,
)
from ..config import settings

router = APIRouter(prefix="/api/auth/google", tags=["auth"])

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
SCOPES = " ".join(
    [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
    ]
)


@router.get("/login")
def login(state: str | None = None):
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
    }
    if state:
        params["state"] = state
    return RedirectResponse(f"{AUTH_URL}?{urlencode(params)}")


@router.get("/callback")
async def callback(code: str | None = None, error: str | None = None, state: str | None = None):
    # stateには「オンボーディング画面からの接続か」と「既にログイン中のユーザーへの
    # 追加連携か」の2つの情報をエンコードして載せている（encode_oauth_state参照）
    parsed_state = decode_oauth_state(state)
    target_path = "/onboarding" if parsed_state.get("r") == "onboarding" else "/settings"
    if error or not code:
        return RedirectResponse(f"{settings.frontend_origin}{target_path}?error=google_{error or 'no_code'}")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Googleトークン取得に失敗しました")
        token_data = token_resp.json()

        userinfo_resp = await client.get(
            USERINFO_URL, headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

    # 既にログイン中（=別プロバイダで連携済み）のユーザーが、メールアドレスの異なる
    # Googleアカウントを追加で連携しようとした場合、get_or_create_userのメール一致判定
    # では別ユーザーとして扱われてしまう。stateに載ったリンク用トークンで本人確認できた
    # 場合はそちらのuser_idを優先し、意図しないアカウント分裂を防ぐ
    linked_user_id = decode_link_token(parsed_state["l"]) if parsed_state.get("l") else None
    if linked_user_id:
        user_id = linked_user_id
        link_provider_identity(user_id=user_id, provider="google", provider_user_id=userinfo["sub"])
    else:
        user_id = get_or_create_user(
            provider="google",
            provider_user_id=userinfo["sub"],
            email=userinfo["email"],
            display_name=userinfo.get("name"),
        )
    save_oauth_tokens(
        user_id=user_id,
        provider="google",
        access_token=token_data["access_token"],
        refresh_token=token_data.get("refresh_token"),
        expires_in=token_data["expires_in"],
    )
    mark_connection_ok(user_id=user_id, provider="google")

    session_token = create_session_token(user_id, userinfo["email"])
    return RedirectResponse(
        f"{settings.frontend_origin}{target_path}?connected=google&session={session_token}"
    )
