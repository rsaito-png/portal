# 会長ページ
- 画面: `#chair`（会長だけ。staff_profiles.is_chair=true のアカウント）。`chair.js`
- 会長は1行入れるだけ。整理はAIの朝のルーティンが1日1回（8時以降）行う。
- 朝のルーティン: `python3 tools/chair_ai.py export` → AIが読んで判断JSONを作る → `python3 tools/chair_ai.py apply FILE.json`。AIが使えない日は `fallback`。
- 設定: chair_config（buckets=担当名の配列, owner, org）。他事業所は行を変えるだけ。個人IDはリポジトリに書かない。
