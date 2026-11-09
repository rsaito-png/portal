# 打刻ログ Sheet → Supabase 取り込み

正は Supabase `dakoku_punches`。旧キャッシュのポータルは GAS（Sheet）にだけ書くことがある。

手順（ボット）:
1. Sheets `1KEyzLGVwIWR2ziWNyghhGzSf6B2ZfHE-UIj8U0szxzs` タブ `打刻ログ` を読む
2. `dakoku_punches` と staff_id+kind+時刻±60秒で突合
3. 無い行だけ `dakoku_ingest_gas` または INSERT（メモ末尾に（シートから移行））
4. `punched_at_jst` は必ず `YYYY-MM-DD HH24:MI:SS`（時は2桁）

GAS `Code.gs` は打刻後に `dakoku_ingest_gas` へも送る。デプロイは clasp（scriptId `1eMe76h8tY6cv3JAEvLf_F8wrvBNj55qaoPz_gRqm6PZsAzWGxqcSgWOY`）またはエディタから「デプロイ」→既存ウェブアプリの新バージョン。
