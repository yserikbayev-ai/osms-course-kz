/* ================= Экзамен и тренажёр ================= */
let EX = null;
function startExam(courseId){
  const c = C_BY_ID[courseId];
  const pool = shuffle(courseQuestions(c)).slice(0, examSize(c));
  EX = { mode:'exam', course:c.id, label:c.title, qs:pool.map(q => ({ q, order:shuffle([0,1,2,3]) })),
         i:0, answers:[], left:Math.max(10, pool.length*90), timer:null };
  tick(); drawQ();
}
function startDrill(filter, label){
  const pool = shuffle(drillPool(filter)).slice(0, filter.count || 10);
  if (!pool.length) return;
  EX = { mode:'drill', label, qs:pool.map(q => ({ q, order:shuffle([0,1,2,3]) })),
         i:0, answers:[], left:0, timer:null };
  drawQ();
}
function tick(){
  clearInterval(EX.timer);
  EX.timer = setInterval(() => {
    EX.left--;
    const t = $('#timer');
    if (t){ t.textContent = fmt(EX.left); t.classList.toggle('low', EX.left <= 120); }
    if (EX.left <= 0){ clearInterval(EX.timer); finish(true); }
  }, 1000);
}
function stopExam(){ if (EX){ clearInterval(EX.timer); EX = null; } }

function drawQ(){
  const it = EX.qs[EX.i], q = it.q, a = ACTS[q.a];
  const chosen = EX.answers[EX.i], answered = chosen !== undefined;
  const opts = it.order.map((oi,k) => {
    const isRight = oi === q.c, isChosen = chosen === oi;
    let cls = 'opt';
    if (answered && isRight) cls += ' right'; else if (answered && isChosen) cls += ' wrong';
    return `<button class="${cls}" data-o="${oi}" ${answered?'disabled':''} aria-pressed="${isChosen?'true':'false'}">
      <span class="k">${'АБВГ'[k]}</span><span>${esc(q.o[oi])}</span></button>`;
  }).join('');
  const explain = answered ? `<div class="explain">
      <div class="row" style="gap:8px;margin-bottom:8px">
        <span class="chip ${chosen===q.c?'done':'crit'}">${chosen===q.c?'Верно':'Неверно'}</span>
        <span class="pt">п. ${q.p}</span>${levelChip(q.level)}
      </div>
      <p class="t">${esc(q.e)}</p>
      <div class="srcline"><span>${actLine(a)}</span>
        <a href="${a.url}" target="_blank" rel="noopener">Первоисточник →</a>
        <button class="btn sm ghost" id="btn-complain" style="margin-left:auto">Оспорить вопрос</button></div>
      <div id="complain-msg" class="note" style="margin-top:8px"></div></div>` : '';
  const last = EX.i === EX.qs.length - 1;
  $('#app').innerHTML = `
    <div class="exam-top">
      <span class="eyebrow">${EX.mode==='exam'?'Экзамен':'Тест'} · ${esc(EX.label)}</span>
      <span class="qnum">Вопрос ${EX.i+1} из ${EX.qs.length}</span>
      <div class="meter" style="flex:1;min-width:110px"><i style="width:${EX.i/EX.qs.length*100}%"></i></div>
      ${EX.mode==='exam' ? `<span class="timer${EX.left<=120?' low':''}" id="timer">${fmt(EX.left)}</span>` : ''}
      <button class="btn sm ghost" id="btn-quit">Выйти</button>
    </div>
    <div class="panel panel-pad qbody">
      <p class="qtext">${esc(q.q)}</p>
      <div class="opts">${opts}</div>${explain}
      <div class="exam-foot">
        <button class="btn primary" id="btn-next" ${answered?'':'disabled'}>${last?'Завершить':'Следующий вопрос'}</button>
        <span class="note">${answered?'':'Выберите один вариант'}</span>
      </div></div>`;
  $$('.opt').forEach(b => b.addEventListener('click', () => {
    if (EX.answers[EX.i] !== undefined) return;
    EX.answers[EX.i] = +b.dataset.o; drawQ();
  }));
  $('#btn-next').addEventListener('click', () => { if (last) finish(false); else { EX.i++; drawQ(); scrollTop(); } });
  $('#btn-quit').addEventListener('click', () => {
    const back = EX.mode === 'exam' ? { name:'course', course:EX.course } : { name:'drill' };
    stopExam(); go(back);
  });
  const bc = $('#btn-complain');
  if (bc) bc.addEventListener('click', () => {
    S.complaints[q.id] = (S.complaints[q.id]||0) + 1; save();
    const n = S.complaints[q.id];
    $('#complain-msg').textContent = n >= COMPLAINTS_TO_FREEZE
      ? `Жалоба принята (${n}). Вопрос заморожен и больше не выдаётся до разбора администратором.`
      : `Жалоба принята (${n} из ${COMPLAINTS_TO_FREEZE}). При ${COMPLAINTS_TO_FREEZE} жалобах вопрос замораживается.`;
    bc.disabled = true;
  });
}

function finish(byTime){
  clearInterval(EX.timer);
  let right = 0; const wrongByLesson = {}, wrongQs = [];
  EX.qs.forEach((it,i) => {
    if (EX.answers[i] === it.q.c) right++;
    else { wrongByLesson[it.q.l] = (wrongByLesson[it.q.l]||0) + 1; wrongQs.push(it.q); }
  });
  const total = EX.qs.length, pct = Math.round(right/total*100), pass = right/total >= PASS;
  const isExam = EX.mode === 'exam', label = EX.label, courseId = EX.course;
  let delta = null;
  if (isExam){
    const d = cs(courseId);
    d.attempts.push({ pct, right, total, pass, wrongByLesson, byTime });
    if (pass){ d.passed = true; d.caDone = true; }
    else { d.caList = Object.keys(wrongByLesson); d.caDone = false; d.caList.forEach(id => S.ca[id] = false); }
    if (d.attempts.length > 1) delta = pct - d.attempts[d.attempts.length-2].pct;
  } else {
    S.drills = (S.drills||[]).concat([{ pct, right, total, label }]).slice(-20);
  }
  save();

  const breakdown = wrongQs.length ? `<div class="panel panel-pad"><div class="eyebrow">Разбор ошибок</div>
      <div style="margin-top:14px">${wrongQs.map(q => { const a = ACTS[q.a];
        return `<div class="norm"><div class="norm-h"><span class="pt">п. ${q.p}</span><span class="src">${esc(a.title)}</span></div>
          <div class="norm-b"><p style="font-weight:600;font-size:15px">${esc(q.q)}</p>
          <div class="plain" style="margin-top:10px"><b>Верно</b><span>${esc(q.o[q.c])}</span></div>
          <p class="note" style="margin-top:10px;color:var(--ink-2)">${esc(q.e)}</p>
          <div class="srcline"><span>№ ${esc(a.num)} от ${esc(a.date)}</span>
            <a href="${a.url}" target="_blank" rel="noopener">Первоисточник →</a>
            <button class="btn sm ghost" data-lesson="${q.l}" style="margin-left:auto">К уроку</button></div>
          </div></div>`; }).join('')}</div></div>` : '';

  $('#app').innerHTML = `<div class="hd"><div class="grow">
      <div class="eyebrow">${isExam?'Результат экзамена':'Результат теста'} · ${esc(label)}</div>
      <h2 style="margin-top:6px">${isExam ? (pass?'Курс пройден':'Порог не достигнут') : `${pct}% верных ответов`}</h2>
      <p class="lead">${byTime?'Время истекло, засчитаны данные ответы. ':''}${
        isExam ? (pass ? 'Результат сохранён. Остальные курсы доступны в любом порядке.'
                       : `Для сдачи нужно не менее ${Math.round(PASS*100)}%. Назначены корректирующие действия по темам с ошибками.`)
               : 'Тренировочный тест не влияет на прохождение курсов — он для самопроверки.'}</p>
    </div></div>
    <div class="grid-2">
      <div class="stat ${pass?'pass':(isExam?'fail':'')}"><div class="v">${pct}%</div><div class="l">Результат</div></div>
      <div class="stat"><div class="v">${right}<span style="font-size:18px;color:var(--ink-3)"> / ${total}</span></div><div class="l">Верных ответов</div></div>
      ${isExam ? `<div class="stat"><div class="v">${Math.round(PASS*100)}%</div><div class="l">Проходной порог</div></div>
      <div class="stat"><div class="v" style="${delta===null?'':'color:var(--'+(delta>=0?'good':'crit')+')'}">${delta===null?'—':(delta>=0?'+':'')+delta}</div>
        <div class="l">${delta===null?'Первая попытка — база для сравнения':'Прогресс к прошлой попытке, п.п.'}</div></div>` : ''}
    </div>
    <div class="row">
      ${isExam ? `<button class="btn primary" data-course="${courseId}">Вернуться к курсу</button>` : `<button class="btn primary" data-go="drill">К тестированию</button>`}
      <button class="btn" data-go="catalog">В каталог</button>
    </div>${breakdown}`;
  EX = null;
  bind();
  scrollTop();
}
