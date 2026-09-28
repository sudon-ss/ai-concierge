-- 業務時間外ブロック設定の追加。既に稼働しているDBに対して、Supabase の SQL Editor で
-- そのまま実行してください。何度実行しても同じ結果になるよう if not exists を付けています。
--
-- 空き時間提案からデフォルトで除外する曜日・時間帯（土日、22時〜翌8時等）をユーザーごとに
-- 保存する。ただし実際の適用（接待・会食など明示的な依頼では無視する等の判断）はDB側では
-- 行わず、chat.pyのシステムプロンプト経由でAIに委ねる（ソフトな優先度付けのため）。

alter table user_settings add column if not exists blocking_enabled boolean default true;
alter table user_settings add column if not exists blocked_weekdays text[] default array['sat', 'sun'];
alter table user_settings add column if not exists blocked_start_hour int default 22;
alter table user_settings add column if not exists blocked_end_hour int default 8;
