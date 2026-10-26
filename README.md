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
- 「直す」は `leo_edits` に保存 → box の apply_edits.py（cron毎分）が日誌のセルに反映。シートの値が変わっていたら「衝突」で書かない
- 同期ジョブは box 側（このリポジトリには入れない）。秘密トークンもリポジトリには置かない
- `supabase/leo2.sql` … 型表・個別支援計画 管理表・職員配置表（`leo_sheet`、見るだけ）と、事務の「直した所」確認用の権限
- `help.html` … 職員向け 使い方

## 日中一時支援（`#nicchu`・レスパイト）
- 星心会レスパイトスタジオの支援日誌。居宅介護（金斗雲）の訪問記録とは別の表です。
- `nicchu.js` … 一覧・その日の記録（`#nicchu/log`）、タブレットのあとで署名（`#nicchu/sign`）。署名欄は `signpad.js`。
- `supabase/nicchu.sql` … `nicchu_user` / `nicchu_helper` / `nicchu_day` / `nicchu_record` / `nicchu_sign_log` と `nicchu_can()`。Supabase の SQL Editor に貼って Run（再実行できる）。
- 読み書きできる人: `staff_profiles.nicchu` が true、または所属が「レスパイト」「日中一時」、または事務・管理者・児発管・会長。担当にする例: `update public.staff_profiles set nicchu = true where user_id = '<id>';`
- 利用者と記入者の実名はリポジトリに置かない。一覧の「利用者」から追加する。記入者は記録を保存すると次回の候補になる。
- PDF 出力はまだない。

## 法定研修（Supabase版・`#ht`）
- `ht.js` … 画面（ホーム／職員／研修／委員会／年間カレンダー／設定、実施記録PDF・受講証明書・議事録は印刷画面→PDF保存）。`supabase/houtei.sql` … 表（ht_）とRLS
- 権限は `ht_access`（メール×事業所。office_id が空＝全事業所の統括）。SQLで追加: `insert into ht_access(email,office_id,can_edit) values ('xxx@…','leo',true);`
- 職員・受講記録などの個人データはDBにだけある（このリポジトリには入れない）。テストモード（ht_settings）中も、このページはメール・チャットを送らない

## ストレスチェック実施者養成研修（`sct_`）
- 受講者の入口は `sct.html`（アカウント作成・資格・免除証明・開催の予約・Stripe・修了証）。職員ポータルの運営画面は `#sct`（事務または `sct_admin`）。
- `supabase/sct.sql` … 表・RLS・修了判定。`sct_logic.js` は画面と `node tools/sct_check.js` が共有する規則。詳しい適用手順とシークレットは `docs/sct.md`。
- ホームページのLP、顔認証、ジョブメドレー、エデン連携はこの範囲に入っていない。

## 会計「申告」タブ（acc.html#tax、法人管理者のみ）
- ファイル: `tax.js`（画面）、`taxcalc.js`（計算。node でも検証可）、`supabase/acc_tax.sql`（`acc_tax_inputs` 期ごとの入力値。RLS=`acc_is_admin()`）。
- 内容: 決算書（BS/PL/販管費内訳/社員資本等変動計算書/個別注記表）、勘定科目内訳明細書、別表一・二・四・五(一)・十五・十六と法人税・地方法人税・防衛特別法人税・事業税・特別法人事業税・住民税（三重県・四日市市）の概算、消費税（原則課税と簡易課税の比較）、freee照合。
- **概算であり税理士確認が必要。電子申告(e-Tax/eLTAX)は税理士または本人が行う。**
- 根拠（2026-10-16 確認）:
  - 法人税率・地方法人税 https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm
  - 防衛特別法人税 https://www.nta.go.jp/publication/pamph/pdf/0025004-109_1.pdf ／ https://laws.e-gov.go.jp/law/505AC0000000069
  - 三重県 法人事業税 https://www.pref.mie.lg.jp/ZEIMU/HP/16336017880.htm ／ 法人県民税 https://www.pref.mie.lg.jp/ZEIMU/HP/16338017882.htm
  - 四日市市 法人市民税 https://www.city.yokkaichi.lg.jp/www/contents/1001000000675/index.html
  - 特別法人事業税 https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_01.html
  - 消費税・インボイス https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm
  - 交際費（中小法人） https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5265.htm
- 税理士ボットの履歴は読めなかったため、税務前提は公開情報と freee の帳簿のみ。

### 申告書類一式（紙提出用）
- 申告タブの「📦 申告書類一式を出力」（`taxpack.js`）。表紙・提出前チェックリスト・入力不足の警告・税務署（別表一/四/五(一)/五(二)/十五/十六・決算書・内訳書）・県（第6号）・市（第20号）・根拠URL。印刷→PDF保存。
- 様式は公式様式に**準じた自作レイアウト**（公式PDFへの重ね書きではない）。未対応: 法人事業概況説明書・適用額明細書・納付書・別表六/七。
- 検証・サンプル出力: `SUPABASE_SERVICE_KEY=… node tools/taxpack_sample.js 2025 /出力先`（第5期は実際の申告書19項目と照合）。個人の取引先名・役員名は出力しない。
