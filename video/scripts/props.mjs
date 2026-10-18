// Собирает props/<урок>.json из ../source/content_*.js + props/<урок>.story.json
// и проверяет, что каждый текст в кадре взят из полей урока (norm/plain/title/акт).
// Запуск: node scripts/props.mjs L1.2
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, '..', 'source');
const id = process.argv[2];
if (!id) throw new Error('Использование: node scripts/props.mjs <id урока>');

// content_*.js — обычные const без export: выполняем в песочнице и забираем глобалы.
const ctx = {};
vm.createContext(ctx);
for (const f of fs.readdirSync(srcDir).filter((f) => /^content_.*\.js$/.test(f))) {
  // top-level const не попадает в глобальный объект песочницы — меняем на var
  vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/^const /gm, 'var '), ctx, {filename: f});
}
const lessons = Object.entries(ctx).filter(([k]) => k.endsWith('_LESSONS')).flatMap(([, v]) => v);
const questions = Object.entries(ctx).filter(([k]) => k.endsWith('_QUESTIONS')).flatMap(([, v]) => v);
const acts = {...(ctx.ACTS || {}), ...(ctx.ACTS_EXT || {})};
const lesson = lessons.find((l) => l.id === id);
if (!lesson) throw new Error(`Урок ${id} не найден в ${srcDir}`);
const story = JSON.parse(fs.readFileSync(path.join(root, 'props', `${id}.story.json`), 'utf8'));
if (story.scenes.length !== lesson.cards.length) throw new Error(`В story ${story.scenes.length} сцен, в уроке ${lesson.cards.length} карточек`);
const act = acts[lesson.cards[0].a];
const nQuestions = questions.filter((q) => q.l === id).length;

// --- проверка текста в кадре ---------------------------------------------
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'“”.,:;!?()—–-]/g, ' ').split(/\s+/).filter(Boolean);
const sources = (card) => ({norm: card.norm, plain: card.plain, title: lesson.title, act: `Приказ МЗ РК № ${act.num} от ${act.date} ${act.title}`});
// exact — подстрока поля; shortened — все слова есть в поле в том же порядке (сокращение).
function locate(text, fields) {
  for (const [k, v] of Object.entries(fields)) if (v.toLowerCase().includes(text.toLowerCase())) return {field: k, how: 'exact'};
  const t = norm(text);
  for (const [k, v] of Object.entries(fields)) {
    const w = norm(v);
    let i = 0;
    for (const tok of t) {
      while (i < w.length && w[i] !== tok) i++;
      if (i === w.length) break;
      i++;
    }
    if (i <= w.length && t.every((tok) => w.includes(tok)) && i !== 0) {
      // повторная строгая проверка порядка
      let j = 0, ok = true;
      for (const tok of t) { const k2 = w.indexOf(tok, j); if (k2 < 0) { ok = false; break; } j = k2 + 1; }
      if (ok) return {field: k, how: 'shortened'};
    }
  }
  return null;
}
const table = [];
const errors = [];
function check(text, fields, where) {
  if (/^\d+$/.test(text)) { table.push({where, text, field: 'norm/plain (число)', how: 'digit'}); return; }
  const r = locate(text, fields);
  if (!r) errors.push(`${where}: «${text}» не найден в полях урока`);
  else table.push({where, text, field: r.field, how: r.how});
}

// --- сцены ------------------------------------------------------------------
const scenes = lesson.cards.map((card, i) => {
  const s = story.scenes[i];
  const fields = sources(card);
  const where = `п. ${card.p}`;
  check(s.header, fields, `${where} заголовок`);
  for (const it of s.items) { check(it.text, fields, `${where} ${it.id}`); if (it.unit) check(it.unit, fields, `${where} ${it.id} unit`); }
  const order = s.voice || story.voice.card;
  const parts = order.map((k) => ({part: k, text: card[k]}));
  return {
    kind: 'card', p: card.p, a: card.a, norm: card.norm, plain: card.plain,
    header: s.header, peak: Boolean(s.peak), items: s.items, parts,
    voiceText: parts.map((p) => p.text).join(' '),
  };
});
for (const [i, line] of story.summary.lines.entries()) check(line, sources(lesson.cards[i]), `итог ${i + 1}`);
if (story.summary.cta !== `Проверьте себя: ${nQuestions} вопросов`) errors.push(`CTA «${story.summary.cta}» ≠ числу вопросов урока (${nQuestions})`);
for (const sc of scenes) {
  const final = [sc.header, ...sc.items.filter((it) => !it.out).map((it) => it.text + (it.unit ? ' ' + it.unit : ''))];
  const words = final.join(' ').split(/\s+/).length;
  if (words > 5) console.warn(`  ! п. ${sc.p}: в финальном состоянии ${words} слов (>5): ${final.join(' | ')}`);
}

const props = {
  id, title: lesson.title, grade: lesson.grade, nQuestions,
  act: {num: act.num, date: act.date, title: act.title},
  opener: {kind: 'opener', voiceText: story.voice.opener, cutAfter: story.voice.openerCut},
  scenes,
  summary: {kind: 'summary', lines: story.summary.lines.map((text, i) => ({p: lesson.cards[i].p, text})), cta: story.summary.cta, voiceText: story.voice.summary},
};
fs.mkdirSync(path.join(root, 'props'), {recursive: true});
fs.writeFileSync(path.join(root, 'props', `${id}.json`), JSON.stringify(props, null, 2));
fs.writeFileSync(path.join(root, 'props', `${id}.check.json`), JSON.stringify({table, errors}, null, 2));

const chars = [props.opener.voiceText, ...scenes.map((s) => s.voiceText), props.summary.voiceText].reduce((a, t) => a + t.length, 0);
console.log(`props/${id}.json: ${scenes.length} сцен, ${nQuestions} вопросов, озвучка ${chars} символов`);
for (const e of errors) console.error('  ✗ ' + e);
if (errors.length) process.exit(1);
