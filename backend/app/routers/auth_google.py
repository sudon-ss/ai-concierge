from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from ..auth import create_session_token, get_or_create_user, save_oauth_tokens
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
    # stateはオンボーディング画面からの接続かどうかを判別するためだけに使う
    # （オンボーディング側はカレンダー選択ステップへ戻す必要があるため、既定の/settingsとは別経路にする）
    target_path = "/onboarding" if state == "onboarding" else "/settings"
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

    session_token = create_session_token(user_id, userinfo["email"])
    return RedirectResponse(
        f"{settings.frontend_origin}{target_path}?connected=google&session={session_token}"
    )
