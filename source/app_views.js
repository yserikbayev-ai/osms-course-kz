/* ================= Каталог по направлениям (п.1, п.2) ================= */
function viewCatalog(){
  const q = (S.query || '').trim();
  if (q) return viewSearch(q);
  const cards = DIRECTIONS.map(d => {
    const cl = dirCourses(d.id), p = dirProgress(d.id), next = nextRecommended(d.id);
    const qn = cl.reduce((s,c) => s + courseQuestions(c).length, 0);
    return `<button class="dircard" data-dir="${d.id}">
      <span class="dirmark">${esc(d.icon)}</span>
      <span class="dirbody">
        <span class="row" style="gap:8px"><h3>${esc(d.title)}</h3>
          ${p.done ? `<span class="chip done">${p.done} из ${p.total}</span>` : `<span class="chip locked">${cl.length} ${cl.length===1?'курс':'курса'}</span>`}</span>
        <span class="note">${esc(d.desc)}</span>
        <span class="meter" style="margin-top:10px"><i style="width:${p.pct}%"></i></span>
        <span class="note" style="margin-top:8px;display:block">${qn} вопросов${next ? ` · далее: ${esc(next.title)}` : ' · направление пройдено'}</span>
      </span></button>`;
  }).join('');
  const totalQ = QUESTIONS.filter(q2 => !frozen(q2.id)).length;
  const passed = COURSES.filter(c => cs(c.id).passed).length;
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Каталог обучения</div>
      <h2 style="margin-top:6px">Направления деятельности</h2>
      <p class="lead">Выберите направление своей работы. Внутри направления курсы выстроены в рекомендованном порядке, но проходить их можно в любой последовательности — ничего не блокируется.</p>
    </div></div>
    <div class="grid-2" style="margin-bottom:18px">
      <div class="stat"><div class="v">${DIRECTIONS.length}</div><div class="l">Направлений</div></div>
      <div class="stat"><div class="v">${COURSES.length}</div><div class="l">Курсов</div></div>
      <div class="stat"><div class="v">${totalQ}</div><div class="l">Вопросов в банке</div></div>
      <div class="stat"><div class="v" style="color:var(--good)">${passed}</div><div class="l">Курсов пройдено вами</div></div>
    </div>
    <div class="dirgrid">${cards}</div>`;
}

/* ================= Направление: маршрут курсов ================= */
function viewDirection(dirId){
  const d = D_BY_ID[dirId], cl = dirCourses(dirId), next = nextRecommended(dirId);
  const items = cl.map(c => {
    const st = courseState(c), data = cs(c.id);
    const last = data.attempts[data.attempts.length-1];
    const lv = courseLevels(c).map(levelChip).join(' ');
    const rec = next && next.id === c.id;
    const chip = st === 'done' ? '<span class="chip done">Пройден</span>'
      : st === 'progress' ? '<span class="chip warn">В процессе</span>' : '<span class="chip open">Доступен</span>';
    return `<div class="panel course ${rec ? 'rec' : ''}">
      <div class="panel-pad">
        <div class="row" style="gap:9px;margin-bottom:4px">
          <span class="stepn">Шаг ${c.step}</span>${chip}${rec ? '<span class="chip rec">Рекомендуем начать отсюда</span>' : ''}
        </div>
        <h3 style="font-size:17px">${esc(c.title)}</h3>
        <p class="note" style="margin-top:6px">${esc(c.intro)}</p>
        <div class="row" style="gap:6px;margin-top:10px">${lv}
          <span class="note">${courseLessons(c).length} ${courseLessons(c).length===1?'урок':'урока'} · ${courseQuestions(c).length} вопросов${last ? ` · последний результат ${last.pct}%` : ''}</span></div>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-course="${c.id}">${st==='new'?'Начать курс':'Открыть курс'}</button>
          <button class="btn" data-drill-course="${c.id}">Пробный тест по курсу</button>
        </div>
      </div></div>`;
  }).join('');
  return `<div class="hd">
      <div class="grow">
        <div class="eyebrow">Направление</div>
        <h2 style="margin-top:6px">${esc(d.title)}</h2>
        <p class="lead">${esc(d.desc)}</p>
      </div>
      <button class="btn" data-go="catalog">← Все направления</button></div>
    <div class="stack">${items}</div>`;
}

/* ================= Курс ================= */
function viewCourse(courseId){
  const c = C_BY_ID[courseId], d = D_BY_ID[c.dir], data = cs(c.id);
  const ls = courseLessons(c);
  const tries = data.attempts.length, last = data.attempts[tries-1];
  const needCA = !data.passed && tries > 0 && !data.caDone;
  const lessons = ls.map((l, i) => {
    const done = !!S.read[l.id];
    return `<div class="panel"><div class="panel-pad" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div class="row" style="gap:8px">
          <span class="stepn">Урок ${i+1}</span>${levelChip(l.level)}${done ? '<span class="chip done">Изучен</span>' : ''}
          ${l.video ? '<span class="chip video">Видео</span>' : ''}
        </div>
        <h3 style="font-size:16.5px;margin-top:7px">${esc(l.title)}</h3>
        <p class="note" style="margin-top:6px">${esc(l.intro)}</p>
        <p class="note" style="margin-top:6px;color:var(--ink-3)">${l.cards.length} норм · ${QUESTIONS.filter(q => q.l===l.id).length} вопросов</p>
      </div>
      <button class="btn" data-lesson="${l.id}">${done ? 'Повторить' : 'Изучить'}</button>
    </div></div>`;
  }).join('');

  let status = '';
  if (data.passed) status = `<div class="panel panel-pad" style="border-color:var(--good)">
      <div class="eyebrow" style="color:var(--good)">Курс пройден</div>
      <p style="margin-top:6px;font-size:15px">Последний результат — <b>${last.pct}%</b> (${last.right} из ${last.total}).</p></div>`;
  else if (needCA) status = renderCA(c, data, last);

  const history = tries ? `<div class="panel panel-pad"><div class="eyebrow">История попыток</div>
      <div class="grid-2" style="margin-top:12px">${data.attempts.map((a,i) => `
        <div class="stat ${a.pass?'pass':'fail'}"><div class="v">${a.pct}%</div>
        <div class="l">Попытка ${i+1} · ${a.right} из ${a.total}${i>0 ? ` · <span class="delta ${a.pct-data.attempts[i-1].pct>=0?'up':'down'}">${a.pct-data.attempts[i-1].pct>=0?'+':''}${a.pct-data.attempts[i-1].pct} п.п.</span>` : ''}</div></div>`).join('')}
      </div></div>` : '';

  return `<div class="hd">
      <div class="grow">
        <div class="eyebrow"><a href="#" data-dir="${d.id}" class="crumb">${esc(d.title)}</a> · шаг ${c.step}</div>
        <h2 style="margin-top:6px">${esc(c.title)}</h2>
        <p class="lead">${esc(c.intro)}</p>
      </div>
      <button class="btn" data-dir="${d.id}">← К направлению</button></div>
    ${status}
    <div class="stack">${lessons}</div>
    <div class="panel panel-pad" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <h3 style="font-size:16.5px">Экзамен курса</h3>
        <p class="note" style="margin-top:5px">${examSize(c)} вопросов, проходной порог ${Math.round(PASS*100)}%. Попытки не ограничены${needCA ? '. Сейчас назначены корректирующие действия' : ''}.</p>
      </div>
      <button class="btn primary" data-exam="${c.id}" ${needCA?'disabled':''}>Начать экзамен</button>
    </div>
    ${history}`;
}

/* ================= Урок (с видео, п.3) ================= */
function viewLesson(lessonId){
  const l = L_BY_ID[lessonId], c = C_BY_ID[l.course];
  const video = l.video
    ? `<div class="panel videoblock"><div class="ratio"><iframe src="${esc(l.video)}" title="Видеоурок: ${esc(l.title)}" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div></div>`
    : `<div class="panel panel-pad videostub">
         <div class="row" style="gap:12px"><span class="vicon">▶</span>
         <div><b style="font-size:15px">Видеоурок готовится</b>
         <p class="note" style="margin-top:3px">Место под запись зарезервировано: как только видео появится, оно встанет сюда без изменения курса.</p></div></div>
       </div>`;
  const cards = l.cards.map(cd => {
    const a = ACTS[cd.a];
    return `<div class="norm">
      <div class="norm-h"><span class="pt">п. ${cd.p}</span><span class="src">${esc(a.title)}</span></div>
      <div class="norm-b">
        <div class="quote">${esc(cd.norm)}</div>
        <div class="plain"><b>На практике</b><span>${esc(cd.plain)}</span></div>
        <div class="srcline"><span>№ ${esc(a.num)} от ${esc(a.date)} · рег. № ${esc(a.reg)}</span>
          <a href="${a.url}" target="_blank" rel="noopener">Открыть акт в «Әділет» →</a></div>
      </div></div>`;
  }).join('');
  return `<div class="hd">
      <div class="grow">
        <div class="eyebrow"><a href="#" data-course="${c.id}" class="crumb">${esc(c.title)}</a></div>
        <h2 style="margin-top:6px">${esc(l.title)}</h2>
        <p class="lead">${esc(l.intro)}</p>
        <div class="row" style="gap:6px;margin-top:8px">${levelChip(l.level)}</div>
      </div>
      <button class="btn" data-course="${c.id}">← К курсу</button></div>
    ${video}${cards}
    <div class="panel panel-pad row" style="justify-content:space-between">
      <span class="note">Отметьте урок изученным, когда разберётесь с нормами</span>
      <div class="row">
        <button class="btn" data-drill-lesson="${l.id}">Проверить себя по теме</button>
        <button class="btn primary" data-read="${l.id}">${S.read[l.id] ? 'Отмечен как изученный' : 'Отметить изученным'}</button>
      </div>
    </div>`;
}

/* ================= Корректирующие действия ================= */
function renderCA(c, data, last){
  const items = data.caList.map(id => L_BY_ID[id]).filter(Boolean);
  return `<div class="ca">
    <div class="eyebrow" style="color:var(--warn)">Корректирующие действия</div>
    <h3 style="margin-top:6px">Попытка не засчитана: ${last.pct}% при пороге ${Math.round(PASS*100)}%</h3>
    <p class="note" style="margin-top:8px;color:var(--ink-2)">Повторный экзамен откроется после того, как вы отметите выполненными корректирующие действия — повторить нужно только темы, где были ошибки.</p>
    <ul class="calist">${items.map(l => `
      <li><input type="checkbox" data-ca="${l.id}" ${S.ca[l.id]?'checked':''} id="ca-${l.id}">
        <label for="ca-${l.id}" style="flex:1;cursor:pointer">
          <div class="n">${esc(l.title)}</div>
          <div class="s">Ошибок в этой теме: ${last.wrongByLesson[l.id] || 0}</div>
        </label>
        <button class="btn sm" data-lesson="${l.id}">Повторить</button></li>`).join('')}
    </ul>
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="btn-ca-done" ${items.every(l => S.ca[l.id]) ? '' : 'disabled'}>Корректирующие действия выполнены</button>
      <span class="note">Отмечено ${items.filter(l => S.ca[l.id]).length} из ${items.length}</span>
    </div></div>`;
}
