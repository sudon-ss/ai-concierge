-- プッシュ通知（リマインダー・朝のブリーフィング）用の追加テーブル。
-- 既に稼働しているDBに対して、Supabase の SQL Editor でそのまま実行してください。
-- 何度実行しても同じ結果になるよう if not exists を付けています。

-- 通知設定。サーバー側の配信ジョブが参照するため端末ではなくDBに置く
create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  briefing_enabled boolean default true,
  briefing_time text default '07:00',      -- "HH:MM"（Asia/Tokyo）
  notification_enabled boolean default true,
  reminder_minutes int default 5,
  updated_at timestamptz default now()
);

-- Web Push の宛先。1ユーザーが複数端末を持つ想定で複数行を許す
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);

-- 同じ通知を二重に送らないための記録。
-- 送信前にここへ入れて、unique違反なら「既に送信済み」と判断する
create table if not exists sent_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'briefing')),
  dedup_key text not null,   -- reminder: 予定のext_id / briefing: YYYY-MM-DD
  sent_at timestamptz default now(),
  unique (user_id, kind, dedup_key)
);

alter table user_settings enable row level security;
alter table push_subscriptions enable row level security;
alter table sent_notifications enable row level security;

do $$ begin
  create policy "own row only" on user_settings for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own rows only" on push_subscriptions for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own rows only" on sent_notifications for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
