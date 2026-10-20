-- 会計士の固定資産台帳(第6期・令和8事業年度, CSV)に合わせた台帳の更新（実行済みの記録）。
-- 要点: トイレ=610,000/定額法15年(部門Asia)、訓練室=定額法15年、看板=一括3年、カローラクロス=取得3,768,610(旧モコ修理30,000・振替310,410を統合し上書き廃止)、
--  エアコン=6年定率法改定償却(第4期補正34,379)、防犯カメラ取得日2023-11-03。台帳外の2022-09の2資産と モコ修理/振替310,410 は償却計算から除外(dep_calc=false)。
--  差額調整行(id 19-21)は不要になり dep_override={} ・ dep_calc=false に無効化(削除可)。
update acc_fixed_assets set cost=610000, life_years=15, dep_method='定額法', dept_alloc='{"1":1}', dept_amt=null where id=7;
update acc_fixed_assets set life_years=15, dep_method='定額法', dept_alloc='{"1":1}' where id=9;
update acc_fixed_assets set life_years=3, dep_method='一括償却(3年均等)', asset_class='構築物', quantity=3 where id=10;
update acc_fixed_assets set cost=3768610, dep_override=null where id=13;
update acc_fixed_assets set dep_calc=false, dep_override=null, exclude_reason='その他' where id in (4,5,16,17);
update acc_fixed_assets set dep_override='{"2024":34379}', life_years=6, dep_method='定率法' where id=2;
update acc_fixed_assets set acquired_on='2023-11-03', quantity=5 where id=6;
update acc_fixed_assets set dep_override='{}', dep_calc=false where is_adjust;
