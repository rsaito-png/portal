-- 茶夢の利用者初期データ。日誌シート「利用者マスタ」と同じ3人。
-- アプリは自動では実行しない。管理者が Supabase の SQL Editor でこのファイルを実行する。
-- 画面「利用者」から同じ項目を入れてもよい。再実行しても氏名が同じ行は上書きしない。
-- 受給者証番号をリポジトリに残したくない場合は、このファイルを実行せず画面から登録する。

insert into public.chamu_users (
  name, kana, sort, recipient_no, city_no, support_level,
  cap_management, cap_amount, decision_code, contract_days,
  contract_start, contract_end, service_start, provider_entry_no,
  meal_addon, transport_class, active
) values
  ('日置広大', 'ヒオキコウダイ', 1, '0000222844', '242012', 4, '無', 0, '221000', '原則', '2026-03-01', '2027-07-31', '2026-03-02', '1', true, '2', true),
  ('柘山周磨', 'ツゲヤマシュウマ', 2, '0000072215', '242024', 3, '無', 0, '221000', '原則', '2026-03-01', '2027-09-30', '2026-03-02', '1', true, '2', true),
  ('森井辰生', 'モリイタツオ', 3, '0000075499', '242024', 3, '無', 0, '221000', '8', '2026-03-01', '2028-03-31', '2026-03-02', '1', true, '2', true)
on conflict (name) do nothing;
