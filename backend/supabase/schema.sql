-- THE CONCIERGE / Phase 1 MVP スキーマ（§16・§10-4準拠）
-- Supabase の SQL Editor でそのまま実行してください。

create extension if not exists pgcrypto;

-- users: 秘書アプリ内部のユーザー識別子
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  created_at timestamptz default now()
);

-- user_identities: Google/Outlookなど複数プロバイダを同一user_idに統合する（§10-4）
create table user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  provider_user_id text not null,
  created_at timestamptz default now(),
  unique (provider, provider_user_id)
);

-- oauth_tokens: カレンダーAPI呼び出し用トークン。ユーザー×プロバイダごとに1件（§10-4）
create table oauth_tokens (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  access_token text not null,
  refresh_token text,
  expires_at bigint not null,
  -- 1アカウント内に複数カレンダーがある場合の設定（最大3件まで空き時間チェック対象にできる）
  selected_calendar_ids text[],
  -- 新規予定の登録先（最大3件まで、選んだ全カレンダーに同時登録する）。空/NULLならprimary/既定カレンダー
  write_calendar_ids text[],
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);

-- user_settings: 通知設定。サーバー側の配信ジョブが参照するため端末ではなくDBに置く
create table user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  briefing_enabled boolean default true,
  briefing_time text default '07:00',      -- "HH:MM"（Asia/Tokyo）
  notification_enabled boolean default true,
  reminder_minutes int default 5,
  -- 業務時間外ブロック。空き時間提案でデフォルト除外する曜日・時間帯（AI側でソフトに適用、§UC-新）
  blocking_enabled boolean default true,
  blocked_weekdays text[] default array['sat', 'sun'],
  blocked_start_hour int default 22,       -- 0-23時。開始>終了で日をまたぐ（22時〜翌8時等）
  blocked_end_hour int default 8,
  meeting_note_prompt_enabled boolean default false,  -- 会議後にメモを促すPush（既定オフ）
  updated_at timestamptz default now()
);

-- calendar_connection_state: カレンダー連携が壊れた場合にChat/Home/Schedule画面へ
-- 再連携を促す通知を出すための状態管理。oauth_tokensは連携解除時に行ごと削除されるため、
-- 「一度も連携していない」ユーザーと「連携が壊れて切れた」ユーザーを区別できるよう独立させている
create table calendar_connection_state (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  ever_connected boolean not null default false,
  broken_since timestamptz,             -- NULLでなければ再連携が必要（dismissedがtrueでなければ通知対象）
  dismissed boolean not null default false,  -- 「もう使わないので通知不要」という意思表示
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);

-- event_notes: 会議メモ（カレンダーの予定に紐付くメモ）。1つの予定に1つのメモ。予定の識別情報（event_refs）で
-- 紐付けるため、日時を変更してもメモは付いてくる。自動では削除しない（利用者が個別に削除する）
create table event_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_refs text[] not null default '{}',   -- "google:<予定ID>" "outlook:<予定ID>"
  series_key text,                           -- 繰り返し予定のシリーズID（Google recurringEventId / Outlook seriesMasterId）
  event_title text not null,
  title_key text not null,                   -- 件名の正規化（同名の会議をつなぐ用）
  event_start timestamptz not null,
  event_end timestamptz,
  body text not null default '',
  priority text not null default 'normal' check (priority in ('normal', 'high', 'critical')),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_notes_user_start_idx on event_notes (user_id, event_start desc);
create index event_notes_user_series_idx on event_notes (user_id, series_key);
create index event_notes_user_title_idx on event_notes (user_id, title_key);
create index event_notes_refs_idx on event_notes using gin (event_refs);
alter table event_notes enable row level security;
create policy "own rows only" on event_notes for all using (auth.uid() = user_id);

-- push_subscriptions: Web Push の宛先。1ユーザーが複数端末を持つ想定で複数行を許す
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index idx_push_subscriptions_user on push_subscriptions (user_id);

-- sent_notifications: 同じ通知を二重に送らないための記録。
-- 送信前にここへ入れて、unique違反なら「既に誰かが送った」と判断する（多重起動対策）
create table sent_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'briefing', 'meeting_note')),
  dedup_key text not null,   -- reminder: 予定のext_id / briefing: YYYY-MM-DD
  sent_at timestamptz default now(),
  unique (user_id, kind, dedup_key)
);

-- events: 予定キャッシュ（§16-1）
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  calendar text not null check (calendar in ('google', 'outlook')),
  ext_id text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  memo text,
  memo_priority text default 'normal' check (memo_priority in ('normal', 'high', 'critical')),
  memo_flagged boolean default false,
  synced_at timestamptz default now(),
  created_at timestamptz default now()
);

-- tasks: タスク管理（§16-2）
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  due_date date,
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  done boolean default false,
  created_at timestamptz default now()
);

-- messages: 会話履歴バックアップ（§16-3）
create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);
create index idx_messages_user_created on messages (user_id, created_at desc);

-- ============================================================
-- Row Level Security（§10-4要件・§22チェックリスト）
-- 注意: バックエンドは service_role キーで接続するためRLSは実質バイパスされる。
-- 現時点でのユーザー分離は「全クエリに .eq("user_id", ...) を必須にする」
-- アプリケーション層で担保している（app/routers 配下を参照）。
-- 以下のポリシーは、将来フロントから直接Supabaseを叩く経路や
-- Supabase Auth移行を行う際にすぐ機能するよう先に用意している保険。
-- ============================================================

alter table users enable row level security;
alter table user_identities enable row level security;
alter table oauth_tokens enable row level security;
alter table events enable row level security;
alter table tasks enable row level security;
alter table messages enable row level security;
alter table user_settings enable row level security;
alter table push_subscriptions enable row level security;
alter table sent_notifications enable row level security;
alter table calendar_connection_state enable row level security;

create policy "own row only" on users for all using (auth.uid() = id);
create policy "own rows only" on user_identities for all using (auth.uid() = user_id);
create policy "own rows only" on oauth_tokens for all using (auth.uid() = user_id);
create policy "own rows only" on events for all using (auth.uid() = user_id);
create policy "own rows only" on tasks for all using (auth.uid() = user_id);
create policy "own rows only" on messages for all using (auth.uid() = user_id);
create policy "own row only" on user_settings for all using (auth.uid() = user_id);
create policy "own rows only" on push_subscriptions for all using (auth.uid() = user_id);
create policy "own rows only" on sent_notifications for all using (auth.uid() = user_id);
create policy "own rows only" on calendar_connection_state for all using (auth.uid() = user_id);
