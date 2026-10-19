select (select jsonb_agg(to_jsonb(e)-'answer_id') from leo_schedule_exception e where child like '【テスト】%') ex
