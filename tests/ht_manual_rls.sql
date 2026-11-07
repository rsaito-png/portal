begin;
insert into public.ht_offices_t(id,name,types) values('__ht_test_a','検証A',array['検証']),('__ht_test_b','検証B',array['検証']);
insert into public.ht_access(email,office_id,can_edit) values('ht-test-editor@example.invalid','__ht_test_a',true),('ht-test-reader@example.invalid',null,false);
select set_config('request.jwt.claims',jsonb_build_object('email',(select email from public.ht_access where office_id is null and can_edit order by email limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n int; begin
 if not public.ht_all() then raise exception '管理者判定失敗'; end if;
 insert into public.ht_trainings(id,name,target_types) values('__ht_test_tr','検証研修',array['検証']);
 update public.ht_trainings set name='検証編集' where id='__ht_test_tr'; get diagnostics n=row_count; if n<>1 then raise exception 'マスタ編集失敗'; end if;
 insert into public.ht_events(id,name) values('__ht_test_ev','検証訓練');
 insert into public.ht_committees(id,name) values('__ht_test_co','検証委員会');
 insert into public.ht_committee_plan(fy,month,committee_ids) values(2026,11,array['__ht_test_co']);
 insert into public.ht_records(id,fy,training_id,offices,impression) values('__ht_test_rec',2026,'__ht_test_tr',array['__ht_test_a'],'元');
 insert into public.ht_event_logs(id,event_id,office_id,done_on) values('__ht_test_el','__ht_test_ev','__ht_test_a','2026-11-08');
 insert into public.ht_committee_logs(id,committee_id,office_ids,held_at) values('__ht_test_cl','__ht_test_co',array['__ht_test_a'],now());
 begin
  update public.ht_access set can_edit=false where office_id is null and email=public.ht_email();
  raise exception '自分の権限変更が許可された';
 exception when raise_exception then
  if sqlerrm not like '%自分の全事業所%' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claims','{"email":"ht-test-editor@example.invalid","role":"authenticated"}',true);
do $$ declare n int; begin
 if public.ht_all() then raise exception '事業所担当を管理者と誤認'; end if;
 update public.ht_records set impression='編集済' where id='__ht_test_rec'; get diagnostics n=row_count; if n<>1 then raise exception '受講記録編集失敗'; end if;
 if not exists(select 1 from public.ht_records where id='__ht_test_rec' and evidence='手入力（編集済み・証跡なし）' and confirmed_at is null) then raise exception '証跡更新失敗'; end if;
 update public.ht_event_logs set result='編集' where id='__ht_test_el'; get diagnostics n=row_count; if n<>1 then raise exception '実施記録編集失敗'; end if;
 delete from public.ht_event_logs where id='__ht_test_el'; get diagnostics n=row_count; if n<>1 then raise exception '実施記録削除失敗'; end if;
 update public.ht_committee_logs set decisions='編集' where id='__ht_test_cl'; get diagnostics n=row_count; if n<>1 then raise exception '開催記録編集失敗'; end if;
 delete from public.ht_committee_logs where id='__ht_test_cl'; get diagnostics n=row_count; if n<>1 then raise exception '開催記録削除失敗'; end if;
 update public.ht_trainings set name='禁止' where id='__ht_test_tr'; get diagnostics n=row_count; if n<>0 then raise exception '担当者がマスタ編集できた'; end if;
 delete from public.ht_records where id='__ht_test_rec'; get diagnostics n=row_count; if n<>0 then raise exception '担当者が受講記録削除できた'; end if;
 begin
  update public.ht_records set offices=array['__ht_test_b'] where id='__ht_test_rec';
  raise exception '範囲外への変更が許可された';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"email":"ht-test-reader@example.invalid","role":"authenticated"}',true);
do $$ declare n int; begin
 if public.ht_all() then raise exception '見るだけが管理者になった'; end if;
 if not '__ht_test_b'=any(public.ht_offices()) then raise exception '全体閲覧失敗'; end if;
 update public.ht_trainings set name='禁止' where id='__ht_test_tr'; get diagnostics n=row_count; if n<>0 then raise exception '閲覧者が書けた'; end if;
end $$;
reset role;
rollback;
select 'PASS: 管理者マスタ編集・本人権限保護・担当事業所記録編集削除・範囲外拒否・全体閲覧のみを確認（全検証データはrollback）' as result;
