-- カレンダー連携切れ通知の追加。既に稼働しているDBに対して、Supabase の SQL Editor で
-- そのまま実行してください。何度実行しても同じ結果になるよう if not exists を付けています。
--
-- oauth_tokensは連携解除時（トークン失効等）に行ごと削除されるため、それだけでは
-- 「一度も連携していない」ユーザーと「連携が壊れて切れた」ユーザーを区別できない。
-- 後者にだけChat/Home/Schedule画面で再連携を促す通知を出すための状態を保持する。

create table if not exists calendar_connection_state (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  ever_connected boolean not null default false,
  broken_since timestamptz,
  dismissed boolean not null default false,
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);

alter table calendar_connection_state enable row level security;

do $$ begin
  create policy "own rows only" on calendar_connection_state for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
