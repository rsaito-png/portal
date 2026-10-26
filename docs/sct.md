# ストレスチェック実施者養成研修（sct_）

外部の受講者（歯科医師・看護師・精神保健福祉士・公認心理師）が、日時の決まった Google Meet で録画研修を受け、修了証を得るための機能です。法定研修（`ht_`）とは別の表です。ホームページのLPは作っていません。

受講者の入口は `sct.html`。運営は職員ポータルの `#sct`（総務のタイルからも開けます）。

## 料金と修了

| 区分 | 金額（税込） | 受講 |
| --- | --- | --- |
| 3科目 | 12,800円 | 科目1・2・3 |
| 科目1免除（衛生管理者） | 10,800円 | 科目2・3。免除は運営が証明を見てから |
| 全免除（労働衛生コンサルタント） | 0円 | 受講不要。修了証は出さない |

科目と必要時間: 1 労働者の健康管理 120分、2 事業場におけるメンタルヘルス対策 90分、3 個人・集団への支援 90分。オンデマンドはありません。確認テストは記録できますが、合否は修了条件にしません。修了は「対象科目の視聴分数」と「本人確認済み」です。カメラを2分を超えて切っていた回は、運営がボタンでその回の出席から外します（自動判定はしません）。

既定の講師は西岡愛梨です。実務年数の要件は画面では判定せず、講師メモに照合結果を残せます。

返金の目安（振替を優先）: 開催7日前まで全額（決済手数料の実費を控除できる）、6日前から前日は半額、当日以降と無断欠席は返金なし、主催都合は全額。日数は開催日の日本時間の日付で数えます。返金の実行は Stripe ダッシュボード等で行い、ポータルには結果の状態だけを残します。

帳簿・視聴ログ・本人確認・修了証控え・決済・Meet受信は削除できません。自動で消す処理はありません。

## 画面の確認（データなし）

```bash
node tools/sct_check.js
```

ブラウザでは次を開きます。

- 受講者: `sct.html?demo=1`（見本 花子は条件を満たしているので「修了証を表示」で書面が出ます）
- 運営: `index.html?demo=1&role=事務#sct`（開催、出席外し、修了処理、年次CSV、Meet受信の転記）

見本は通信しません。

## 本番へ載せる順序

プロジェクトは `config.js` の Supabase（`zvrardoyxocmqhvyddnf`）です。秘密はリポジトリに書かず、ダッシュボードか `supabase secrets set` にだけ置きます。

1. SQL Editor で `supabase/sct.sql` を実行する（再実行できます）。
2. Authentication で受講者の自己登録を許可する。メール確認を使う場合は、リダイレクトURLに `sct.html` の公開URLを足す。
3. 運営にする人は、既存の `app_metadata.role` が `事務` ならそのままで足ります。別の人はログインし直したあとに有効です。

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"sct_admin"}'
where email = '対象のメール';
```

4. シークレット（値はプレースホルダです）。

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=rk_test_置き換え \
  STRIPE_WEBHOOK_SECRET=whsec_置き換え \
  MEET_WEBHOOK_SECRET=長いランダム文字列 \
  SCT_ALLOWED_ORIGINS=https://公開オリジン \
  SCT_PUBLIC_URL=https://公開オリジン/ポータルのパス \
  --project-ref zvrardoyxocmqhvyddnf
```

`STRIPE_SECRET_KEY` は制限付きキー（`rk_`）で、Checkout Session の作成ができるものにします。`SCT_PUBLIC_URL` は `sct.html` があるディレクトリ（末尾スラッシュなし）。`SCT_ALLOWED_ORIGINS` はカンマ区切りのオリジンで、受講者画面が送る戻り先と一致させます。`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` と `SUPABASE_ANON_KEY` は関数の実行環境に入っています。サービスロールキーはブラウザに出しません。

5. 関数をデプロイする。`supabase/config.toml` で webhook と Meet 受信は JWT 検証を切っています（Stripe と Pub/Sub は利用者JWTを持たないため）。

```bash
supabase functions deploy sct-checkout --project-ref zvrardoyxocmqhvyddnf
supabase functions deploy sct-certificate --project-ref zvrardoyxocmqhvyddnf
supabase functions deploy stripe-webhook --project-ref zvrardoyxocmqhvyddnf
supabase functions deploy meet-events --project-ref zvrardoyxocmqhvyddnf
```

`config.toml` を読まないデプロイでは、次の2つに `--no-verify-jwt` を付けます。`sct-checkout` と `sct-certificate` には付けません。

```bash
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref zvrardoyxocmqhvyddnf
supabase functions deploy meet-events --no-verify-jwt --project-ref zvrardoyxocmqhvyddnf
```

6. Stripe の webhook エンドポイント（テストモードのサンドボックスで先に確認する）。

- URL: `https://zvrardoyxocmqhvyddnf.supabase.co/functions/v1/stripe-webhook`
- イベント: `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`
- 署名秘密は `STRIPE_WEBHOOK_SECRET`。入金の確定はこの関数だけが行います。決済成功ページでは確定しません。
- カードの試験番号は Stripe のテストカード（`4242 4242 4242 4242`）です。

振込は運営画面の「入金・返金」から記録します。状態は `stripe` と `bank` と `none`（課金なし）を持てます。

## Google Meet の入退室（骨格）

MVPでは、運営が「受講者・出席」で入室・退室・本人確認・カメラOFFを記録すれば、Meet API なしで修了まで進めます。

API連携を足すときの要件は次のとおりです（2026-10時点の公開ドキュメント）。

- 消費者向けの Gmail ではなく、Google Meet を使える Google Workspace のアカウントが必要です。エディションごとの Meet 機能の差は [Compare Meet features across Google Workspace editions](https://knowledge.workspace.google.com/admin/meet/compare-meet-features-across-google-workspace-editions) で確認します。Meet REST API と Workspace Events API のチュートリアルが前提にしているのは「Google Meet を使える Workspace アカウント」と、管理者が API を許可していることです。
- Google Cloud プロジェクトで **Google Meet API**、**Google Workspace Events API**、**Cloud Pub/Sub** を有効にします。手順の骨格は [Observe meeting events](https://developers.google.com/workspace/meet/api/guides/tutorial-events-python) です。
- 開催の `meet_space` に `spaces/...` を保存します。購読の対象リソースは `//meet.googleapis.com/spaces/...` です。イベントは少なくとも `google.workspace.meet.participant.v2.joined` と `google.workspace.meet.participant.v2.left`。会議の開始と終了（`conference.v2.started` / `ended`）も受け取ると照合しやすいです。
- Pub/Sub トピックの公開者に `meet-api-event-push@system.gserviceaccount.com` を付けます。購読の TTL は短い（チュートリアルでは 86400秒）ので、開催の前に作り直す運用にします。
- push 先: `https://zvrardoyxocmqhvyddnf.supabase.co/functions/v1/meet-events?token=MEET_WEBHOOK_SECRET`  
  このURL自体が秘密です。ヘッダ `x-sct-meet-secret` でも同じ秘密を受けます。
- 関数は受信を `sct_meet_events` に残すだけです。出席にはしません。運営が「Meet受信」から「出席に転記」し、予約と表示名が1件に決まるときだけ入退室欄へ時刻を入れます。
- あとから在室時間を取り直すときは、保存した `resource_name`（`conferenceRecords/.../participantSessions/...`）を Meet REST の participantSessions で読みます。その呼び出し用のトークンはまだ関数に入れていません。

## 修了証

運営の「修了処理」または受講者の「修了証を表示」が `sct_issue_certificate` を呼び、発行時の氏名・修了日・科目・講師名を `sct_certificates` に残します。PDFはブラウザの印刷です（法定研修と同じ）。Edge Function `sct-certificate` は同じ判定でHTMLも返します。発行後の行は削除できません。氏名を直す場合は発行前にプロフィールを直します。

## ローカルで壊していないことの確認

`node tools/sct_check.js` が通ること。見本の二つのURLで、受講者の修了証と、運営の開催一覧・修了処理・CSVが開くこと。既存の `#ht` や事業所タイルのリンク先は変えていません。
