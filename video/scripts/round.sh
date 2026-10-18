#!/bin/bash
# Один круг петли проверки: props → tts (кэш) → tsc → черновик 0.5 → листы кадров.
# bash scripts/round.sh L1.2 r2
set -e
cd "$(dirname "$0")/.."
L=$1; TAG=$2
node scripts/props.mjs "$L" 2>&1 | grep -v '^  !' || true
node scripts/tts.mjs "$L" 2>/dev/null | tail -1
npx tsc
npx remotion render OsmsLesson "out/$L.draft.mp4" --props="props/$L.json" --scale=0.5 --log=error
python3 -P scripts/sheet.py "$L" --tag "$TAG" | tail -2
