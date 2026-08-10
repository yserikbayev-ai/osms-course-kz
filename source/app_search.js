/* ================= Поиск (п.5) ================= */
function norm(s){ return String(s).toLowerCase().replace(/ё/g,'е'); }
function searchAll(q){
  const t = norm(q).split(/\s+/).filter(Boolean);
  const has = txt => { const n = norm(txt); return t.every(w => n.includes(w)); };
  const res = { courses:[], lessons:[], norms:[], questions:[] };
  COURSES.forEach(c => { const d = D_BY_ID[c.dir];
    if (has(c.title + ' ' + c.intro + ' ' + d.title)) res.courses.push(c); });
  LESSONS.forEach(l => { if (has(l.title + ' ' + l.intro)) res.lessons.push(l); });
  LESSONS.forEach(l => l.cards.forEach(cd => {
    const a = ACTS[cd.a];
    if (has(cd.norm + ' ' + cd.plain + ' ' + a.title + ' ' + a.num)) res.norms.push({ l, cd, a });
  }));
  QUESTIONS.forEach(qq => { if (!frozen(qq.id) && has(qq.q + ' ' + qq.o.join(' '))) res.questions.push(qq); });
  return res;
}
function viewSearch(q){
  const r = searchAll(q);
  const total = r.courses.length + r.lessons.length + r.norms.length + r.questions.length;
  const block = (title, items, html) => items.length
    ? `<div class="panel panel-pad" style="margin-bottom:16px"><div class="eyebrow">${title} · ${items.length}</div>
       <div class="stack" style="margin-top:12px">${html}</div></div>` : '';
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Поиск</div>
      <h2 style="margin-top:6px">${total ? `Найдено ${total}` : 'Ничего не найдено'} по запросу «${esc(q)}»</h2>
      ${total ? '' : '<p class="lead">Попробуйте другое слово — поиск идёт по названиям курсов и уроков, текстам норм, реквизитам актов и формулировкам вопросов.</p>'}
    </div><button class="btn" id="btn-clear-search">Очистить</button></div>
    ${block('Курсы', r.courses, r.courses.map(c => `
      <button class="hit" data-course="${c.id}"><b>${esc(c.title)}</b>
        <span class="note">${esc(D_BY_ID[c.dir].title)} · шаг ${c.step} · ${esc(c.intro)}</span></button>`).join(''))}
    ${block('Уроки', r.lessons, r.lessons.map(l => `
      <button class="hit" data-lesson="${l.id}"><b>${esc(l.title)}</b>
        <span class="note">${esc(C_BY_ID[l.course] ? C_BY_ID[l.course].title : '')} · ${esc(l.intro)}</span></button>`).join(''))}
    ${block('Нормы', r.norms.slice(0,25), r.norms.slice(0,25).map(x => `
      <button class="hit" data-lesson="${x.l.id}"><b>п. ${x.cd.p} · ${esc(x.a.num)}</b>
        <span class="note">${esc(x.cd.norm.slice(0,190))}${x.cd.norm.length>190?'…':''}</span></button>`).join(''))}
    ${block('Вопросы', r.questions.slice(0,25), r.questions.slice(0,25).map(qq => `
      <button class="hit" data-lesson="${qq.l}"><b>${esc(qq.q)}</b>
        <span class="note">${esc(LEVELS[qq.level].name)} · ${esc(C_BY_ID[qq.course] ? C_BY_ID[qq.course].title : '')}</span></button>`).join(''))}`;
}

/* ================= Раздел «Тестирование» (п.6) ================= */
function viewDrillSetup(){
  const f = S.drillFilter || { dir:'', course:'', level:'', count:10 };
  const dirOpts = ['<option value="">Все направления</option>'].concat(
    DIRECTIONS.map(d => `<option value="${d.id}" ${f.dir===d.id?'selected':''}>${esc(d.title)}</option>`)).join('');
  const courseOpts = ['<option value="">Все курсы направления</option>'].concat(
    COURSES.filter(c => !f.dir || c.dir === f.dir)
      .map(c => `<option value="${c.id}" ${f.course===c.id?'selected':''}>${esc(c.title)}</option>`)).join('');
  const lvlOpts = ['<option value="">Любая сложность</option>'].concat(
    [1,2,3].map(n => `<option value="${n}" ${String(f.level)===String(n)?'selected':''}>${LEVELS[n].name} — ${LEVELS[n].hint}</option>`)).join('');
  const pool = drillPool(f);
  const hist = (S.drills || []).slice(-6).reverse();
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Тестирование</div>
      <h2 style="margin-top:6px">Проверка знаний по любой теме</h2>
      <p class="lead">Отдельный тренажёр: соберите тест по нужному направлению, курсу или уровню сложности и пройдите его в любой момент — без привязки к прохождению курсов. Результат не влияет на экзамены.</p>
    </div></div>
    <div class="panel panel-pad">
      <div class="filters">
        <label>Направление<select id="f-dir">${dirOpts}</select></label>
        <label>Курс<select id="f-course">${courseOpts}</select></label>
        <label>Сложность<select id="f-level">${lvlOpts}</select></label>
        <label>Вопросов<select id="f-count">${[5,10,15,20,30].map(n => `<option value="${n}" ${f.count===n?'selected':''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="row" style="margin-top:16px;justify-content:space-between">
        <span class="note">Подходящих вопросов в банке: <b>${pool.length}</b></span>
        <button class="btn primary" id="btn-drill-start" ${pool.length ? '' : 'disabled'}>Начать тест</button>
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      ${DIRECTIONS.map(d => {
        const n = QUESTIONS.filter(q => q.dir === d.id && !frozen(q.id)).length;
        return `<button class="quick" data-quick="${d.id}"><b>${esc(d.title)}</b><span class="note">${n} вопросов · быстрый тест на 10</span></button>`;
      }).join('')}
    </div>
    ${hist.length ? `<div class="panel panel-pad" style="margin-top:18px">
      <div class="eyebrow">Ваши последние тесты</div>
      <div class="grid-2" style="margin-top:12px">${hist.map(h => `
        <div class="stat ${h.pct>=80?'pass':''}"><div class="v">${h.pct}%</div>
        <div class="l">${esc(h.label)} · ${h.right} из ${h.total}</div></div>`).join('')}</div></div>` : ''}`;
}
function drillPool(f){
  return QUESTIONS.filter(q => !frozen(q.id)
    && (!f.dir || q.dir === f.dir)
    && (!f.course || q.course === f.course)
    && (!f.level || String(q.level) === String(f.level)));
}
