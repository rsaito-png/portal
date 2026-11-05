-- 税カレンダー（会長指示 2026-11-05）。Driveの税務カレンダーシートからワンショット移植。再実行可。
-- 見られる・済を付けられる：会長(is_chair)と法人管理者(bp_is_corp_admin＝事務含む)。
create table if not exists public.tax_calendar (
  id bigserial primary key,
  due_date date not null,
  title text not null,
  assignee text,
  agency text,
  note text,
  kind text not null default 'other' check (kind in ('monthly_tax','annual','other')),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (due_date, title)
);
alter table public.tax_calendar enable row level security;
drop policy if exists tax_calendar_sel on public.tax_calendar;
drop policy if exists tax_calendar_upd on public.tax_calendar;
drop policy if exists tax_calendar_ins on public.tax_calendar;
create policy tax_calendar_sel on public.tax_calendar for select to authenticated using (public.is_chair() or public.bp_is_corp_admin());
create policy tax_calendar_upd on public.tax_calendar for update to authenticated using (public.is_chair() or public.bp_is_corp_admin()) with check (public.is_chair() or public.bp_is_corp_admin());
create policy tax_calendar_ins on public.tax_calendar for insert to authenticated with check (public.is_chair() or public.bp_is_corp_admin());
grant select, insert, update on public.tax_calendar to authenticated;
grant usage on sequence public.tax_calendar_id_seq to authenticated;

insert into public.tax_calendar (due_date,title,assignee,agency,note,kind,done) values
('2026-10-13','源泉所得税・住民税（特別徴収）9月分の納付','堤さん','四日市税務署／各市町村','本来10/10→10/13（履歴）','monthly_tax',true),
('2026-11-10','源泉所得税・住民税（特別徴収）10月分の納付','齊藤連（納付）','四日市税務署／各市町村','準備はGrok Bot（宮本さん休職中）','monthly_tax',false),
('2026-11-30','契約終了の申し入れメールを堤さんへ送る（1/31に合意解約）','齊藤連（送信）','顧問税理士（堤会計）','下書き済み','other',false),
('2026-11-30','年末調整の書類を全員から回収（社内目標）','Grok Bot（準備）＋齊藤連','社内','扶養等申告書ほか','annual',false),
('2026-12-10','源泉所得税・住民税（特別徴収）11月分の納付','齊藤連（納付）','四日市税務署／各市町村','準備はGrok Bot','monthly_tax',false),
('2026-12-15','年末調整の精算（12月給与）','Grok Bot（準備）＋齊藤連','社内','12月給与で過不足精算','annual',false),
('2026-12-18','消費税の免税判定（特定期間）','Grok Bot（準備）＋齊藤連','freee','','annual',false),
('2027-01-08','中間申告のやり方を決める','齊藤連','—','','annual',false),
('2027-01-12','源泉所得税・住民税（特別徴収）12月分の納付','齊藤連（納付）','四日市税務署／各市町村','1/10日・1/11成人の日→1/12。防衛特別所得税。準備はGrok Bot','monthly_tax',false),
('2027-01-15','堤さんの帳簿直しの仕上がりをfreeeで確認','Grok Bot（準備）＋齊藤連','freee','','other',false),
('2027-01-22','堤さんから引き継ぎ資料を受け取る','齊藤連','顧問税理士','（元：宮本さん・休職中）','other',false),
('2027-01-22','e-Tax・eLTAXログイン確認','Grok Bot（準備）＋齊藤連','e-Tax／eLTAX','','other',false),
('2027-01-29','源泉徴収票の作成・全員に交付','Grok Bot（準備）＋齊藤連（交付）','本人','期限2/1','annual',false),
('2027-01-29','法定調書合計表等の提出','Grok Bot（準備）＋齊藤連（提出）','四日市税務署（e-Tax）','期限2/1','annual',false),
('2027-01-29','給与支払報告書の提出','Grok Bot（準備）＋齊藤連（提出）','各市町村（eLTAX）','期限2/1','annual',false),
('2027-01-29','中間申告書の作成・提出','Grok Bot（準備）＋齊藤連（提出）','税務署／県／市','期限2/1。防衛特別法人税の中間は今期不要','annual',false),
('2027-01-31','税務代理権限取り下げ・freee税理士削除・送付先変更','Grok Bot（準備）＋齊藤連','税務署等','契約終了日','other',false),
('2027-02-01','中間申告の納付（法人税・地方法人税）','齊藤連（納付）','四日市税務署','','annual',false),
('2027-02-01','中間申告の納付（県・市）','齊藤連（納付）','県税事務所／市役所','','annual',false),
('2027-02-01','償却資産申告','Grok Bot（準備）＋齊藤連（提出）','四日市市役所 資産税課','','annual',false),
('2027-02-10','源泉所得税・住民税 1月分の納付','齊藤連（納付）','税務署／市町村','準備はGrok Bot','monthly_tax',false),
('2027-03-10','源泉所得税・住民税 2月分の納付','齊藤連（納付）','税務署／市町村','準備はGrok Bot','monthly_tax',false),
('2027-04-12','源泉所得税・住民税 3月分の納付','齊藤連（納付）','税務署／市町村','4/10土→4/12。準備はGrok Bot','monthly_tax',false),
('2027-04-30','決算準備：固定資産・借入・未決済整理','Grok Bot（準備）＋齊藤連','freee','（元：Grok Bot・宮本さん）','annual',false),
('2027-05-10','源泉所得税・住民税 4月分の納付','齊藤連（納付）','税務署／市町村','準備はGrok Bot','monthly_tax',false),
('2027-05-31','決算日：現金・預金・未払未収','齊藤連','社内','（元：宮本さん・齊藤連）','annual',false),
('2027-06-10','源泉所得税・住民税 5月分の納付','齊藤連（納付）','税務署／市町村','準備はGrok Bot','monthly_tax',false),
('2027-07-12','労働保険の年度更新','Grok Bot（準備）＋齊藤連（提出）','労働局','6/1〜。7/10土→7/12（元：宮本さん）','annual',false),
('2027-07-12','社会保険の算定基礎届','Grok Bot（準備）＋齊藤連（提出）','年金事務所','7/1〜（元：宮本さん）','annual',false),
('2027-07-12','源泉所得税・住民税 6月分の納付','齊藤連（納付）','税務署／市町村','準備はGrok Bot','monthly_tax',false),
('2027-07-16','国保連4・5月分の未収確定','Grok Bot（準備）＋齊藤連','freee','（元：宮本さん）','annual',false),
('2027-07-30','社員総会で決算承認','齊藤連','社内','','annual',false),
('2027-08-02','確定申告・納付（国税：法人税・地方法人税・防衛特別法人税）','Grok Bot（作成）＋齊藤連（送信・納付）','四日市税務署','7/31土→8/2。0円でも防衛特別法人税申告','annual',false),
('2027-08-02','確定申告・納付（県・市）','Grok Bot（作成）＋齊藤連（送信・納付）','県税事務所／市役所','','annual',false)
on conflict (due_date,title) do update set assignee=excluded.assignee, agency=excluded.agency, note=excluded.note, kind=excluded.kind, updated_at=now();
