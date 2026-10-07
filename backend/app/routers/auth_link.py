from fastapi import APIRouter, Depends

from ..auth import create_link_token
from ..dependencies import get_current_user
from ..models import SessionUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/link-token")
def get_link_token(user: SessionUser = Depends(get_current_user)):
    """ログイン中のユーザーが、別プロバイダのカレンダーを自分のアカウントへ追加連携するための
    10分だけ有効な専用トークン。OAuthのstateに載せて往復させる（セッショントークンそのものを
    URLに載せると、Renderのログやブラウザ履歴に30日有効なトークンが残ってしまうため）。
    """
    return {"token": create_link_token(user.user_id)}
