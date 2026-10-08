-- 会議メモ（カレンダーの予定に紐付くメモ）の追加。既に稼働しているDBに対して、Supabase の
-- SQL Editor でそのまま実行してください。何度実行しても同じ結果になるよう if not exists を付けています。
--
-- ・1つの予定に1つのメモ（追記・編集できる）。予定の識別情報（event_refs）で紐付けるため、
--   予定の日時を変更してもメモは付いてくる。
-- ・同じ会議が GoogleとOutlook の両方にある場合は、event_refs に両方のIDが入る。
-- ・series_key は、繰り返し予定（定例会など）のシリーズID。Googleの recurringEventId /
--   Outlookの seriesMasterId。title_key は、件名を正規化したもの（毎回手で作る同名の会議をつなぐ用）。
-- ・自動では削除しない。利用者が個別に削除する。

create table if not exists event_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_refs text[] not null default '{}',   -- "google:<予定ID>" "outlook:<予定ID>"（同じ会議が複数カレンダーにあれば複数）
  series_key text,                           -- 繰り返し予定のシリーズID（あれば）
  event_title text not null,
  title_key text not null,                   -- 件名の正規化（空白除去・小文字・［仮］除去）
  event_start timestamptz not null,
  event_end timestamptz,
  body text not null default '',
  priority text not null default 'normal' check (priority in ('normal', 'high', 'critical')),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_notes_user_start_idx on event_notes (user_id, event_start desc);
create index if not exists event_notes_user_series_idx on event_notes (user_id, series_key);
create index if not exists event_notes_user_title_idx on event_notes (user_id, title_key);
create index if not exists event_notes_refs_idx on event_notes using gin (event_refs);

alter table event_notes enable row level security;

do $$ begin
  create policy "own rows only" on event_notes for all using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- PostgRESTに新しいテーブルを認識させる（通常は自動だが、念のため）
notify pgrst, 'reload schema';
