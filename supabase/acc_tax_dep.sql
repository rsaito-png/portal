-- 税法上の償却方法（帳簿と別に持つ）・償却超過の反映開始期・一括償却資産の内訳（堤会計 2026-10-17 回答）
alter table acc_fixed_assets add column if not exists tax_dep_method text;
alter table acc_fixed_assets add column if not exists tax_life_years int;
alter table acc_fixed_assets add column if not exists tax_adj_from_fy int;
alter table acc_fixed_assets add column if not exists tax_adj_rule text;
alter table acc_fixed_assets add column if not exists tax_parts jsonb;
alter table acc_fixed_assets add column if not exists tax_note text;
update acc_fixed_assets set tax_dep_method='定額法', tax_life_years=10, tax_adj_from_fy=2025, tax_adj_rule='xlsx',
  tax_note='附属設備は税法上定額法のみ（償却率0.100）。台帳（帳簿）は定率法のまま。過年度分を含む過大償却232,383円を第5期の別表四で加算（堤会計「償却超過.xlsx」、2026-10-17）' where id=1;
update acc_fixed_assets set tax_parts='[{"name":"レガシィ（2025年5月取得・前期分）","cost":150000,"fy0":2024,"limit":{"2024":50000,"2025":50000,"2026":50000},"book":{"2025":50000,"2026":0},"note":"5万円ずつ（堤会計）"},{"name":"モコ（2023年5月30日取得）","cost":180000,"fy0":2022,"limit":{"2022":60000,"2023":60000,"2024":60000},"book":{"2025":60000},"resolved":[2025],"note":"税務は第2〜4期で償却済み。freeeは1年遅れで第5期に6万円を計上、第5期で差は解消（堤会計）"}]'::jsonb,
  tax_note='別表十六(六): 前期分150,000円（レガシィ）50,000円。第5期帳簿110,000円のうち60,000円はモコの遅れ分' where id=18;
