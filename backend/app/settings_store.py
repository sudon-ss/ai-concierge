"""通知設定の保存・取得。

これまで設定は端末の localStorage だけに持っていたが、サーバー側の配信ジョブが
「誰に何時に送るか」を知る必要があるためDBにも持たせる。
"""
from .database import get_supabase

DEFAULTS = {
    "briefing_enabled": True,
    "briefing_time": "07:00",
    "notification_enabled": True,
    "reminder_minutes": 5,
}


def get_settings(user_id: str) -> dict:
    res = (
        get_supabase()
        .table("user_settings")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return dict(DEFAULTS)
    row = res.data[0]
    return {k: row.get(k, v) for k, v in DEFAULTS.items()}


def save_settings(user_id: str, patch: dict) -> dict:
    """未設定の項目は既定値のまま残るよう、既存値とマージしてから保存する。"""
    merged = {**get_settings(user_id), **{k: v for k, v in patch.items() if v is not None}}
    get_supabase().table("user_settings").upsert(
        {"user_id": user_id, **merged}, on_conflict="user_id"
    ).execute()
    return merged


def list_users_with_push() -> list[dict]:
    """プッシュ購読がある全ユーザーの設定を返す。配信ジョブの起点。
    購読が無いユーザーに対して重いカレンダー取得を走らせないための絞り込みでもある。
    """
    sb = get_supabase()
    subs = sb.table("push_subscriptions").select("user_id").execute().data
    user_ids = sorted({s["user_id"] for s in subs})
    if not user_ids:
        return []

    rows = sb.table("user_settings").select("*").in_("user_id", user_ids).execute().data
    by_user = {r["user_id"]: r for r in rows}
    return [
        {"user_id": uid, **{k: by_user.get(uid, {}).get(k, v) for k, v in DEFAULTS.items()}}
        for uid in user_ids
    ]
