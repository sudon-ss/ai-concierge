from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from ..auth import create_session_token, get_or_create_user, save_oauth_tokens
from ..config import settings

router = APIRouter(prefix="/api/auth/outlook", tags=["auth"])

SCOPES = "offline_access Calendars.ReadWrite User.Read openid email profile"


def _authorize_url() -> str:
    return f"https://login.microsoftonline.com/{settings.microsoft_tenant}/oauth2/v2.0/authorize"


def _token_url() -> str:
    return f"https://login.microsoftonline.com/{settings.microsoft_tenant}/oauth2/v2.0/token"


@router.get("/login")
def login(state: str | None = None):
    params = {
        "client_id": settings.microsoft_client_id,
        "redirect_uri": settings.microsoft_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "response_mode": "query",
    }
    if state:
        params["state"] = state
    return RedirectResponse(f"{_authorize_url()}?{urlencode(params)}")


@router.get("/callback")
async def callback(code: str | None = None, error: str | None = None, state: str | None = None):
    # stateはオンボーディング画面からの接続かどうかを判別するためだけに使う
    target_path = "/onboarding" if state == "onboarding" else "/settings"
    if error or not code:
        return RedirectResponse(f"{settings.frontend_origin}{target_path}?error=outlook_{error or 'no_code'}")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            _token_url(),
            data={
                "code": code,
                "client_id": settings.microsoft_client_id,
                "client_secret": settings.microsoft_client_secret,
                "redirect_uri": settings.microsoft_redirect_uri,
                "grant_type": "authorization_code",
                "scope": SCOPES,
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Outlookトークン取得に失敗しました")
        token_data = token_resp.json()

        me_resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        me_resp.raise_for_status()
        me = me_resp.json()

    email = me.get("mail") or me.get("userPrincipalName")
    user_id = get_or_create_user(
        provider="outlook",
        provider_user_id=me["id"],
        email=email,
        display_name=me.get("displayName"),
    )
    save_oauth_tokens(
        user_id=user_id,
        provider="outlook",
        access_token=token_data["access_token"],
        refresh_token=token_data.get("refresh_token"),
        expires_in=token_data["expires_in"],
    )

    session_token = create_session_token(user_id, email)
    return RedirectResponse(
        f"{settings.frontend_origin}{target_path}?connected=outlook&session={session_token}"
    )
