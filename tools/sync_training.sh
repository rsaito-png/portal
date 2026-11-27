#!/usr/bin/env bash
# 研修ページ（rsaito-png/training）へ、運営画面と共有する計算・修了証の部品を写す。
# 使い方: tools/sync_training.sh /path/to/training  （そのあと training 側で commit / push）
set -euo pipefail
dst="${1:?training リポジトリのパス}"
root="$(cd "$(dirname "$0")/.." && pwd)"
cp "$root/sct_logic.js" "$root/sct_cert.js" "$root/pc-scale.js" "$dst/"
echo "copied sct_logic.js sct_cert.js pc-scale.js -> $dst"
