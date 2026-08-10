/* ================= Сборка модели ================= */
Object.assign(ACTS, ACTS_EXT);
const LESSONS = [...G1_LESSONS, ...G2_LESSONS, ...G3_LESSONS, ...VAX_LESSONS, ...CHK_LESSONS];
const QUESTIONS = [...G1_QUESTIONS, ...G2_QUESTIONS, ...G3_QUESTIONS, ...VAX_QUESTIONS, ...CHK_QUESTIONS];

// у старых уроков уровень хранился в поле grade — нормализуем
LESSONS.forEach(l => { if (l.level === undefined) l.level = l.grade || 1; if (l.video === undefined) l.video = null; });
const L_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));
const C_BY_ID = Object.fromEntries(COURSES.map(c => [c.id, c]));
const D_BY_ID = Object.fromEntries(DIRECTIONS.map(d => [d.id, d]));
// привязка урок → курс/направление
COURSES.forEach(c => c.lessons.forEach(id => { const l = L_BY_ID[id]; if (l) { l.course = c.id; l.dir = c.dir; } }));
QUESTIONS.forEach(q => { const l = L_BY_ID[q.l]; q.course = l ? l.course : null; q.dir = l ? l.dir : null; q.level = q.g; });

const PASS = 0.8, COMPLAINTS_TO_FREEZE = 3;
const courseLessons = c => c.lessons.map(id => L_BY_ID[id]).filter(Boolean);
const courseQuestions = c => QUESTIONS.filter(q => q.course === c.id && !frozen(q.id));
const dirCourses = d => COURSES.filter(c => c.dir === d).sort((a, b) => a.step - b.step);
const courseLevels = c => [...new Set(courseLessons(c).map(l => l.level))].sort();
const examSize = c => Math.min(20, courseQuestions(c).length);

/* ================= Состояние ================= */
const KEY = 'lms-npa-v2';
const blank = () => ({ courses:{}, complaints:{}, read:{}, ca:{}, name:'', drills:[] });
let S = load();
function load(){ try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){ return blank(); } }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }
function cs(id){ return S.courses[id] || (S.courses[id] = { attempts:[], passed:false, caDone:true, caList:[] }); }
function frozen(id){ return (S.complaints[id] || 0) >= COMPLAINTS_TO_FREEZE; }
function courseState(c){
  const d = cs(c.id);
  if (d.passed) return 'done';
  if (d.attempts.length) return 'progress';
  const ls = courseLessons(c);
  return ls.some(l => S.read[l.id]) ? 'progress' : 'new';
}
function dirProgress(dirId){
  const cl = dirCourses(dirId);
  const done = cl.filter(c => cs(c.id).passed).length;
  return { done, total: cl.length, pct: cl.length ? Math.round(done / cl.length * 100) : 0 };
}
function nextRecommended(dirId){
  return dirCourses(dirId).find(c => !cs(c.id).passed) || null;
}

/* ================= Утилиты ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function shuffle(a){ const r = a.slice(); for (let i = r.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]] = [r[j],r[i]]; } return r; }
function fmt(sec){ return String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0'); }
function actLine(a){ return `${esc(a.title)} — № ${esc(a.num)} от ${esc(a.date)}`; }
function levelChip(n){ return `<span class="chip lvl${n}">${LEVELS[n].name}</span>`; }
function scrollTop(){ window.scrollTo({ top:0, behavior:'smooth' }); }

/* ================= Роутер ================= */
let VIEW = { name:'catalog' };
function go(view){ VIEW = view; render(); scrollTop(); }
function setTab(name){
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)));
}
function render(){
  const v = VIEW;
  setTab(v.name === 'course' || v.name === 'lesson' || v.name === 'direction' || v.name === 'exam' || v.name === 'result' ? 'catalog' : v.name);
  const el = $('#app');
  if (v.name === 'catalog')   el.innerHTML = viewCatalog();
  else if (v.name === 'direction') el.innerHTML = viewDirection(v.dir);
  else if (v.name === 'course')    el.innerHTML = viewCourse(v.course);
  else if (v.name === 'lesson')    el.innerHTML = viewLesson(v.lesson);
  else if (v.name === 'drill')     el.innerHTML = viewDrillSetup();
  else if (v.name === 'chief')     el.innerHTML = viewChief();
  else if (v.name === 'about')     el.innerHTML = viewAbout();
  bind();
}
