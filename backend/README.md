# THE CONCIERGE バックエンド（Phase 1 MVP）

FastAPI + Anthropic API直叩き構成（Dify無し・v3.0スタイル）。マルチユーザー対応済み（§10-4）。

## セットアップ

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows
pip install -r requirements.txt
cp .env.example .env     # 中身を下記の手順で埋める
```

## 1. Anthropic API Key

1. https://console.anthropic.com にログイン
2. API Keys → Create Key
3. `.env` の `ANTHROPIC_API_KEY` に貼り付け

## 2. Supabase プロジェクト

1. https://supabase.com で新規プロジェクト作成
2. Project Settings → API から `Project URL` と `service_role` キー（**anon keyではない**）を取得
3. `.env` の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` に貼り付け
4. SQL Editor で `supabase/schema.sql` の内容を実行（テーブル・RLSポリシー一式が作成される）

## 3. セッション署名用シークレット

```bash
openssl rand -hex 32
```
の出力を `.env` の `SESSION_SECRET` に貼り付け（自前JWTセッションの署名鍵）

## 4. Google OAuth クライアント（Calendar連携用）

1. https://console.cloud.google.com でプロジェクト作成
2. 「APIとサービス」→「ライブラリ」→ Google Calendar API を有効化
3. 「APIとサービス」→「OAuth同意画面」
   - User Type: 外部
   - アプリ名・サポートメール・ロゴを入力
   - スコープに `calendar.events`, `calendar.readonly` を追加
   - **テストユーザーに開発チーム4名のメールアドレスを追加**（ここまでは審査不要で動作します）
4. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みのリダイレクトURI: `http://localhost:8000/api/auth/google/callback`（本番は実URLに変更）
5. `.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` に貼り付け

## 5. Microsoft Azure アプリ登録（Outlook連携用）

1. https://portal.azure.com → 「Azure Active Directory」→「アプリの登録」→「新規登録」
   - サポートされているアカウントの種類: 「個人のMicrosoftアカウントのみ」を推奨（審査不要で即動作）
   - リダイレクトURI: `http://localhost:8000/api/auth/outlook/callback`
2. 「証明書とシークレット」→ 新しいクライアントシークレットを作成
3. 「APIのアクセス許可」→ Microsoft Graph → `Calendars.ReadWrite`, `offline_access`, `User.Read` を追加
4. `.env` の `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` に貼り付け（`MICROSOFT_TENANT` は個人アカウントのみなら `consumers` のまま）

## 起動

```bash
uvicorn main:app --reload --port 8000
```

`http://localhost:8000/docs` でAPIドキュメント（Swagger UI）が確認できます。

## フロントエンド側の設定

`ai-concierge/.env` に以下を追加してPWAを再起動すると、バックエンドに接続されます（未設定ならPhase 0のローカルデモモードのまま動作）。

```
VITE_API_BASE_URL=http://localhost:8000
```

## 既知の制約（次のタスク）

- `ChatPage` の空き枠提案・承認カードUIはまだPhase 0のローカルロジックのまま。実バックエンドの `get_free_slots`/`create_event` の結果をそのUIに流し込む配線は未実装（現状は実バックエンド接続時、テキストの会話のみ実働）
- セッションはURLクエリ経由でJWTをフロントに渡す簡易方式。本番前にhttpOnly Cookie化などのハードニングを推奨
- Supabaseの`oauth_tokens`テーブルの暗号化（列レベル暗号化 or Vault）は未実装。ドッグフーディング段階では許容範囲だが一般公開前に対応すること
