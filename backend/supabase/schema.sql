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
  -- 新規予定の登録先。NULLならselected_calendar_idsの先頭 or primary/既定カレンダー
  write_calendar_id text,
  updated_at timestamptz default now(),
  primary key (user_id, provider)
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

create policy "own row only" on users for all using (auth.uid() = id);
create policy "own rows only" on user_identities for all using (auth.uid() = user_id);
create policy "own rows only" on oauth_tokens for all using (auth.uid() = user_id);
create policy "own rows only" on events for all using (auth.uid() = user_id);
create policy "own rows only" on tasks for all using (auth.uid() = user_id);
create policy "own rows only" on messages for all using (auth.uid() = user_id);
