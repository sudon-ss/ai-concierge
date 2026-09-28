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
    # 業務時間外ブロック（§UC-新: 空き時間提案から土日・深夜をデフォルトで除外する設定）。
    # 接待・会食等の正当な業務利用を弾かないよう、ここではDBに希望値を保存するだけに留め、
    # 実際の適用（明示的な依頼なら無視する等の判断）はchat.pyのシステムプロンプト経由で
    # AIに委ねる（get_free_slots側でハードに弾くと、100%締め出してしまい柔軟性が失われるため）
    "blocking_enabled": True,
    "blocked_weekdays": ["sat", "sun"],
    "blocked_start_hour": 22,
    "blocked_end_hour": 8,
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
