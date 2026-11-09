# 出退勤打刻の GAS（廃止スタブ）

ポータルの打刻は **Supabase のみ**。この `Code.gs` は旧キャッシュ端末がまだ `/exec` に POST してくるとき用で、**シートにも Supabase にも書かない**。

返す JSON は `{ ok: false, error: "新しい画面に…" }`。旧画面はこの `error` を赤枠で表示する。

## デプロイ

1. [出退勤記録シート](https://docs.google.com/spreadsheets/d/1KEyzLGVwIWR2ziWNyghhGzSf6B2ZfHE-UIj8U0szxzs/edit) → 拡張機能 → Apps Script
2. `Code.gs` をこのファイルの内容で置き換え
3. デプロイ → デプロイを管理 → 既存ウェブアプリの「新バージョン」
4. URL は変えない（`…/AKfycbwOFXip…/exec`）
