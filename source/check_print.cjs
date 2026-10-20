// Проверяем полноту документов независимо от сохранённого прогресса.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const files = [
  'content_acts.js', 'content_g1.js', 'content_g2.js', 'content_g3.js',
  'content_vax.js', 'content_checkup.js', 'taxonomy.js',
  'app_core.js', 'app_print.js'
];
const context = vm.createContext({ assert, console, localStorage: { getItem: () => null } });
vm.runInContext(files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n') + `
  for (const c of COURSES) {
    const html = viewCoursePrint(c.id);
    const lessons = courseLessons(c);
    assert.equal((html.match(/class="print-lesson"/g) || []).length, lessons.length);
    assert.equal((html.match(/class="print-norm"/g) || []).length,
      lessons.reduce((n, l) => n + l.cards.length, 0));
    let previous = -1;
    for (const [i, l] of lessons.entries()) {
      const heading = 'Урок ' + (i + 1) + '. ' + esc(l.title);
      const position = html.indexOf(heading);
      assert.ok(position > previous, 'Порядок уроков: ' + c.id);
      previous = position;
      assert.ok(html.includes(esc(l.intro)));
      for (const card of l.cards) {
        const a = ACTS[card.a];
        for (const text of [card.norm, card.plain, a.title, a.num, a.date, a.reg]) {
          assert.ok(html.includes(esc(text)), 'Материал отсутствует: ' + c.id);
        }
        assert.ok(html.includes('п. ' + esc(card.p)));
        assert.ok(html.includes('href="' + esc(a.url) + '"'));
      }
    }
    S.name = 'PRIVATE_NAME';
    S.courses[c.id] = { attempts:[{ pct:37 }], passed:false };
    lessons.forEach(l => { S.read[l.id] = true; });
    assert.equal(viewCoursePrint(c.id), html, 'Прогресс попал в документ');
  }
  const first = courseLessons(COURSES[0])[0].cards[0];
  first.norm = '<img src=x onerror="alert(1)"> & текст';
  const escaped = viewCoursePrint(COURSES[0].id);
  assert.ok(escaped.includes(esc(first.norm)));
  assert.ok(!escaped.includes('<img'));
  console.log('Печатные материалы: полнота всех ' + COURSES.length + ' курсов, ссылки, порядок, приватность и экранирование — OK');
`, context);
