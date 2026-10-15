#!/bin/bash
# rydeen-lib.js / rydeen-billing-lib.js を TypeScript ソース(rydeen-src/)から作り直す。実行には esbuild が必要(開発時のみ。公開サイトには不要)
cd "$(dirname "$0")"; E=${ESBUILD:-esbuild}
$E rydeen-src/entry-lib.ts --bundle --format=iife --global-name=RydLib --target=es2020 --minify --outfile=rydeen-lib.js
$E rydeen-src/entry-billing.ts --bundle --format=iife --global-name=RydBilling --target=es2020 --minify --outfile=rydeen-billing-lib.js
