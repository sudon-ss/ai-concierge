import logging
import time
from functools import lru_cache

import httpx
from postgrest.utils import SyncClient
from supabase import Client, create_client

from .config import settings

logger = logging.getLogger("concierge.db")

# 再試行してよいのは「何回実行しても結果が変わらない」リクエストだけ。
# 新規登録(POST)は、通信エラーで応答が読めなかっただけで実は処理済み、という場合に
# 二重登録になりうるため再試行しない。
_RETRYABLE_METHODS = {"GET", "HEAD", "PUT", "PATCH", "DELETE"}
_RETRYABLE_ERRORS = (httpx.ReadError, httpx.RemoteProtocolError, httpx.ConnectError, httpx.ConnectTimeout)
_MAX_ATTEMPTS = 3


class _RetryingClient(SyncClient):
    """Supabaseへの通信が一時的に失敗したとき、自動で数回やり直すHTTPクライアント。"""

    def send(self, request, **kwargs):  # type: ignore[override]
        attempts = _MAX_ATTEMPTS if request.method in _RETRYABLE_METHODS else 1
        for attempt in range(1, attempts + 1):
            try:
                return super().send(request, **kwargs)
            except _RETRYABLE_ERRORS as exc:
                if attempt == attempts:
                    raise
                logger.warning(
                    "Supabase通信エラーのため再試行します (%d/%d): %s", attempt, attempts, type(exc).__name__
                )
                time.sleep(0.15 * attempt)


@lru_cache
def get_supabase() -> Client:
    # service_role キーを使うためRLSはバイパスされる。
    # user_id によるデータ分離はアプリケーション層（各クエリで .eq("user_id", ...) を必須にする）で担保する。
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # supabase-pyの既定は、HTTP/2の「1本の接続を複数のリクエストが同時に使い回す」構成。
    # FastAPIの同期エンドポイントはスレッドで並列に動くため、画面を開いた瞬間に複数のAPIが
    # 同時にDBを叩くと `ReadError: [Errno 11] Resource temporarily unavailable` が起きて
    # 500エラーになっていた（連携通知APIが落ち、再連携のバナーが出ない原因にもなった）。
    # HTTP/1.1の接続プール（並列リクエストごとに別の接続）へ切り替え、念のため再試行も付ける。
    old = client.postgrest.session
    client.postgrest.session = _RetryingClient(
        base_url=old.base_url,
        headers=old.headers,
        timeout=old.timeout,
        follow_redirects=True,
        http2=False,
        limits=httpx.Limits(max_connections=30, max_keepalive_connections=10, keepalive_expiry=20),
    )
    old.close()
    return client
