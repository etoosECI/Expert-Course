#!/usr/bin/env bash
# naeshin-dashboard의 산출 엔진·입결 데이터를 Expert-Course로 다시 가져와 번들한다.
# 사용법: tools/naeshin/build.sh /경로/naeshin-dashboard
set -euo pipefail
SRC="${1:?naeshin-dashboard 경로를 지정하세요}"; HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
cp "$SRC/src/types.ts" "$HERE/src/"
cp "$SRC"/src/engine/{naeshinRules,customCalc,genEngine,medGrade}.ts "$HERE/src/engine/"
cp "$SRC/src/data/general.ts" "$HERE/src/data/"
cp "$SRC/src/data/general.json" "$ROOT/data/general.json"
git -C "$SRC" log -1 --format="%H %cd" > "$HERE/UPSTREAM"
npx --yes esbuild@0.24 "$HERE/entry.ts" --bundle --format=esm --target=es2020 --outfile="$ROOT/js/vendor/naeshin-engine.js" \
  --banner:js="// 자동 생성 파일 — 수정하지 마세요. 원본: etoosECI/naeshin-dashboard (tools/naeshin/build.sh로 재생성)"
echo "완료: $(cat "$HERE/UPSTREAM")"
