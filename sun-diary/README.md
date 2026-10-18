# 太陽カレンダー日記

https://sun-diary.pages.dev/ のソース。

## デプロイ

Cloudflare Pages プロジェクト名 `sun-diary` へ:

```bash
npx wrangler pages deploy . --project-name=sun-diary
```

（このディレクトリをカレントにして実行）

## 変更メモ

- 日ポップアップのタイトル星座は **月** 基準（`ingress` から導出）。太陽サイン (`sign`) は出さない。
- イングレス日は `変更前→変更後`（例: `射手座→山羊座`）、終日滞在は1星座のみ。
