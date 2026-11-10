# daily-sky（今日のお仕事占い）
全体の空の動き（太陽・月の星座、月の移動、月相）から、その日の仕事に結びつけた2〜3文＋「今日のひとこと」を作り `portal_daily_sky` に入れる。トップに表示。
読む人は児発・放デイ、居宅介護、生活介護の職員。チームワーク・利用者対応・記録・送迎・報連相・集中とペース。健康・医療・怖い予言は書かない。本文は2〜3行＋ひとこと1行（字数上限なし。薄い一文にしない）。
- 起動: pg_cron `daily-sky` 毎日 JST 5:10（`supabase/daily_sky.sql`）。今日分があればスキップ（本更新は別の 5:00 側）。
- 守り: verify_jwt=false。ヘッダ `x-daily-sky-secret` = secret `DAILY_SKY_SECRET`、未設定なら private_config `daily_sky_secret`（cronも同じ値を使う）。
- 文: xAI（XAI_API_KEY, AI_MODEL）。失敗時は天文事実から定型文。
- 手動作り直し: `curl -X POST .../functions/v1/daily-sky -H "x-daily-sky-secret: <秘密>" -d '{"force":true}'`
