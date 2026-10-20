# notify-chat（Chatスペースのウェブフック方式）
- シークレット: `CHAT_WEBHOOK_MGR`（管理職用）, `CHAT_WEBHOOK_ALL`（職員全員用）。URLは公開リポジトリに入れない。
- 設定: `supabase secrets set CHAT_WEBHOOK_MGR=... CHAT_WEBHOOK_ALL=... --project-ref zvrardoyxocmqhvyddnf`
- 接続テスト（管理職用スペースに1件）: `curl -X POST <関数URL> -H "x-notify-secret: $NOTIFY_SECRET" -d '{"test":"mgr"}'`
- 未設定の宛先は送信せず、待ち行列に残る。夜間(22-6時)は送らない。
