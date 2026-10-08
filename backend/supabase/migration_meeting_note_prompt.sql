-- 会議後のメモ促しPush（段階2）のための追加。Supabase の SQL Editor でそのまま実行してください。
-- 何度実行しても同じ結果になります。
--
-- ・user_settings: 「会議後にメモを促す通知」のオン/オフ（既定はオフ）
-- ・sent_notifications: 通知の種類に meeting_note（会議後メモ）を追加

alter table user_settings add column if not exists meeting_note_prompt_enabled boolean default false;

alter table sent_notifications drop constraint if exists sent_notifications_kind_check;
alter table sent_notifications
  add constraint sent_notifications_kind_check check (kind in ('reminder', 'briefing', 'meeting_note'));

notify pgrst, 'reload schema';
