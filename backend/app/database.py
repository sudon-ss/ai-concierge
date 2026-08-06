from functools import lru_cache

from supabase import Client, create_client

from .config import settings


@lru_cache
def get_supabase() -> Client:
    # service_role キーを使うためRLSはバイパスされる。
    # user_id によるデータ分離はアプリケーション層（各クエリで .eq("user_id", ...) を必須にする）で担保する。
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
