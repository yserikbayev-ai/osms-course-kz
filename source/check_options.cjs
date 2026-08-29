/**
 * Варианты ответа не должны выдавать себя формой.
 *
 * Заказчик заметил то же, что видно и по цифрам: правильный ответ был длиннее
 * остальных почти всегда, и тест проходился без знания норм — по длине строки.
 * Здесь проверяется то, что можно проверить машиной: варианты не повторяются,
 * их ровно четыре, и правильный не выпирает длиной. Правдоподобность
 * неправильных вариантов машиной не измерить — это остаётся на авторе.
 */
const fs = require('fs');
const path = require('path');

const MAX_GAP = 12; // символов, на которые правильный может быть длиннее самого длинного из прочих

const dir = path.join(__dirname);
const files = fs.readdirSync(dir).filter((f) => /^content_.*\.js$/.test(f));
const problems = [];
let total = 0;

for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const re = /o:\[(.*?)\], c:(\d+)/gs;
  let m;
  while ((m = re.exec(src))) {
    const ids = src.slice(0, m.index).match(/id:'([^']+)'/g) ?? [];
    const id = ids.length ? ids[ids.length - 1].slice(4, -1) : '?';
    const opts = (m[1].match(/'(?:[^'\\]|\\.)*'/g) ?? []).map((s) => s.slice(1, -1));
    const c = Number(m[2]);

    if (opts.length !== 4) {
      problems.push(`${file} ${id}: вариантов ${opts.length}, а должно быть 4`);
      continue;
    }
    total++;

    if (new Set(opts).size !== 4) problems.push(`${file} ${id}: варианты повторяются`);

    const lens = opts.map((o) => o.length);
    const others = lens.filter((_, i) => i !== c);
    const gap = lens[c] - Math.max(...others);
    if (gap > MAX_GAP)
      problems.push(`${file} ${id}: правильный длиннее остальных на ${gap} симв. (${lens[c]} против ${Math.max(...others)})`);
  }
}

if (problems.length) {
  console.log('ВАРИАНТЫ ОТВЕТА:');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log(`варианты ответа: ${total} вопросов, перекосов по длине нет`);
