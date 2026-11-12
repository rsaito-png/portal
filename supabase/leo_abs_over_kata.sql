-- カレンダーの「休み」（欠席時対応・キャンセル）は、型表（kata）の「利用」より優先する。
-- 型表の利用は書き直しで更新時刻が新しくなるため、時刻の比較だと休みが負けていた（例：休みを入れても日誌が利用のまま）。
-- 今入っている leo_nikki_from_events の比較の1行だけを書き換える。権限・RLSは変えない。
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.leo_nikki_from_events(date)'::regprocedure);
  d2 := replace(d, 'and (u.updated_at is null or c.updated_at >= u.updated_at)',
                   'and (u.updated_at is null or u.source = ''kata'' or c.updated_at >= u.updated_at)');
  d2 := replace(d2, 'when a.id is not null and (u.updated_at is null or a.updated_at >= u.updated_at) then ''欠席''',
                    'when a.id is not null and (u.updated_at is null or u.source = ''kata'' or a.updated_at >= u.updated_at) then ''欠席''');
  if d2 = d then
    if position('u.source = ''kata''' in d) > 0 then raise notice 'もう直っています'; return; end if;
    raise exception '書き換える場所が見つかりませんでした（何も変えていません）';
  end if;
  execute d2;
end $$;
select '直しました' as 結果;
