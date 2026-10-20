-- 固定資産台帳（償却資産申告・別表十六用）。法人管理者のみ。何度実行しても安全。
create table if not exists public.acc_fixed_assets (
  id bigserial primary key,
  name text not null,                       -- 資産の名称等
  office text,                              -- 事業所（例: 城山、あさけヶ丘）
  location text,                            -- 所在（四日市市内の資産の所在地）
  asset_class text not null default '工具器具備品'
    check (asset_class in ('構築物','機械装置','船舶','航空機','車両運搬具','工具器具備品','建物','無形固定資産','繰延資産','土地','その他')),
  book_account_id integer references public.acc_accounts(id), -- 帳簿の勘定科目（別表十六の突き合わせ用）
  acquired_on date not null,                -- 取得日（事業の用に供した日）
  cost integer not null check (cost >= 0),  -- 取得価額（数量分の合計・圧縮記帳前）
  quantity integer not null default 1 check (quantity >= 1),
  life_years integer check (life_years between 2 and 100),  -- 耐用年数
  dep_method text not null default '定額法'
    check (dep_method in ('定額法','定率法','一括償却(3年均等)','少額一時損金(10万円未満)','少額特例(30万円未満)','償却しない')),
  exclude_reason text check (exclude_reason in ('自動車税・軽自動車税の対象','その他')),  -- 償却資産申告の対象外にする理由
  disposed_on date,                         -- 除却・売却・滅失日
  disposal_kind text check (disposal_kind in ('売却','滅失','移動','その他')),
  needs_review boolean not null default false,
  review_note text,
  source text not null default '手入力',     -- freee / 手入力
  memo text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index if not exists acc_fixed_assets_acq on public.acc_fixed_assets(acquired_on);
alter table public.acc_fixed_assets enable row level security;
drop policy if exists acc_fixed_assets_admin on public.acc_fixed_assets;
create policy acc_fixed_assets_admin on public.acc_fixed_assets for all to authenticated using (public.acc_is_admin()) with check (public.acc_is_admin());
revoke all on public.acc_fixed_assets from anon;
grant select, insert, update, delete on public.acc_fixed_assets to authenticated;
grant usage, select on sequence public.acc_fixed_assets_id_seq to authenticated;
