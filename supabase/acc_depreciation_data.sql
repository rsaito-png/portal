-- 固定資産台帳の償却条件（freeeの試算表から逆算。会計士の入力が正）。冪等（名前で上書き）。
update acc_fixed_assets set life_years=10, dep_method='定率法', dep_status='確定', needs_review=false,
  dep_basis='freee試算表 附属設備の償却費 第1期17,050/第2期64,790/第3期51,832/第4期41,465 を10年定率法(償却率0.200・月割)で全期とも再現。5期首の帳簿価額165,863円とも一致。5期33,172円・6期26,538円。',
  review_note='耐用年数は10年(定率法)に確定。所在・施工内容は要確認', updated_at=now() where id=1;
update acc_fixed_assets set life_years=3, dep_method='定額法', dep_status='要確認',
  dep_basis='第1期の償却費21,125円は3年定額(償却率0.334・3か月)でのみ再現。ただし第2期以降の工具器具備品の合計は2資産では説明できず、5〜6期は「差額調整」行で実績に合わせている。' where id=2;
update acc_fixed_assets set dep_calc=false, dep_status='要確認',
  dep_basis='20万円未満の3年一括。第3期までに償却済みで5期以降の償却なし(freeeの一括償却資産の動きから)。個別の償却額は確定できない。' where id=3;
update acc_fixed_assets set dep_calc=false, dep_status='要確認',
  dep_basis='freeeでは第4期末(2025-05-31)の残高整理仕訳で附属設備から他科目へ振替済みと推定(附属設備の償却は資産1だけで再現できるため、本資産は附属設備では償却されていない)。振替先・耐用年数が不明のため償却計算から除外。' where id=4;
update acc_fixed_assets set life_years=5, dep_method='定額法', dep_status='要確認',
  dep_basis='摘要がなく確定できない。5年定額と仮定。5〜6期の工具器具備品の不足分は「差額調整」行で実績に合わせている。' where id=5;
update acc_fixed_assets set book_account_id=72, life_years=5, dep_method='定率法', dep_status='確定', needs_review=false, dept_alloc='{"11":1}',
  dep_basis='第5期の減価償却費の部門配賦「第一寮 81,254円」が、この資産を5年定率法(償却率0.400・月割・2023-11取得)で計算した5期の償却費81,254円と1円まで一致。帳簿科目は工具器具備品(附属設備の償却には含まれていない)。6期48,752円。' where id=6;
update acc_fixed_assets set life_years=10, dep_method='定率法', dep_status='要確認',
  dep_basis='附属設備の5〜6期の償却合計(資産1を除く220,320円/222,954円)は、3資産とも10年定率法とすると219,517円/225,045円と近いが一致しない(差は差額調整行)。個別の耐用年数は確定できない。第5期の部門配賦「Asia 54,037円」はこの資産のものと仮置き。', dept_amt='{"2025":{"1":54037}}' where id=7;
update acc_fixed_assets set life_years=8, dep_method='定率法', dep_status='要確認',
  dep_basis='工具器具備品の5〜6期の償却から資産6(81,254/48,752円)を除いた残りが、8年定率法(125,000/93,750円)＋年22,981円の定額、と同額になる組合せのため8年定率と推定。美術品は税法上、償却対象外の可能性あり(別表十六)。' where id=8;
update acc_fixed_assets set life_years=10, dep_method='定率法', dep_status='要確認',
  dep_basis='資産7と同じ。10年定率法と仮置き。' where id in (9,10);
update acc_fixed_assets set life_years=2, dep_method='定率法', dep_status='確定', needs_review=false,
  dep_basis='車両運搬具の第2期償却費446,666円=266,666円(この車: 2年定率・償却率1.000・8か月)+180,000円(資産12)。第3期に残り133,333円を償却(帳簿に備忘価額1円)。中古車の簡便法による2年。' where id=11;
update acc_fixed_assets set cost=180000, acquired_on='2023-05-30', life_years=null, dep_method='少額特例(30万円未満)', dep_status='確定', needs_review=false,
  name='車両 モコ（軽自動車）', review_note=null,
  dep_basis='第2期の車両運搬具償却費446,666円のうち180,000円(全額)＝30万円未満の少額減価償却資産の特例として取得年に全額償却。修理30,000円は別行(資産ID下記)。' where id=12;
update acc_fixed_assets set life_years=6, dep_method='定率法', dep_status='要確認',
  dep_basis='3,428,470円。第3期806,631円・第4期873,066円は freee試算表から逆算した実績(override)を使い、5期以降は6年定率法(償却率0.333)で継続。第3期の償却806,631円は6年定率法の月割(761,120円)と合わず、取得価額の内訳(頭金・ローン)か耐用年数が未確定。',
  dep_override='{"2023":806631,"2024":873066}' where id=13;
insert into acc_fixed_assets (name, asset_class, book_account_id, acquired_on, cost, quantity, life_years, dep_method, exclude_reason, needs_review, review_note, source, dep_status, dep_basis)
select * from (values
 ('車両 モコ 修理（資産計上）','車両運搬具',177,date '2023-06-11',30000,1,null::int,'少額特例(30万円未満)','自動車税・軽自動車税の対象',false,null,'freee','確定','第3期の車両運搬具償却費969,964円=133,333(資産11)+30,000(この修理・取得年に全額)+806,631(資産13)。'),
 ('車両運搬具（第4期末の残高整理で振替・内訳不明）','車両運搬具',177,date '2024-06-01',310410,1,6,'定率法','自動車税・軽自動車税の対象',true,'振替元・車種・取得日が不明。取得日は仮置き','freee','要確認','第4期末(2025-05-31)の残高整理仕訳で車両運搬具に310,410円が振替。第4期の償却976,349円−資産13の873,066円=103,283円をこの資産の第4期償却(実績)とし、以降6年定率法。'),
 ('一括償却資産（3年・第3期取得分）','工具器具備品',7,date '2023-06-01',329999,1,3,'一括償却(3年均等)',null,true,'取得日は第3期内の仮置き。内訳(品名・取得日)を確認','freee','確定','一括償却資産の5期首残高110,000円・5期の償却110,000円が、3年均等の最終年と一致。第3期99,320円・第4期120,679円は試算表の実績。取得は第4期末の残高整理(329,999円)。')
) v(name,asset_class,book_account_id,acquired_on,cost,quantity,life_years,dep_method,exclude_reason,needs_review,review_note,source,dep_status,dep_basis)
where not exists (select 1 from acc_fixed_assets f where f.name = v.name);
update acc_fixed_assets set dep_override='{"2024":103283}' where name like '車両運搬具（第4期末の残高整理%';
update acc_fixed_assets set dep_override='{"2023":99320,"2024":120679}' where name='一括償却資産（3年・第3期取得分）';
-- freee実績との差額調整行（個別資産では説明できない分。要確認。5・6期のみ）
insert into acc_fixed_assets (name, asset_class, book_account_id, acquired_on, cost, quantity, dep_method, needs_review, review_note, source, dep_status, dep_basis, is_adjust, dep_override, exclude_reason)
select * from (values
 ('【差額調整】附属設備（freee実績との差）','構築物',193,date '2025-06-01',0,1,'償却しない',true,'個別の耐用年数を確定すれば消える','freee','要確認','資産7・9・10を10年定率法とした計算と、freeeの5・6期の附属設備償却(253,492円・249,492円)との差。','true'::boolean,'{"2025":803,"2026":-2091}'::jsonb,'その他'),
 ('【差額調整】工具器具備品（freee実績との差）','工具器具備品',72,date '2025-06-01',0,1,'償却しない',true,'資産2・5の耐用年数・償却方法を確定すれば消える','freee','要確認','工具器具備品の5・6期の償却(229,235円・165,483円)と、資産6・8・5の計算との差(年2,081円)。','true'::boolean,'{"2025":2081,"2026":2081}'::jsonb,'その他'),
 ('【差額調整】車両運搬具（freee実績との差）','車両運搬具',177,date '2025-06-01',0,1,'償却しない',true,'第3・4期の償却の内訳を確認すれば消える','freee','要確認','車両運搬具の5・6期の償却(651,224円・434,367円)との差(90円・59円)。freeeは0.333×期首簿価より毎期ほぼ90円少ない。','true'::boolean,'{"2025":-90,"2026":-59}'::jsonb,'その他')
) v(name,asset_class,book_account_id,acquired_on,cost,quantity,dep_method,needs_review,review_note,source,dep_status,dep_basis,is_adjust,dep_override,exclude_reason)
where not exists (select 1 from acc_fixed_assets f where f.name = v.name);
