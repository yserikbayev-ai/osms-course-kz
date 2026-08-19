/* ===== API ===== */
const api = async (path, data) => {
  const r = await fetch(path, data ? {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  } : {});
  if (r.status === 401) { ME = {auth:false}; renderAuth(); throw new Error('unauth'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || 'Ошибка запроса');
  return j;
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = t => String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
const scrollTop = () => window.scrollTo({top:0,behavior:'smooth'});

/* ===== состояние ===== */
let ME = {auth:false}, C = null, P = null, VIEW = {name:'catalog'}, EX = null, SEARCH = '';
const LEVELS = {1:'Базовый',2:'Продвинутый',3:'Экспертный'};
const PASS = 0.8;

const courseById  = id => C.courses.find(c => c.code === id);
const lessonById  = id => C.lessons.find(l => l.code === id);
const dirById     = id => C.directions.find(d => d.code === id);
const dirCourses  = d => C.courses.filter(c => c.direction_code === d).sort((a,b)=>a.step-b.step);
const courseLessons = c => C.lessons.filter(l => l.course_code === c.code);
const courseQ     = c => courseLessons(c).reduce((s,l)=>s+(l.questions||0),0);
const attemptsOf  = c => (P.attempts[c] || []);
const passedC     = c => attemptsOf(c).some(a => a.passed);
const caOf        = c => P.corrective.filter(x => x.course_code === c);
const certOf      = c => P.certificates.find(x => x.course_code === c);
const readL       = l => P.read.includes(l);
const levelChip   = n => `<span class="chip lvl${n}">${LEVELS[n]}</span>`;

function dirProgress(d){
  const cl = dirCourses(d), done = cl.filter(c => passedC(c.code)).length;
  return {done, total: cl.length, pct: cl.length ? Math.round(done/cl.length*100) : 0};
}
function courseState(c){
  if (passedC(c.code)) return 'done';
  if (attemptsOf(c.code).length || courseLessons(c).some(l => readL(l.code))) return 'progress';
  return 'new';
}
const STATE_CHIP = {done:'<span class="chip done">Пройден</span>',
                    progress:'<span class="chip open">В процессе</span>',
                    new:'<span class="chip locked">Не начат</span>'};

/* ===== вход и регистрация ===== */
function renderAuth(mode = 'login'){
  document.body.classList.add('authmode');
  const roles = (ME.roles || []).map(r => `<option value="${esc(r.code)}">${esc(r.title)}</option>`).join('');
  $('#app').innerHTML = `
   <div class="authwrap">
    <div class="panel authcard">
      <div class="eyebrow">Обучение медперсонала по НПА РК</div>
      <h2 style="margin-top:8px">${mode==='login'?'Вход в систему':'Регистрация'}</h2>
      <p class="note" style="margin-top:6px">${mode==='login'
        ? 'Введите e-mail и пароль. Прогресс обучения хранится на сервере и доступен с любого устройства.'
        : 'Первый зарегистрированный сотрудник организации получает права руководителя — он видит отчёт по команде.'}</p>
      <div class="formgrid" style="margin-top:16px">
        ${mode==='reg' ? `
          <label>Фамилия, имя, отчество<input id="f-name" autocomplete="name" placeholder="Серикбаев Ержан Оралбекович"></label>
          <label>Медицинская организация<input id="f-org" placeholder="ТОО «Моя Семейная амбулатория»"></label>
          <label>Должность / специальность<select id="f-role"><option value="">— не указана —</option>${roles}</select></label>
          <label>Подразделение<input id="f-dep" placeholder="Терапевтическое отделение"></label>
          <label>Телефон<input id="f-phone" autocomplete="tel" placeholder="+7 701 000 00 00"></label>` : ''}
        <label>E-mail<input id="f-email" type="email" autocomplete="email" placeholder="doctor@clinic.kz"></label>
        <label>Пароль<input id="f-pass" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" placeholder="не короче 6 символов"></label>
      </div>
      <div id="auth-err" class="autherr"></div>
      <div class="row" style="margin-top:16px;gap:12px">
        <button class="btn primary" id="btn-auth">${mode==='login'?'Войти':'Зарегистрироваться'}</button>
        <button class="linkbtn" id="btn-switch">${mode==='login'?'Нет учётной записи — зарегистрироваться':'Уже есть учётная запись — войти'}</button>
      </div>
    </div>
   </div>`;
  $('#btn-switch').onclick = () => renderAuth(mode==='login'?'reg':'login');
  $('#btn-auth').onclick = async () => {
    const err = $('#auth-err');
    err.textContent = '';
    try {
      if (mode === 'login') {
        await api('/api/login', {email:$('#f-email').value, password:$('#f-pass').value});
      } else {
        await api('/api/register', {
          full_name:$('#f-name').value, org_name:$('#f-org').value, role_code:$('#f-role').value,
          department:$('#f-dep').value, phone:$('#f-phone').value,
          email:$('#f-email').value, password:$('#f-pass').value
        });
      }
      await boot();
    } catch(e) { err.textContent = e.message; }
  };
  $$('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-auth').click(); }));
}

/* ===== загрузка ===== */
async function boot(){
  ME = await api('/api/me');
  if (!ME.auth) { renderAuth(); return; }
  document.body.classList.remove('authmode');
  [C, P] = await Promise.all([api('/api/content'), api('/api/progress')]);
  $('#userbar').innerHTML = `
    <span class="who"><b>${esc(ME.user.full_name)}</b><span>${esc(ME.user.role || 'должность не указана')} · ${esc(ME.user.org)}</span></span>
    <button class="linkbtn" id="btn-out">Выйти</button>`;
  $('#btn-out').onclick = async () => { await api('/api/logout', {}); location.reload(); };
  VIEW = {name:'catalog'};
  render();
}
async function refresh(){ P = await api('/api/progress'); }

/* ===== рендер ===== */
function render(){
  $$('.tab').forEach(t => t.setAttribute('aria-selected',
     String(['catalog','drill','chief','about'].includes(VIEW.name) ? t.dataset.view===VIEW.name : t.dataset.view==='catalog')));
  const v = VIEW, el = $('#app');
  if (SEARCH.trim().length > 1) { el.innerHTML = viewSearch(SEARCH.trim()); bind(); return; }
  if (v.name==='catalog')   el.innerHTML = viewCatalog();
  else if (v.name==='direction') el.innerHTML = viewDirection(v.dir);
  else if (v.name==='course')    el.innerHTML = viewCourse(v.course);
  else if (v.name==='lesson')    el.innerHTML = viewLesson(v.lesson, v.back);
  else if (v.name==='drill')     el.innerHTML = viewDrill();
  else if (v.name==='chief')     el.innerHTML = viewChief();
  else if (v.name==='about')     el.innerHTML = viewAbout();
  bind();
}
const go = v => { VIEW = v; SEARCH=''; $('#search').value=''; render(); scrollTop(); };

/* ===== каталог ===== */
function viewCatalog(){
  const all = C.courses.length, done = C.courses.filter(c=>passedC(c.code)).length;
  const nextUp = C.courses.filter(c => !passedC(c.code)).sort((a,b)=>a.step-b.step).slice(0,3);
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Каталог обучения</div>
      <h2 style="margin-top:6px">Направления деятельности</h2>
      <p class="lead">Курсы сгруппированы по направлениям работы медицинской организации. Порядок прохождения свободный: можно начать с любого курса, а подсказка «рекомендуем начать» показывает логичный маршрут.</p>
    </div></div>
    <div class="grid-2">
      <div class="stat"><div class="v">${done}<span style="font-size:18px;color:var(--ink-3)"> / ${all}</span></div><div class="l">Курсов пройдено</div></div>
      <div class="stat"><div class="v">${C.directions.length}</div><div class="l">Направлений</div></div>
      <div class="stat"><div class="v">${C.lessons.reduce((s,l)=>s+(l.questions||0),0)}</div><div class="l">Вопросов в банке</div></div>
      <div class="stat"><div class="v">${P.certificates.length}</div><div class="l">Сертификатов</div></div>
    </div>
    ${nextUp.length ? `<div class="panel panel-pad">
      <div class="eyebrow">Рекомендуем продолжить</div>
      <div class="quick" style="margin-top:12px">${nextUp.map(c=>`
        <button class="btn sm" data-course="${c.code}">${esc(c.title)}</button>`).join('')}</div>
    </div>` : ''}
    <div class="dirgrid">${C.directions.map(d => {
      const p = dirProgress(d.code), cl = dirCourses(d.code);
      return `<button class="dircard" data-dir="${d.code}">
        <div class="dirmark">${esc(d.icon||'')}</div>
        <div class="dirbody">
          <h3>${esc(d.title)}</h3>
          <p class="note">${esc(d.descr||'')}</p>
          <div class="row" style="gap:8px;margin-top:10px">
            <span class="chip ${p.pct===100?'done':'open'}">${p.done} из ${p.total} курсов</span>
            <span class="note">${cl.reduce((s,c)=>s+courseQ(c),0)} вопросов</span>
          </div>
          <div class="meter" style="margin-top:9px"><i style="width:${p.pct}%"></i></div>
        </div></button>`;
    }).join('')}</div>`;
}

function viewDirection(dcode){
  const d = dirById(dcode), cl = dirCourses(dcode), next = cl.find(c => !passedC(c.code));
  return `<div class="crumb"><button class="linkbtn" data-go="catalog">Каталог</button> → ${esc(d.title)}</div>
    <div class="hd"><div class="grow">
      <div class="eyebrow">Направление</div>
      <h2 style="margin-top:6px">${esc(d.title)}</h2>
      <p class="lead">${esc(d.descr||'')}</p>
    </div></div>
    <div class="stack">${cl.map(c => {
      const st = courseState(c), att = attemptsOf(c.code), last = att[att.length-1];
      const rec = next && next.code===c.code && st!=='done';
      const lv = [...new Set(courseLessons(c).map(l=>l.level))].sort();
      return `<div class="panel course${rec?' rec':''}">
        <div class="panel-pad">
          <div class="row" style="gap:10px;align-items:flex-start">
            <span class="stepn">${c.step}</span>
            <div style="flex:1;min-width:200px">
              <div class="row" style="gap:8px">
                <h3 style="font-size:16.5px">${esc(c.title)}</h3>${STATE_CHIP[st]}
                ${rec?'<span class="chip rec">Рекомендуем начать</span>':''}
              </div>
              <p class="note" style="margin-top:6px">${esc(c.intro||'')}</p>
              <div class="row" style="gap:6px;margin-top:9px">
                ${lv.map(levelChip).join('')}
                <span class="note">${courseLessons(c).length} тем · ${courseQ(c)} вопросов</span>
                ${last?`<span class="note">· последняя попытка ${last.pct}%</span>`:''}
              </div>
            </div>
            <button class="btn primary sm" data-course="${c.code}">Открыть</button>
          </div>
        </div></div>`;
    }).join('')}</div>`;
}

/* ===== курс ===== */
function viewCourse(ccode){
  const c = courseById(ccode), d = dirById(c.direction_code);
  const att = attemptsOf(ccode), last = att[att.length-1], ca = caOf(ccode), cert = certOf(ccode);
  const ls = courseLessons(c);
  const blocked = ca.length > 0;
  return `<div class="crumb"><button class="linkbtn" data-go="catalog">Каталог</button> →
      <button class="linkbtn" data-dir="${d.code}">${esc(d.title)}</button> → ${esc(c.title)}</div>
    <div class="hd"><div class="grow">
      <div class="eyebrow">Курс · шаг ${c.step} в направлении</div>
      <h2 style="margin-top:6px">${esc(c.title)}</h2>
      <p class="lead">${esc(c.intro||'')}</p>
    </div></div>
    ${cert ? `<div class="panel panel-pad" style="border-color:var(--good)">
      <div class="eyebrow" style="color:var(--good)">Курс пройден</div>
      <p style="margin-top:6px;font-size:15px">Сертификат <b>${esc(cert.code)}</b> · результат ${cert.pct}% · действителен до ${esc(cert.valid_until)}</p>
    </div>` : ''}
    ${blocked ? renderCA(c, ca, last) : ''}
    <div class="stack">${ls.map(l => `
      <div class="panel"><div class="panel-pad" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div class="row" style="gap:8px">
            <h3 style="font-size:16px">${esc(l.title)}</h3>${levelChip(l.level)}
            ${readL(l.code)?'<span class="chip done">Изучена</span>':''}
            ${l.video_url?'<span class="chip vid">Видео</span>':''}
          </div>
          <p class="note" style="margin-top:6px">${esc(l.intro||'')}</p>
          <p class="note" style="margin-top:5px;color:var(--ink-3)">${(l.cards||[]).length} норм · ${l.questions||0} вопросов</p>
        </div>
        <button class="btn sm" data-lesson="${l.code}">${readL(l.code)?'Повторить':'Изучить'}</button>
      </div></div>`).join('')}</div>
    <div class="panel panel-pad" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <h3 style="font-size:16.5px">Экзамен по курсу</h3>
        <p class="note" style="margin-top:5px">${Math.min(20,courseQ(c))} вопросов из ${courseQ(c)}, проходной порог 80%. Попытка ${att.length+1}.
        ${blocked?'<b> Сначала выполните корректирующие действия.</b>':''}</p>
      </div>
      <button class="btn primary" id="btn-exam" data-course="${c.code}" ${blocked?'disabled':''}>Начать экзамен</button>
    </div>
    ${att.length ? `<div class="panel panel-pad">
      <div class="eyebrow">История попыток</div>
      <div class="grid-2" style="margin-top:12px">${att.map((a,i)=>`
        <div class="stat ${a.passed?'pass':'fail'}">
          <div class="v">${a.pct}%</div>
          <div class="l">Попытка ${i+1}${i>0?` · <span class="delta ${a.pct-att[i-1].pct>=0?'up':'down'}">${a.pct-att[i-1].pct>=0?'+':''}${a.pct-att[i-1].pct} п.п.</span>`:''}</div>
        </div>`).join('')}</div></div>` : ''}`;
}

function renderCA(c, ca, last){
  return `<div class="ca">
    <div class="eyebrow" style="color:var(--warn)">Корректирующие действия</div>
    <h3 style="margin-top:6px">Попытка не засчитана${last?`: ${last.pct}% при пороге 80%`:''}</h3>
    <p class="note" style="margin-top:8px;color:var(--ink-2)">Повторный экзамен откроется после повторения тем, в которых были ошибки. Курс целиком проходить заново не нужно.</p>
    <ul class="calist">${ca.map(x => {
      const l = lessonById(x.lesson_code);
      return `<li>
        <div style="flex:1">
          <div class="n">${esc(l?l.title:x.lesson_code)}</div>
          <div class="s">Ошибок в теме: ${x.errors}</div>
        </div>
        <button class="btn sm" data-lesson="${x.lesson_code}">Повторить</button>
        <button class="btn sm primary" data-cadone="${x.lesson_code}" data-course="${c.code}">Выполнено</button>
      </li>`;
    }).join('')}</ul></div>`;
}

/* ===== урок ===== */
function viewLesson(code, back){
  const l = lessonById(code), c = courseById(l.course_code), d = dirById(c.direction_code);
  const video = l.video_url
    ? `<div class="panel videoblock"><div class="ratio"><iframe src="${esc(l.video_url)}" title="Видеоурок: ${esc(l.title)}" allowfullscreen loading="lazy"></iframe></div></div>`
    : `<div class="panel videostub"><div class="vicon">▶</div><div><b>Видеоурок</b>
        <p class="note" style="margin-top:3px">Место под запись зарезервировано: как только видео появится, оно встанет сюда без изменения курса.</p></div></div>`;
  return `<div class="crumb"><button class="linkbtn" data-go="catalog">Каталог</button> →
      <button class="linkbtn" data-dir="${d.code}">${esc(d.title)}</button> →
      <button class="linkbtn" data-course="${c.code}">${esc(c.title)}</button> → ${esc(l.title)}</div>
    <div class="hd"><div class="grow">
      <div class="row" style="gap:8px"><div class="eyebrow">Тема</div>${levelChip(l.level)}</div>
      <h2 style="margin-top:6px">${esc(l.title)}</h2>
      <p class="lead">${esc(l.intro||'')}</p>
    </div><button class="btn" data-course="${c.code}">← К курсу</button></div>
    ${video}
    ${(l.cards||[]).map(card => {
      const a = C.acts[card.act_code] || {};
      return `<div class="norm">
        <div class="norm-h"><span class="pt">п. ${card.point}</span><span class="src">${esc(a.title||'')}</span></div>
        <div class="norm-b">
          <div class="quote">${esc(card.norm)}</div>
          <div class="plain"><b>На практике</b><span>${esc(card.plain||'')}</span></div>
          <div class="srcline"><span>№ ${esc(a.num||'')} от ${esc(a.act_date||'')}${a.reg?` · рег. № ${esc(a.reg)}`:''}</span>
            ${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">Открыть акт в «Әділет» →</a>`:''}</div>
        </div></div>`;
    }).join('')}
    <div class="panel panel-pad row" style="justify-content:space-between">
      <span class="note">Отметьте тему изученной, когда разберётесь с нормами</span>
      <button class="btn primary" id="btn-read" data-lesson="${l.code}" ${readL(l.code)?'disabled':''}>
        ${readL(l.code)?'Отмечена как изученная':'Отметить изученной'}</button>
    </div>`;
}

/* ===== экзамен ===== */
async function startExam(ccode){
  const c = courseById(ccode);
  let r;
  try { r = await api('/api/exam/start', {course: ccode}); }
  catch(e){ alert(e.message); return; }
  EX = {attempt:r.attempt, qs:r.questions, i:0, answers:{}, results:{}, course:ccode,
        left: Math.max(20, r.questions.length) * 90, timer:null, mode:'exam'};
  EX.timer = setInterval(() => {
    EX.left--;
    const t = $('#timer');
    if (t){ t.textContent = fmt(EX.left); t.classList.toggle('low', EX.left<=120); }
    if (EX.left<=0){ clearInterval(EX.timer); finishExam(true); }
  }, 1000);
  drawQ();
}
function stopExam(){ if (EX && EX.timer) clearInterval(EX.timer); EX = null; }

function drawQ(){
  const it = EX.qs[EX.i], res = EX.results[it.code], answered = !!res;
  const chosenPos = EX.answers[it.code];
  const opts = it.options.map((text, pos) => {
    let cls = 'opt';
    if (answered){
      const correctPos = it.map.indexOf(res.correct);
      if (pos === correctPos) cls += ' right';
      else if (pos === chosenPos) cls += ' wrong';
    }
    return `<button class="${cls}" data-pos="${pos}" ${answered?'disabled':''} aria-pressed="${chosenPos===pos}">
      <span class="k">${'АБВГДЕ'[pos]}</span><span>${esc(text)}</span></button>`;
  }).join('');
  const a = answered ? (res.act || {}) : {};
  const explain = answered ? `<div class="explain">
      <div class="row" style="gap:8px;margin-bottom:8px">
        <span class="chip ${res.right?'done':'crit'}">${res.right?'Верно':'Неверно'}</span>
        <span class="pt">п. ${res.point}</span>
      </div>
      <p class="t">${esc(res.explain)}</p>
      <div class="srcline"><span>${esc(a.title||'')} — № ${esc(a.num||'')} от ${esc(a.act_date||'')}</span>
        ${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">Первоисточник →</a>`:''}
        <button class="linkbtn" id="btn-complain" data-q="${it.code}" style="margin-left:auto">Оспорить вопрос</button></div>
      <div id="complain-msg" class="note" style="margin-top:8px"></div>
    </div>` : '';
  const last = EX.i === EX.qs.length-1;
  const title = EX.mode==='exam' ? `Экзамен · ${esc(courseById(EX.course).title)}` : 'Тренировка';
  $('#app').innerHTML = `
    <div class="exam-top">
      <span class="eyebrow">${title}</span>
      <span class="qnum">Вопрос ${EX.i+1} из ${EX.qs.length}</span>
      <div class="meter" style="flex:1;min-width:110px"><i style="width:${EX.i/EX.qs.length*100}%"></i></div>
      ${EX.mode==='exam'?`<span class="timer" id="timer">${fmt(EX.left)}</span>`:''}
    </div>
    <div class="panel panel-pad qbody">
      <div class="row" style="gap:8px;margin-bottom:10px">${levelChip(it.level)}</div>
      <p class="qtext">${esc(it.body)}</p>
      <div class="opts">${opts}</div>
      ${explain}
      <div class="exam-foot">
        <button class="btn primary" id="btn-next" ${answered?'':'disabled'}>
          ${last ? (EX.mode==='exam'?'Завершить экзамен':'Показать результат') : 'Следующий вопрос'}</button>
        ${EX.mode!=='exam' ? '<button class="btn" id="btn-quit">Прервать</button>' : ''}
        <span class="note">${answered?'':'Выберите один вариант'}</span>
      </div>
    </div>`;
  $$('.opt').forEach(b => b.onclick = async () => {
    if (EX.results[it.code]) return;
    const pos = +b.dataset.pos, orig = it.map[pos];
    EX.answers[it.code] = pos;
    const url = EX.mode==='exam' ? '/api/exam/answer' : '/api/drill/check';
    const payload = EX.mode==='exam'
      ? {attempt:EX.attempt, question:it.code, chosen:orig}
      : {question:it.code, chosen:orig};
    try { EX.results[it.code] = await api(url, payload); } catch(e){ alert(e.message); return; }
    drawQ();
  });
  $('#btn-next').onclick = () => {
    if (last) { EX.mode==='exam' ? finishExam(false) : finishDrill(); }
    else { EX.i++; drawQ(); scrollTop(); }
  };
  const bq = $('#btn-quit'); if (bq) bq.onclick = () => { stopExam(); go({name:'drill'}); };
  const bc = $('#btn-complain');
  if (bc) bc.onclick = async () => {
    const r = await api('/api/complaint', {question: bc.dataset.q});
    $('#complain-msg').textContent = r.frozen
      ? `Жалоба принята (${r.count}). Вопрос заморожен и больше не выдаётся до разбора.`
      : `Жалоба принята (${r.count} из ${r.threshold}). При ${r.threshold} жалобах вопрос замораживается автоматически.`;
    bc.disabled = true;
  };
}

async function finishExam(byTime){
  clearInterval(EX.timer);
  const r = await api('/api/exam/finish', {attempt: EX.attempt, by_time: byTime});
  const c = courseById(EX.course);
  await refresh();
  const wrong = r.wrong || [];
  $('#app').innerHTML = `<div class="hd"><div class="grow">
      <div class="eyebrow">Результат · ${esc(c.title)}</div>
      <h2 style="margin-top:6px">${r.passed?'Курс пройден':'Порог не достигнут'}</h2>
      <p class="lead">${byTime?'Время экзамена истекло, засчитаны данные ответы. ':''}${r.passed
        ? (r.certificate?`Сертификат ${esc(r.certificate)} выдан и действует 12 месяцев.`:'Курс засчитан.')
        : 'Для сдачи нужно не менее 80%. Назначены корректирующие действия по темам, где были ошибки.'}</p>
    </div></div>
    <div class="grid-2">
      <div class="stat ${r.passed?'pass':'fail'}"><div class="v">${r.pct}%</div><div class="l">Результат попытки</div></div>
      <div class="stat"><div class="v">${r.right}<span style="font-size:18px;color:var(--ink-3)"> / ${r.total}</span></div><div class="l">Верных ответов</div></div>
      <div class="stat"><div class="v">80%</div><div class="l">Проходной порог</div></div>
      <div class="stat"><div class="v" style="${r.delta===null?'':'color:var(--'+(r.delta>=0?'good':'crit')+')'}">${r.delta===null?'—':(r.delta>=0?'+':'')+r.delta}</div>
        <div class="l">${r.delta===null?'Первая попытка — база для сравнения':'Прогресс к прошлой попытке, п.п.'}</div></div>
    </div>
    <div class="row"><button class="btn primary" data-course="${c.code}">Вернуться к курсу</button></div>
    ${wrong.length ? `<div class="panel panel-pad">
      <div class="eyebrow">Разбор ошибок</div>
      <div style="margin-top:14px">${wrong.map(w => {
        const a = (r.acts||{})[w.act_code] || {};
        return `<div class="norm"><div class="norm-h"><span class="pt">п. ${w.point}</span><span class="src">${esc(a.title||'')}</span></div>
          <div class="norm-b"><p style="font-weight:600;font-size:15px">${esc(w.body)}</p>
          <div class="plain" style="margin-top:10px"><b>Верно</b><span>${esc(w.options[w.correct])}</span></div>
          <p class="note" style="margin-top:10px;color:var(--ink-2)">${esc(w.explain)}</p>
          ${a.url?`<div class="srcline"><a href="${esc(a.url)}" target="_blank" rel="noopener">Первоисточник →</a></div>`:''}
          </div></div>`;
      }).join('')}</div></div>` : ''}`;
  EX = null;
  bind(); scrollTop();
}

/* ===== тренажёр ===== */
function viewDrill(){
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Тестирование</div>
      <h2 style="margin-top:6px">Проверка знаний по любым темам</h2>
      <p class="lead">Раздел не связан с прохождением курсов: соберите тест по нужному направлению и уровню и проверьте себя в любой момент. Результат не влияет на статус курсов и сертификаты.</p>
    </div></div>
    <div class="panel panel-pad">
      <div class="filters">
        <label>Направление<select id="d-dir"><option value="">Все направления</option>
          ${C.directions.map(d=>`<option value="${d.code}">${esc(d.title)}</option>`).join('')}</select></label>
        <label>Курс<select id="d-course"><option value="">Все курсы направления</option></select></label>
        <label>Уровень<select id="d-level"><option value="">Любой</option>
          ${Object.entries(LEVELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Вопросов<select id="d-count">
          <option>10</option><option>15</option><option>20</option><option>30</option></select></label>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="btn-drill">Собрать тест</button>
        <span class="note" id="drill-note"></span></div>
    </div>`;
}
async function startDrill(){
  const cfg = {direction:$('#d-dir').value, course:$('#d-course').value,
               level:$('#d-level').value, count:+$('#d-count').value};
  const r = await api('/api/drill/start', cfg);
  if (!r.questions.length){ $('#drill-note').textContent = 'По этим условиям вопросов не нашлось'; return; }
  EX = {qs:r.questions, i:0, answers:{}, results:{}, mode:'drill'};
  drawQ();
}
function finishDrill(){
  const total = EX.qs.length, right = Object.values(EX.results).filter(r=>r.right).length;
  const pct = Math.round(right/total*100);
  const wrong = EX.qs.filter(q => EX.results[q.code] && !EX.results[q.code].right);
  $('#app').innerHTML = `<div class="hd"><div class="grow">
      <div class="eyebrow">Тренировка завершена</div>
      <h2 style="margin-top:6px">${pct}% верных ответов</h2>
      <p class="lead">Это тренировка: на статус курсов и сертификаты результат не влияет.</p>
    </div></div>
    <div class="grid-2">
      <div class="stat ${pct>=80?'pass':''}"><div class="v">${pct}%</div><div class="l">Результат</div></div>
      <div class="stat"><div class="v">${right}<span style="font-size:18px;color:var(--ink-3)"> / ${total}</span></div><div class="l">Верных ответов</div></div>
    </div>
    ${wrong.length?`<div class="panel panel-pad"><div class="eyebrow">Темы, где были ошибки</div>
      <ul class="calist" style="margin-top:12px">${[...new Set(wrong.map(w=>w.lesson))].map(code=>{
        const l = lessonById(code);
        return `<li><div style="flex:1"><div class="n">${esc(l?l.title:code)}</div></div>
          <button class="btn sm" data-lesson="${code}">Открыть тему</button></li>`;}).join('')}</ul></div>`:''}
    <div class="row"><button class="btn primary" data-go="drill">Собрать ещё тест</button></div>`;
  EX = null; bind(); scrollTop();
}

/* ===== поиск ===== */
function viewSearch(term){
  const t = term.toLowerCase();
  const hits = [];
  C.courses.forEach(c => { if (c.title.toLowerCase().includes(t) || (c.intro||'').toLowerCase().includes(t))
    hits.push({type:'Курс', title:c.title, sub:dirById(c.direction_code).title, act:`data-course="${c.code}"`}); });
  C.lessons.forEach(l => { if (l.title.toLowerCase().includes(t) || (l.intro||'').toLowerCase().includes(t))
    hits.push({type:'Тема', title:l.title, sub:courseById(l.course_code).title, act:`data-lesson="${l.code}"`}); });
  C.lessons.forEach(l => (l.cards||[]).forEach(card => {
    if ((card.norm||'').toLowerCase().includes(t) || (card.plain||'').toLowerCase().includes(t)){
      const a = C.acts[card.act_code]||{};
      hits.push({type:'Норма', title:`п. ${card.point} — ${a.title||''}`, sub:card.norm.slice(0,150)+'…', act:`data-lesson="${l.code}"`});
    }}));
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Поиск</div>
      <h2 style="margin-top:6px">«${esc(term)}» — найдено ${hits.length}</h2>
      <p class="lead">Ищем по названиям курсов и тем, а также по текстам норм внутри уроков.</p>
    </div></div>
    ${hits.length ? `<div class="stack">${hits.slice(0,40).map(h=>`
      <button class="panel hit" ${h.act}>
        <span class="chip locked">${h.type}</span>
        <span style="flex:1;min-width:0"><b>${esc(h.title)}</b><span class="note">${esc(h.sub)}</span></span>
      </button>`).join('')}</div>`
    : `<div class="panel panel-pad"><p class="note">Ничего не найдено. Попробуйте другой запрос — например «прикрепление», «дефект», «вакцинация».</p></div>`}`;
}

/* ===== руководителю ===== */
function viewChief(){
  if (!ME.user.is_org_admin)
    return `<div class="panel panel-pad"><div class="eyebrow">Доступ ограничен</div>
      <p class="note" style="margin-top:8px">Раздел доступен руководителю организации. Ваша учётная запись такими правами не наделена.</p></div>`;
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Кабинет руководителя</div>
      <h2 style="margin-top:6px">Обучение сотрудников</h2>
      <p class="lead">Данные по вашей организации. Главный показатель — прирост между первой и повторной попыткой: он показывает, сработали ли корректирующие действия.</p>
    </div></div><div id="chief-body"><p class="note">Загружаю…</p></div>`;
}
async function loadChief(){
  const el = $('#chief-body'); if (!el) return;
  let r; try { r = await api('/api/org/report'); } catch(e){ el.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
  const people = r.people;
  const totalCourses = C.courses.length;
  const done = people.filter(p => Object.values(p.courses).some(a => a.some(x=>x.passed))).length;
  const deltas = [];
  people.forEach(p => Object.values(p.courses).forEach(list => {
    if (list.length > 1) deltas.push(list[list.length-1].pct - list[0].pct); }));
  const avgD = deltas.length ? Math.round(deltas.reduce((a,b)=>a+b,0)/deltas.length) : null;
  el.innerHTML = `<div class="grid-2">
      <div class="stat"><div class="v">${people.length}</div><div class="l">Сотрудников зарегистрировано</div></div>
      <div class="stat"><div class="v" style="color:var(--good)">${done}</div><div class="l">Прошли хотя бы один курс</div></div>
      <div class="stat"><div class="v">${totalCourses}</div><div class="l">Курсов в программе</div></div>
      <div class="stat"><div class="v" style="color:var(--${avgD===null||avgD>=0?'good':'crit'})">${avgD===null?'—':(avgD>=0?'+':'')+avgD}</div>
        <div class="l">Средний прирост после корректировки, п.п.</div></div>
    </div>
    <div class="tblwrap" style="margin-top:18px"><table>
      <thead><tr><th>Сотрудник</th><th>Должность</th><th>Подразделение</th><th>Курсов пройдено</th><th>Последние результаты</th></tr></thead>
      <tbody>${people.map(p => {
        const passed = Object.values(p.courses).filter(a=>a.some(x=>x.passed)).length;
        const res = Object.entries(p.courses).slice(0,3).map(([code,list])=>{
          const l = list[list.length-1], c = courseById(code);
          return `<span class="chip ${l.passed?'done':'warn'}">${esc(c?c.title.slice(0,22):code)} ${l.pct}%</span>`;
        }).join(' ');
        return `<tr><td><b>${esc(p.name)}</b></td><td class="note">${esc(p.role||'—')}</td>
          <td class="note">${esc(p.department||'—')}</td><td class="num">${passed} / ${totalCourses}</td>
          <td>${res||'<span class="note">нет попыток</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`;
}

/* ===== источники ===== */
function viewAbout(){
  const acts = Object.values(C.acts);
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Нормативная база</div>
      <h2 style="margin-top:6px">Откуда взят материал</h2>
      <p class="lead">Каждая тема и каждый вопрос привязаны к пункту действующего нормативного правового акта. Тексты получены из государственной информационно-правовой системы «Әділет».</p>
    </div></div>
    <div class="stack">${acts.map(a => {
      const n = C.lessons.reduce((s,l)=>s+(l.cards||[]).filter(c=>c.act_code===a.code).length,0);
      return `<div class="panel panel-pad">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div style="flex:1;min-width:240px">
            <h3 style="font-size:16px">${esc(a.title)}</h3>
            <p class="note" style="margin-top:6px">№ ${esc(a.num)} от ${esc(a.act_date)}${a.reg?` · рег. № ${esc(a.reg)}`:''}</p>
          </div>
          <div style="text-align:right"><div class="delta">${n}</div><div class="note">норм в курсах</div></div>
        </div>
        ${a.url?`<div class="srcline"><a href="${esc(a.url)}" target="_blank" rel="noopener">Открыть полный текст →</a></div>`:''}
      </div>`;
    }).join('')}</div>`;
}

/* ===== связывание ===== */
function bind(){
  $$('[data-dir]').forEach(b => b.onclick = () => go({name:'direction', dir:b.dataset.dir}));
  $$('[data-course]').forEach(b => b.onclick = () => {
    if (b.id === 'btn-exam') return;
    go({name:'course', course:b.dataset.course});
  });
  $$('[data-lesson]').forEach(b => b.onclick = () => {
    if (b.id === 'btn-read') return;
    go({name:'lesson', lesson:b.dataset.lesson});
  });
  $$('[data-go]').forEach(b => b.onclick = () => go({name:b.dataset.go}));
  const be = $('#btn-exam'); if (be) be.onclick = () => startExam(be.dataset.course);
  const br = $('#btn-read');
  if (br) br.onclick = async () => {
    await api(`/api/lesson/${br.dataset.lesson}/read`, {});
    await refresh(); render();
  };
  $$('[data-cadone]').forEach(b => b.onclick = async () => {
    await api('/api/corrective/done', {course:b.dataset.course, lesson:b.dataset.cadone});
    await refresh(); render();
  });
  const bd = $('#btn-drill'); if (bd) bd.onclick = startDrill;
  const dd = $('#d-dir');
  if (dd) dd.onchange = () => {
    const cs = dd.value ? dirCourses(dd.value) : [];
    $('#d-course').innerHTML = '<option value="">Все курсы направления</option>' +
      cs.map(c=>`<option value="${c.code}">${esc(c.title)}</option>`).join('');
  };
  if (VIEW.name === 'chief') loadChief();
}

/* ===== старт ===== */
$$('.tab').forEach(t => t.onclick = () => { stopExam(); go({name:t.dataset.view}); });
$('#search').addEventListener('input', e => {
  SEARCH = e.target.value;
  if (SEARCH.trim().length > 1 || SEARCH === '') render();
});
boot();
