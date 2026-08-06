import time
import uuid

from jose import JWTError, jwt

from .config import settings
from .database import get_supabase

ALGORITHM = "HS256"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # 30日


def create_session_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.session_secret, algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.session_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_or_create_user(*, provider: str, provider_user_id: str, email: str, display_name: str | None) -> str:
    """provider(google/outlook)のアカウントに紐づくuser_idを取得。
    同じメールアドレスで別プロバイダを連携した場合も同一user_idに統合する（§10-4）。
    """
    sb = get_supabase()

    identity = (
        sb.table("user_identities")
        .select("user_id")
        .eq("provider", provider)
        .eq("provider_user_id", provider_user_id)
        .limit(1)
        .execute()
    )
    if identity.data:
        return identity.data[0]["user_id"]

    existing_by_email = sb.table("users").select("id").eq("email", email).limit(1).execute()
    if existing_by_email.data:
        user_id = existing_by_email.data[0]["id"]
    else:
        user_id = str(uuid.uuid4())
        sb.table("users").insert(
            {"id": user_id, "email": email, "display_name": display_name}
        ).execute()

    sb.table("user_identities").insert(
        {
            "user_id": user_id,
            "provider": provider,
            "provider_user_id": provider_user_id,
        }
    ).execute()
    return user_id


def save_oauth_tokens(
    *, user_id: str, provider: str, access_token: str, refresh_token: str | None, expires_in: int
) -> None:
    sb = get_supabase()
    expires_at = int(time.time()) + expires_in

    if refresh_token is None:
        # Googleは同意画面を毎回出さない場合refresh_tokenを返さないため、既存の値を保持する
        existing = get_oauth_tokens(user_id=user_id, provider=provider)
        refresh_token = existing["refresh_token"] if existing else None

    sb.table("oauth_tokens").upsert(
        {
            "user_id": user_id,
            "provider": provider,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
        },
        on_conflict="user_id,provider",
    ).execute()


def set_calendar_selection(
    *, user_id: str, provider: str, calendar_ids: list[str] | None, write_calendar_id: str | None
) -> None:
    """1アカウント内に複数カレンダーがある場合の設定（空き時間チェック対象を最大3件、新規登録先を1件）。
    calendar_ids=Noneはprimary/既定カレンダーのみに戻す。
    """
    sb = get_supabase()
    sb.table("oauth_tokens").update(
        {"selected_calendar_ids": calendar_ids, "write_calendar_id": write_calendar_id}
    ).eq("user_id", user_id).eq("provider", provider).execute()


def get_oauth_tokens(*, user_id: str, provider: str) -> dict | None:
    sb = get_supabase()
    res = (
        sb.table("oauth_tokens")
        .select("*")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None
