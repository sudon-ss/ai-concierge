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


class IdentityLinkedToAnotherUserError(Exception):
    """既にログイン中の自分とは別のuser_idに紐づいている外部アカウントを、
    今のセッションへ重ねて連携しようとした場合に送出する。"""

    def __init__(self, existing_user_id: str):
        self.existing_user_id = existing_user_id
        super().__init__("このアカウントは既に別の利用者として登録されています")


def get_or_create_user(
    *,
    provider: str,
    provider_user_id: str,
    email: str,
    display_name: str | None,
    link_user_id: str | None = None,
) -> str:
    """provider(google/outlook)のアカウントに紐づくuser_idを取得。

    - 既にその外部アカウント(provider_user_id)で連携済みなら、その時のuser_idをそのまま返す。
      link_user_idが指定されていてそれと食い違う場合は、別人の/別セッションのアカウントに
      既に連携済みという意味なのでIdentityLinkedToAnotherUserErrorを送出する
    - link_user_id（ログイン中のセッションからの連携操作）があれば、メールアドレスの
      一致に関わらずそのuser_idへ直接紐付ける。GoogleとOutlookで登録メールアドレスが
      異なる人は珍しくなく、メール一致だけに頼ると同一人物を正しく統合できないため、
      「今ログインしているアカウント」という明示的な情報を優先する（§10-4の実装手段）
    - link_user_idが無い（＝未ログイン状態からの連携＝通常のログイン）場合のみ、
      従来通りメールアドレス一致でユーザーを探す／無ければ新規作成する
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
        existing_user_id = identity.data[0]["user_id"]
        if link_user_id and link_user_id != existing_user_id:
            raise IdentityLinkedToAnotherUserError(existing_user_id)
        return existing_user_id

    if link_user_id:
        user_id = link_user_id
    else:
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


def parse_oauth_state(state: str | None) -> tuple[str, str | None]:
    """OAuthコールバックのstateパラメータから (リダイレクト先パス, 連携先user_id) を取り出す。
    stateは `"<target>"`（未ログイン状態からの通常ログイン）、または
    `"<target>|<セッショントークン>"`（ログイン中に「もう一方のカレンダーも連携する」操作）の
    いずれか。セッショントークンが有効であれば、その持ち主のuser_idへ連携する。
    """
    target, _, link_token = (state or "").partition("|")
    target_path = "/onboarding" if target == "onboarding" else "/settings"
    link_user_id = None
    if link_token:
        payload = decode_session_token(link_token)
        if payload:
            link_user_id = payload["sub"]
    return target_path, link_user_id


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


def unlink_provider(*, user_id: str, provider: str) -> None:
    """ユーザー自身の意思による「連携を解除する」操作。トークンだけでなく
    user_identitiesの紐付けごと外す。これを残したままだと、provider_user_idの
    一致によって次回ログイン時に同じuser_idへ戻ってきてしまい、「別のアカウントとして
    連携し直す」「別の人のアカウントへ付け替える」といったやり直しができない。
    calendar_connection_stateも消し、意図的な解除を「連携が壊れた」の通知対象に
    しないようにする。
    """
    sb = get_supabase()
    sb.table("oauth_tokens").delete().eq("user_id", user_id).eq("provider", provider).execute()
    sb.table("user_identities").delete().eq("user_id", user_id).eq("provider", provider).execute()
    sb.table("calendar_connection_state").delete().eq("user_id", user_id).eq("provider", provider).execute()


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
