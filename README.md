# 職員ポータル（MVP）

職員みんなの入口になる1枚のページです。スマホ対応・日本語・メール＋パスワードでログイン。

## 構成
- `index.html` … 画面と処理（ビルド不要、GitHub Pagesでそのまま公開）
- `config.js` … **法人ごとの設定（名前・色・事業所とそのタイル・法人共通タイル）。他法人に使うときはここだけ変更**
- ログイン … Supabase Auth（東京リージョン）

## 他の事業所で使う手順
1. このリポジトリをコピー
2. Supabaseで東京リージョンのプロジェクトを作り、URLと公開キー（publishable）を `config.js` へ
3. Supabase の Authentication > Users > Add user で職員を登録（Auto Confirm にチェック）
4. GitHub Pages を有効化

## 注意
- 公開キーはブラウザに出してよい種類。秘密キー（service_role / secret）は絶対に書かない
- 個人データは国内リージョンのみに保存

## 役割（職員／事務）
- `config.js` の `roles` と `clerk` 区画で設定。事務区画（請求CSV・実績集計）は事務の人にだけ表示
- 事務にする人は Supabase の SQL Editor で:
  `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"事務"}' where email = '対象のメール';`
- 画面で隠しているだけなので、請求データを置くときは Supabase の RLS でも事務だけに制限すること
- 見本モード: `?demo=1`（職員の見え方）、`?demo=1&role=事務`（事務の見え方）。画面のラジオボタンでも切替可

## レオの実データ（日誌・実績）
- 流れ: カレンダー →(毎朝GAS) 日誌 ←(LINE・スパーク) → 毎晩 実績記録。box の同期ジョブが Google を**読むだけ**で Supabase に入れる
- `supabase/leo.sql` … テーブルとRLS（レオ所属のログイン職員だけ読める）。SQL Editor に貼って Run
- `leo.js` … 今日の送迎（自分の担当）・今日の利用児童・日誌・実績の画面。見本モードは架空データのみ
- 「直す」は Google を上書きせず `leo_edits` に修正依頼として保存 → 確認してから日誌に反映（安全策）
- 同期ジョブは box 側（このリポジトリには入れない）。秘密トークンもリポジトリには置かない
