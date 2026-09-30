from fastapi import APIRouter, Depends

from ..auth import create_link_token
from ..dependencies import get_current_user
from ..models import SessionUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/link-token")
def get_link_token(user: SessionUser = Depends(get_current_user)):
    """既にログイン中のユーザーが、別プロバイダのカレンダーを自分のアカウントに
    追加連携する際に使う、短期間だけ有効なリンク用トークン。
    Google/OutlookのOAuth stateパラメータに載せて往復させるため、30日間有効な
    セッショントークンそのものをURLに晒さないよう、10分だけ有効な専用トークンを発行する。
    """
    return {"token": create_link_token(user.user_id)}
