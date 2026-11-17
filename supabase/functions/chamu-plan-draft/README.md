# chamu-plan-draft

chamu_plan_requests（待ち）の id を受け、前期の計画・その期間の茶夢日誌（その人の行）・日誌アーカイブ・最新のサービス等利用計画から、個別支援計画5書類を xAI で作る。status が下書きの行にだけ書き戻す。

- 呼び出し: トリガー `chamu_plan_request_fire`（pg_net）。Authorization は vault の `sui_service_key`（service_role）。関数内でも同じ鍵だけを通す。
- シークレット: `XAI_API_KEY`。モデルは `CHAMU_PLAN_MODEL`（既定 grok-4.7）。temperature 0.2。
- 他の利用者名・職員名が本文に残ったら1回だけ作り直す。それでも残れば保存せず、依頼を「エラー」にする。鍵は理由文に残さない。
- 再実行: 失敗した行は status が「エラー」。同じ計画で、画面からもう一度「AIで下書きを作る」。
