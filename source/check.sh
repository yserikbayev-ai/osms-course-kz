#!/usr/bin/env bash
# Проверка перед публикацией. Делает ровно то, что делает выкладка:
# прод — это index.html в корне (его отдаёт GitHub Pages), а собирается он
# из source/ скриптом build.sh. Значит проверять надо две вещи: что исходники
# синтаксически целы и что собранное совпадает с тем, что лежит в корне.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
for f in source/*.js; do
  node --check "$f" || { echo "СИНТАКСИС: $f"; fail=1; }
done
[ "$fail" -eq 0 ] || exit 1

bash source/build.sh >/dev/null || { echo "СБОРКА: build.sh упал"; exit 1; }

if cmp -s source/index2.html index.html; then
  echo "index.html собран из текущего source/ — проверка пройдена"
  rc=0
else
  echo "index.html НЕ пересобран: правки в source/ есть, а в корне старая сборка."
  echo "Нужно: bash source/build.sh && cp source/index2.html index.html"
  rc=1
fi

# промежуточные файлы сборки за собой убираем: бот прячет в stash всё, что
# осталось в дереве, и следующая заявка начиналась бы с чужого мусора
rm -f source/index2.html source/lms.html source/test2.html
exit "$rc"
