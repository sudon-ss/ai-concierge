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
  updated_at timestamptz default now()
);

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
  kind text not null check (kind in ('reminder', 'briefing')),
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

create policy "own row only" on users for all using (auth.uid() = id);
create policy "own rows only" on user_identities for all using (auth.uid() = user_id);
create policy "own rows only" on oauth_tokens for all using (auth.uid() = user_id);
create policy "own rows only" on events for all using (auth.uid() = user_id);
create policy "own rows only" on tasks for all using (auth.uid() = user_id);
create policy "own rows only" on messages for all using (auth.uid() = user_id);
create policy "own row only" on user_settings for all using (auth.uid() = user_id);
create policy "own rows only" on push_subscriptions for all using (auth.uid() = user_id);
create policy "own rows only" on sent_notifications for all using (auth.uid() = user_id);
