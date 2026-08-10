from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    session_secret: str = "dev-only-change-me"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_redirect_uri: str = "http://localhost:8000/api/auth/outlook/callback"
    microsoft_tenant: str = "consumers"

    frontend_origin: str = "http://localhost:5173"

    # Web Push（リマインダー・朝のブリーフィングの配信）
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:support@example.com"

    # 配信ジョブのエンドポイントを外部Cronから叩くための共有シークレット。
    # 未設定のままだとジョブを誰でも起動できてしまうため、空なら実行を拒否する
    cron_secret: str = ""


settings = Settings()
