import time
import uuid
from datetime import datetime, timezone

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
    *, user_id: str, provider: str, calendar_ids: list[str] | None, write_calendar_ids: list[str] | None
) -> None:
    """1アカウント内に複数カレンダーがある場合の設定（参照・登録先ともに最大3件まで選択可能）。
    calendar_ids=Noneはprimary/既定カレンダーのみを参照、write_calendar_ids=Noneは既定カレンダーへ登録。
    """
    sb = get_supabase()
    sb.table("oauth_tokens").update(
        {"selected_calendar_ids": calendar_ids, "write_calendar_ids": write_calendar_ids}
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


def delete_oauth_tokens(*, user_id: str, provider: str) -> None:
    """リフレッシュトークンが失効（invalid_grant等）した連携を解除する。
    ユーザーが外部でアクセス権を取り消した場合や、開発中アプリのリフレッシュトークンが
    期限切れになった場合、保存されたトークンで永久にリフレッシュが失敗し続けるため、
    行ごと削除して「未連携」状態に戻し、再連携を促す。
    """
    sb = get_supabase()
    sb.table("oauth_tokens").delete().eq("user_id", user_id).eq("provider", provider).execute()


# ---------- 連携切れ通知（§UC-新: Chat/Home/Scheduleへの再連携アラート） ----------
#
# oauth_tokensの行は連携解除時（delete_oauth_tokens）に消えてしまい、「一度も連携した
# ことが無いユーザー」と「連携が壊れて切れたユーザー」を区別できなくなる。後者にだけ
# 再連携を促すため、oauth_tokensとは独立した calendar_connection_state に
# 「過去に連携したことがあるか」「いつから壊れているか」「ユーザーが通知を止めたか」を
# 保持しておく。

def mark_connection_ok(*, user_id: str, provider: str) -> None:
    """OAuth連携（初回・再連携どちらも）が成功した直後に呼ぶ。
    再連携した場合はbroken_since/dismissedをクリアし、以後また壊れたら
    改めて通知が出るようにする。
    """
    get_supabase().table("calendar_connection_state").upsert(
        {
            "user_id": user_id,
            "provider": provider,
            "ever_connected": True,
            "broken_since": None,
            "dismissed": False,
        },
        on_conflict="user_id,provider",
    ).execute()


def mark_connection_broken(*, user_id: str, provider: str) -> None:
    """トークン失効（invalid_grant）でdelete_oauth_tokensを呼ぶのと同じタイミングで呼ぶ。
    一度も連携していないプロバイダについては通知不要なので、ever_connectedがまだ
    立っていない場合は何もしない（初回連携前にこの関数が呼ばれることは無いはずだが、念のため）。
    """
    sb = get_supabase()
    existing = (
        sb.table("calendar_connection_state")
        .select("ever_connected, broken_since")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .limit(1)
        .execute()
    )
    if not existing.data or not existing.data[0]["ever_connected"]:
        return
    if existing.data[0]["broken_since"]:
        return  # 既に壊れている記録があれば最初に壊れた時刻を保持する
    sb.table("calendar_connection_state").update(
        {"broken_since": datetime.now(timezone.utc).isoformat()}
    ).eq("user_id", user_id).eq("provider", provider).execute()


def set_connection_dismissed(*, user_id: str, provider: str, dismissed: bool) -> None:
    """「もうこのカレンダーは使わないので通知不要」という意思表示をユーザーから受けた場合に呼ぶ。
    ever_connectedすら無い（一度も連携していない）プロバイダに対しては何もしない。
    """
    get_supabase().table("calendar_connection_state").update({"dismissed": dismissed}).eq(
        "user_id", user_id
    ).eq("provider", provider).execute()


def get_connection_notices(user_id: str) -> dict[str, bool]:
    """provider -> 再連携を促す通知を出すべきか。DBのみを見る軽量な問い合わせで、
    外部カレンダーAPIへは一切アクセスしない（Chat/Home/Schedule表示のたびに呼ばれるため）。
    """
    rows = (
        get_supabase()
        .table("calendar_connection_state")
        .select("provider, broken_since, dismissed")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return {
        r["provider"]: bool(r["broken_since"]) and not r["dismissed"]
        for r in rows
    }
