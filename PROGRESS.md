# RYDEEN(B型)機能 再現 進捗 (branch rydeen-b)
状態: 全機能を企業ポータル形式(素のHTML/JS)で再現済み。本番公開(push)は未実施。

## 実装
- 入口: 企業ポータルの RYDEEN タイル → `#rydeen/home`(config.js / index.html の render() に1行フック)
- rydeen.js: 共通・管理ホーム/利用者管理/メモ・タスク/マニュアル/報告・利用者向け画面
- rydeen-journal.js: 業務日誌 → 実績記録票 自動転記 → 利用者の電子署名(署名画像・サーバー時刻・変更時は再署名)
- rydeen-bill.js + rydeen-billing-lib.js: 国保連CSV(J111/J121/J611, Shift_JIS, 形式チェック)
- rydeen-docs.js: 利用契約・重説の電子署名(SHA-256・追記専用), 個別支援計画(版履歴・確定・署名)
- rydeen-staff.js: 職員勤務実績, 報告
- rydeen-src/ + build-rydeen.sh: b-portal の src/lib のTS→JS(esbuild, 生成物はコミット済)
- supabase/rydeen_journal.sql: bp_journal, bp_create_worker, bp_now (本番適用済)

## 検証
- tests/verify-billing-b.js: 67 OK / 0 NG
- tests/e2e.py (Playwright, 検証用の別事業所 E2E-TEST + 一時ユーザー, 終了時に自動削除): 45 OK / 0 NG
- スクリーンショット: /workspace/shots/rydeen-*.png
