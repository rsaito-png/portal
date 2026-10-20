# sui-draft
sui_request(待ち) → xAI(grok-4.7, JSON出力) → draft 書き戻し・status='作成済み'。失敗時は status を変えず error 列に内容。
- シークレット: XAI_API_KEY（Management API の /secrets で設定）。モデル変更は SUI_MODEL。
- 発火: supabase/sui_draft_trigger.sql（INSERT トリガー、pg_net、鍵は vault）。
- 再実行: 失敗した行は status が「待ち」のまま。`POST /functions/v1/sui-draft {"id":N}`（service_role）で再試行。
