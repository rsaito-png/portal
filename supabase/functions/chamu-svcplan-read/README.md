# chamu-svcplan-read

職員が選んだ PDF または JPEG/PNG から、サービス等利用計画（居宅サービス計画書を含む）の文字を読む。結果は画面に返すだけで、表には保存しない。保存は職員が文面を確認してから行う。

- 認証: ログイン JWT（verify_jwt true）。`chamu_can_plan()` が true の人だけ。
- 画像は xAI の vision（chat completions）。PDF は xAI Files に上げて Responses API で読み、終わったらそのファイルを消す。公開 URL にはしない。
- シークレット: `XAI_API_KEY`。モデルは `CHAMU_READ_MODEL`（既定 grok-4.7）。
