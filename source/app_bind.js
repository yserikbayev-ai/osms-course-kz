/* ================= Кабинет руководителя ================= */
const DEMO = [
  { n:'Ахметова Г. С.', role:'ВОП',             done:5, first:72, second:88 },
  { n:'Досжанов Б. К.', role:'Терапевт',        done:3, first:85, second:null },
  { n:'Сариева А. М.',  role:'Гастроэнтеролог', done:6, first:90, second:null },
  { n:'Ким В. А.',      role:'Терапевт',        done:1, first:64, second:71 },
  { n:'Нурлыбек Ж. Т.', role:'Медсестра ОП',    done:4, first:78, second:86 }
];
function viewChief(){
  const mine = COURSES.map(c => cs(c.id)).filter(d => d.attempts.length);
  const myDone = COURSES.filter(c => cs(c.id).passed).length;
  const myFirst = mine.length ? mine[0].attempts[0].pct : null;
  const mySecond = mine.length && mine[0].attempts[1] ? mine[0].attempts[1].pct : null;
  const rows = [{ n:'Вы', role:'Текущий пользователь', done:myDone, first:myFirst, second:mySecond, me:true }, ...DEMO];
  const deltas = rows.filter(r => r.first !== null && r.second !== null).map(r => r.second - r.first);
  const avgD = deltas.length ? Math.round(deltas.reduce((a,b)=>a+b,0)/deltas.length) : null;
  const inCA = rows.filter(r => r.first !== null && r.first < 80 && r.second === null).length;
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Кабинет руководителя</div>
      <h2 style="margin-top:6px">Состояние команды</h2>
      <p class="lead">Ключевая метрика — не факт сдачи, а прирост между первой и повторной попыткой: он показывает, сработали ли корректирующие действия.</p>
    </div></div>
    <div class="grid-2">
      <div class="stat"><div class="v">${rows.length}</div><div class="l">Сотрудников</div></div>
      <div class="stat"><div class="v" style="color:var(--good)">${rows.filter(r=>r.done>=COURSES.length).length}</div><div class="l">Прошли все курсы</div></div>
      <div class="stat"><div class="v" style="color:var(--warn)">${inCA}</div><div class="l">На корректирующих действиях</div></div>
      <div class="stat"><div class="v" style="color:var(--${avgD===null||avgD>=0?'good':'crit'})">${avgD===null?'—':(avgD>=0?'+':'')+avgD}</div><div class="l">Средний прирост, п.п.</div></div>
    </div>
    <div class="tblwrap" style="margin-top:18px"><table>
      <thead><tr><th>Сотрудник</th><th>Должность</th><th>Курсов пройдено</th><th>1-я попытка</th><th>Повторная</th><th>Прогресс</th></tr></thead>
      <tbody>${rows.map(r => {
        const d = (r.first !== null && r.second !== null) ? r.second - r.first : null;
        return `<tr${r.me?' style="background:var(--accent-wash)"':''}>
          <td><b>${esc(r.n)}</b></td><td class="note">${esc(r.role)}</td>
          <td class="num">${r.done} из ${COURSES.length}</td>
          <td class="num">${r.first===null?'—':r.first+'%'}</td>
          <td class="num">${r.second===null?'—':r.second+'%'}</td>
          <td class="num">${d===null?'—':`<span class="delta ${d>=0?'up':'down'}">${d>=0?'+':''}${d} п.п.</span>`}</td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="note" style="margin-top:12px">Строка «Вы» отражает ваш реальный прогресс. Остальные строки — демонстрационные данные.</p>`;
}

/* ================= Источники ================= */
function viewAbout(){
  const items = Object.values(ACTS).map(a => {
    const qn = QUESTIONS.filter(q => ACTS[q.a].id === a.id).length;
    const dirs = [...new Set(QUESTIONS.filter(q => ACTS[q.a].id === a.id).map(q => q.dir))].filter(Boolean)
      .map(id => D_BY_ID[id] ? D_BY_ID[id].title : '').filter(Boolean);
    return `<div class="panel panel-pad">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:240px">
          <h3 style="font-size:16px">${esc(a.title)}</h3>
          <p class="note" style="margin-top:6px">№ ${esc(a.num)} от ${esc(a.date)} · рег. № ${esc(a.reg)}</p>
          ${dirs.length ? `<div class="row" style="gap:6px;margin-top:8px">${dirs.map(t=>`<span class="chip locked">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div style="text-align:right"><div class="delta">${qn}</div><div class="note">вопросов</div></div>
      </div>
      <div class="srcline"><a href="${a.url}" target="_blank" rel="noopener">Открыть полный текст в «Әділет» →</a></div></div>`;
  }).join('');
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Откуда взят материал</div>
      <h2 style="margin-top:6px">Нормативная база</h2>
      <p class="lead">Каждый урок и вопрос привязан к пункту действующего нормативного правового акта. Тексты получены из государственной информационно-правовой системы «Әділет».</p>
    </div></div><div class="stack">${items}</div>
    <div class="panel panel-pad" style="margin-top:18px">
      <div class="eyebrow">Как это устроено</div>
      <p class="note" style="margin-top:10px">Курсы собраны из выгрузки 2479 нормативных правовых актов Министерства здравоохранения РК (состояние ИПС «Әділет» на 1 августа 2026 года). По каждому направлению отобран манифест актов, их текст нарезан на нормы, и по каждой значимой норме подготовлены учебная карточка и вопросы.</p>
      <p class="note" style="margin-top:10px">Добавление нового направления — это новый манифест актов, без изменения логики платформы.</p>
    </div>`;
}

/* ================= Обработчики ================= */
function bind(){
  $$('[data-course-print]').forEach(b => b.addEventListener('click', () => go({ name:'course-print', course:b.dataset.coursePrint })));
  const print = $('#btn-print-course');
  if (print) print.addEventListener('click', () => window.print());
  $$('[data-dir]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); go({ name:'direction', dir:b.dataset.dir }); }));
  $$('[data-course]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); go({ name:'course', course:b.dataset.course }); }));
  $$('[data-lesson]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); go({ name:'lesson', lesson:b.dataset.lesson }); }));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go({ name:b.dataset.go })));
  $$('[data-exam]').forEach(b => b.addEventListener('click', () => startExam(b.dataset.exam)));
  $$('[data-read]').forEach(b => b.addEventListener('click', () => { S.read[b.dataset.read] = true; save(); render(); }));
  $$('[data-drill-course]').forEach(b => b.addEventListener('click', () => {
    const c = C_BY_ID[b.dataset.drillCourse];
    startDrill({ course:c.id, count:10 }, 'Пробный тест: ' + c.title);
  }));
  $$('[data-drill-lesson]').forEach(b => b.addEventListener('click', () => {
    const l = L_BY_ID[b.dataset.drillLesson];
    const pool = QUESTIONS.filter(q => q.l === l.id && !frozen(q.id));
    if (!pool.length) return;
    EX = { mode:'drill', label:'Тема: ' + l.title, qs:shuffle(pool).slice(0,10).map(q => ({ q, order:shuffle([0,1,2,3]) })), i:0, answers:[], left:0, timer:null };
    drawQ();
  }));
  $$('[data-quick]').forEach(b => b.addEventListener('click', () => {
    startDrill({ dir:b.dataset.quick, count:10 }, 'Быстрый тест: ' + D_BY_ID[b.dataset.quick].title);
  }));
  $$('[data-ca]').forEach(cb => cb.addEventListener('change', () => { S.ca[cb.dataset.ca] = cb.checked; save(); render(); }));
  const cad = $('#btn-ca-done');
  if (cad) cad.addEventListener('click', () => {
    const c = C_BY_ID[VIEW.course], d = cs(c.id);
    d.caDone = true; d.caList.forEach(id => S.ca[id] = false); save(); render();
  });
  const cl = $('#btn-clear-search');
  if (cl) cl.addEventListener('click', () => { S.query = ''; $('#search').value = ''; render(); });
  const ds = $('#btn-drill-start');
  if (ds) ds.addEventListener('click', () => {
    const f = readFilter();
    const parts = [f.dir ? D_BY_ID[f.dir].title : 'Все направления', f.level ? LEVELS[f.level].name : null].filter(Boolean);
    startDrill(f, parts.join(' · '));
  });
  ['f-dir','f-course','f-level','f-count'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('change', () => { S.drillFilter = readFilter(); save(); render(); });
  });
}
function readFilter(){
  const g = id => { const e = $('#' + id); return e ? e.value : ''; };
  const f = { dir:g('f-dir'), course:g('f-course'), level:g('f-level'), count:+(g('f-count') || 10) };
  if (f.course && C_BY_ID[f.course] && f.dir && C_BY_ID[f.course].dir !== f.dir) f.course = '';
  return f;
}

/* ================= Старт ================= */
$$('.tab').forEach(t => t.addEventListener('click', () => { stopExam(); S.query = ''; $('#search').value = ''; go({ name:t.dataset.view }); }));
$('#search').addEventListener('input', e => {
  S.query = e.target.value;
  if (VIEW.name !== 'catalog') VIEW = { name:'catalog' };
  render();
  const box = $('#search'); if (box && document.activeElement !== box) box.focus();
});
$('#btn-reset').addEventListener('click', () => {
  if (confirm('Сбросить весь прогресс обучения? Это действие нельзя отменить.')){
    S = blank(); save(); go({ name:'catalog' });
  }
});
render();
