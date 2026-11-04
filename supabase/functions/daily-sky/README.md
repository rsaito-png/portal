# daily-sky（毎日占い）
全体の空の動き（太陽・月の星座、月の移動、月相）から2〜3文＋「今日のひとこと」を作り `portal_daily_sky` に入れる。トップ最上段に表示。
- 起動: pg_cron `daily-sky` 毎日 JST 5:10（`supabase/daily_sky.sql`）。今日分があればスキップ。
- 守り: verify_jwt=false。ヘッダ `x-daily-sky-secret` = secret `DAILY_SKY_SECRET`、未設定なら private_config `daily_sky_secret`（cronも同じ値を使う）。
- 文: xAI（XAI_API_KEY, AI_MODEL）。失敗時は天文事実から定型文。
- 手動作り直し: `curl -X POST .../functions/v1/daily-sky -H "x-daily-sky-secret: <秘密>" -d '{"force":true}'`
