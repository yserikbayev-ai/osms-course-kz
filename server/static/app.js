/* ===== API ===== */
const api = async (path, data) => {
  const r = await fetch(path, data !== undefined ? {
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
const dmy = s => s ? s.split('-').reverse().join('.') : '';

/* ===== состояние ===== */
let ME={auth:false}, C=null, P=null, D=null, L=null, VIEW={name:'dash'}, EX=null, SEARCH='';
const LEVELS={1:'Базовый',2:'Продвинутый',3:'Экспертный'};
const KIND={mandatory:'Обязательный',recommended:'Рекомендуемый',optional:'Дополнительный',periodic:'Периодический'};
const ST_CHIP={completed:'done',in_progress:'open',not_started:'locked',failed:'warn',overdue:'crit',repeat_required:'crit'};

const courseById=id=>C.courses.find(c=>c.code===id);
const lessonById=id=>C.lessons.find(l=>l.code===id);
const dirById=id=>C.directions.find(d=>d.code===id);
const dirCourses=d=>C.courses.filter(c=>c.direction_code===d).sort((a,b)=>a.step-b.step);
const courseLessons=c=>C.lessons.filter(l=>l.course_code===c.code);
const courseModules=c=>C.modules.filter(m=>m.course_code===c.code);
const courseQ=c=>courseLessons(c).reduce((s,l)=>s+(l.questions||0),0);
const attemptsOf=c=>(P.attempts[c]||[]);
const passedC=c=>attemptsOf(c).some(a=>a.passed);
const caOf=c=>P.corrective.filter(x=>x.course_code===c);
const certOf=c=>P.certificates.find(x=>x.course_code===c);
const readL=l=>P.read.includes(l);
const isFav=(kind,ref)=>P.favorites.some(f=>f.kind===kind&&f.ref===ref);
const assignOf=c=>P.assignments.find(a=>a.course_code===c);
const levelChip=n=>`<span class="chip lvl${n}">${LEVELS[n]}</span>`;
const favBtn=(kind,ref)=>`<button class="favbtn${isFav(kind,ref)?' on':''}" data-fav="${kind}:${ref}"
  title="${isFav(kind,ref)?'Убрать из избранного':'В избранное'}" aria-label="Избранное">★</button>`;

function dirProgress(d){ const cl=dirCourses(d), done=cl.filter(c=>passedC(c.code)).length;
  return {done,total:cl.length,pct:cl.length?Math.round(done/cl.length*100):0}; }
function courseState(c){
  if(passedC(c.code)) return 'completed';
  const a=assignOf(c.code);
  if(a&&a.due_date&&a.due_date<new Date().toISOString().slice(0,10)) return 'overdue';
  if(attemptsOf(c.code).length) return 'failed';
  return courseLessons(c).some(l=>readL(l.code))?'in_progress':'not_started';
}
const stateChip=st=>`<span class="chip ${ST_CHIP[st]}">${
  {completed:'Завершён',in_progress:'В процессе',not_started:'Не начат',failed:'Не пройден',
   overdue:'Просрочен',repeat_required:'Требует повтора'}[st]}</span>`;

/* ===== вход ===== */
function renderAuth(mode='login'){
  document.body.classList.add('authmode');
  const roles=(ME.roles||[]).map(r=>`<option value="${esc(r.code)}">${esc(r.title)}</option>`).join('');
  $('#app').innerHTML=`<div class="authwrap"><div class="panel authcard">
      <div class="eyebrow">Обучение медперсонала по НПА РК</div>
      <h2 style="margin-top:8px">${mode==='login'?'Вход в систему':'Регистрация'}</h2>
      <p class="note" style="margin-top:6px">${mode==='login'
        ? 'Программа обучения подбирается по вашей должности автоматически.'
        : 'Укажите должность — система сама назначит обязательные и рекомендуемые курсы. Первый сотрудник организации получает права руководителя.'}</p>
      <div class="formgrid" style="margin-top:16px">
        ${mode==='reg'?`
          <label>Фамилия, имя, отчество<input id="f-name" autocomplete="name" placeholder="Серикбаев Ержан Оралбекович"></label>
          <label>Медицинская организация<input id="f-org" placeholder="ТОО «Моя Семейная амбулатория»"></label>
          <label>Должность / специальность<select id="f-role"><option value="">— не указана —</option>${roles}</select></label>
          <label>Подразделение<input id="f-dep" placeholder="Терапевтическое отделение"></label>
          <label>Телефон<input id="f-phone" autocomplete="tel" placeholder="+7 701 000 00 00"></label>`:''}
        <label>E-mail<input id="f-email" type="email" autocomplete="email" placeholder="doctor@clinic.kz"></label>
        <label>Пароль<input id="f-pass" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" placeholder="не короче 6 символов"></label>
      </div>
      <div id="auth-err" class="autherr"></div>
      <div class="row" style="margin-top:16px;gap:12px">
        <button class="btn primary" id="btn-auth">${mode==='login'?'Войти':'Зарегистрироваться'}</button>
        <button class="linkbtn" id="btn-switch">${mode==='login'?'Нет учётной записи — зарегистрироваться':'Уже есть учётная запись — войти'}</button>
      </div></div></div>`;
  $('#btn-switch').onclick=()=>renderAuth(mode==='login'?'reg':'login');
  $('#btn-auth').onclick=async()=>{
    const err=$('#auth-err'); err.textContent='';
    try{
      if(mode==='login') await api('/api/login',{email:$('#f-email').value,password:$('#f-pass').value});
      else await api('/api/register',{full_name:$('#f-name').value,org_name:$('#f-org').value,
        role_code:$('#f-role').value,department:$('#f-dep').value,phone:$('#f-phone').value,
        email:$('#f-email').value,password:$('#f-pass').value});
      await boot();
    }catch(e){ err.textContent=e.message; }
  };
  $$('input').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter')$('#btn-auth').click();}));
}

/* ===== загрузка ===== */
async function boot(){
  ME=await api('/api/me');
  if(!ME.auth){ renderAuth(); return; }
  document.body.classList.remove('authmode');
  [C,P,D,L]=await Promise.all([api("/api/content"),api("/api/progress"),api("/api/dashboard"),api("/api/my-learning")]);
  $('#userbar').innerHTML=`
    <button class="bell" id="btn-bell" title="Уведомления">🔔${D.unread?`<i>${D.unread}</i>`:''}</button>
    <span class="who"><b>${esc(ME.user.full_name)}</b><span>${esc(ME.user.role||'должность не указана')} · ${esc(ME.user.org)}</span></span>
    <button class="linkbtn" id="btn-out">Выйти</button>`;
  $('#btn-out').onclick=async()=>{await api('/api/logout',{});location.reload();};
  $('#btn-bell').onclick=()=>go({name:'notifs'});
  if(!ME.user.is_org_admin) $$('[data-view="chief"]').forEach(t=>t.style.display='none');
  VIEW={name:'dash'}; render();
}
async function refresh(){ [P,D,L]=await Promise.all([api("/api/progress"),api("/api/dashboard"),api("/api/my-learning")]);
  const b=$('#btn-bell'); if(b) b.innerHTML=`🔔${D.unread?`<i>${D.unread}</i>`:''}`; }

function render(){
  const v=VIEW;
  $$('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.view===v.name)));
  const el=$('#app');
  if(SEARCH.trim().length>1){ el.innerHTML=viewSearch(SEARCH.trim()); bind(); return; }
  const R={dash:viewDash,catalog:viewCatalog,learning:viewLearning,drill:viewDrill,favorites:viewFavorites,
           chief:viewChief,about:viewAbout,notifs:viewNotifs,admin:viewAdmin,billing:viewBilling};
  if(v.name==='direction') el.innerHTML=viewDirection(v.dir);
  else if(v.name==='course') el.innerHTML=viewCourse(v.course);
  else if(v.name==='lesson') el.innerHTML=viewLesson(v.lesson);
  else if(v.name==='cert') el.innerHTML=viewCert(v.course);
  else el.innerHTML=(R[v.name]||viewDash)();
  bind();
}
const go=v=>{VIEW=v;SEARCH='';const s=$('#search');if(s)s.value='';render();scrollTop();};

/* ===== кабинет (разделы 3 и 14 ТЗ) ===== */
function viewDash(){
  const card=(c,showDue)=>`<div class="panel tcard">
      <div style="flex:1;min-width:0">
        <div class="row" style="gap:7px">
          <b>${esc(c.title)}</b>
          ${c.kind?`<span class="chip ${c.kind==='mandatory'?'crit':c.kind==='periodic'?'warn':'open'}">${KIND[c.kind]}</span>`:''}
          ${stateChip(c.status)}
        </div>
        <p class="note" style="margin-top:4px">${esc(c.dir_title)}${showDue&&c.due?` · срок до <b>${dmy(c.due)}</b>`:''}${
          c.attempts.length?` · последний результат ${c.attempts[c.attempts.length-1].pct}%`:''}</p>
      </div>
      <button class="btn sm" data-course="${c.code}">Открыть</button></div>`;
  const n=D.counts;
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Личный кабинет</div>
      <h2 style="margin-top:6px">${esc(D.user.full_name)}</h2>
      <p class="lead">${esc(D.user.role||'Должность не указана')}${D.user.department?` · ${esc(D.user.department)}`:''} · ${esc(D.user.org)}</p>
    </div></div>
    <div class="grid-2">
      <div class="stat"><div class="v">${D.progress_pct}%</div><div class="l">Обязательное обучение пройдено</div>
        <div class="meter" style="margin-top:8px"><i style="width:${D.progress_pct}%"></i></div></div>
      <div class="stat"><div class="v">${n.mandatory}</div><div class="l">Обязательных курсов</div></div>
      <div class="stat"><div class="v" style="color:var(--good)">${n.completed}</div><div class="l">Пройдено</div></div>
      <div class="stat"><div class="v" style="color:var(--${n.overdue?'crit':'ink'})">${n.left}</div><div class="l">Осталось${n.overdue?` · просрочено ${n.overdue}`:''}</div></div>
    </div>
    ${D.todo.length?`<div class="block"><h3 class="bh">Вам необходимо пройти</h3>
      <div class="stack">${D.todo.map(c=>card(c,true)).join('')}</div></div>`:
      `<div class="panel panel-pad"><p class="note">Обязательное обучение выполнено полностью.</p></div>`}
    ${D.recommended.length?`<div class="block"><h3 class="bh">Рекомендуем вам</h3>
      <div class="stack">${D.recommended.map(c=>card(c,false)).join('')}</div></div>`:''}
    ${D.passed.length?`<div class="block"><h3 class="bh">Вы уже прошли</h3>
      <div class="stack">${D.passed.map(c=>`<div class="panel tcard">
        <div style="flex:1;min-width:0"><div class="row" style="gap:7px"><b>${esc(c.title)}</b>${stateChip('completed')}</div>
        <p class="note" style="margin-top:4px">${c.attempts.length?dmy(c.attempts[c.attempts.length-1].at.slice(0,10)):''} · ${c.last_pct}%${
          c.certificate?` · сертификат ${esc(c.certificate.code)} до ${dmy(c.certificate.valid_until)}`:''}</p></div>
        ${c.certificate?`<button class="btn sm" data-cert="${c.code}">Сертификат</button>`:''}
        <button class="btn sm" data-course="${c.code}">Открыть</button></div>`).join('')}</div></div>`:''}`;
}

function viewNotifs(){
  const icon={assigned:'📌',due_soon:'⏳',overdue:'⚠️',result:'📊',certificate:'🏅',cert_expiring:'⌛',repeat:'🔁'};
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Уведомления</div><h2 style="margin-top:6px">Что требует внимания</h2>
      <p class="lead">Система сама сообщает о назначении курса, приближении срока, просрочке, результате теста и истечении сертификата.</p>
    </div><button class="btn sm" id="btn-readall">Отметить всё прочитанным</button></div>
    ${D.notifications.length?`<div class="stack">${D.notifications.map(n=>`
      <div class="panel tcard${n.read_at?'':' unread'}">
        <span class="nicon">${icon[n.kind]||'•'}</span>
        <div style="flex:1;min-width:0"><b>${esc(n.title)}</b>
          <p class="note" style="margin-top:3px">${esc(n.body||'')}</p>
          <p class="note" style="color:var(--ink-3);margin-top:3px">${dmy(n.created_at.slice(0,10))}</p></div>
        ${n.ref?`<button class="btn sm" data-course="${n.ref}">Открыть</button>`:''}
      </div>`).join('')}</div>`:'<div class="panel panel-pad"><p class="note">Уведомлений пока нет.</p></div>'}`;
}

/* ===== моё обучение (раздел 3.1 ТЗ) ===== */
function viewLearning(){
  const rows=(L&&L.courses)||[];
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Моё обучение</div><h2 style="margin-top:6px">История и статусы</h2>
      <p class="lead">Полная картина: назначенные курсы, сроки, попытки, результаты, сертификаты и необходимость повторного прохождения.</p>
    </div></div>
    <div class="tblwrap"><table>
      <thead><tr><th>Курс</th><th>Тип</th><th>Статус</th><th>Срок</th><th>Попыток</th><th>Результат</th><th>Прирост</th><th>Сертификат</th></tr></thead>
      <tbody>${rows.map(c=>`<tr>
        <td><b>${esc(c.title)}</b><div class="note">${esc(c.dir_title)}</div></td>
        <td class="note">${c.kind_title||'—'}</td>
        <td>${stateChip(c.status)}</td>
        <td class="num">${c.due?dmy(c.due):'—'}</td>
        <td class="num">${c.attempts.length}</td>
        <td class="num">${c.last_pct!==null?c.last_pct+'%':'—'}</td>
        <td class="num">${c.delta!==null?`<span class="delta ${c.delta>=0?'up':'down'}">${c.delta>=0?'+':''}${c.delta}</span>`:'—'}</td>
        <td class="note">${c.certificate?`${esc(c.certificate.code)}<div class="note">до ${dmy(c.certificate.valid_until)}</div>`:'—'}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

/* ===== избранное (раздел 4 ТЗ) ===== */
function viewFavorites(){
  const cs=P.favorites.filter(f=>f.kind==='course').map(f=>courseById(f.ref)).filter(Boolean);
  const ls=P.favorites.filter(f=>f.kind==='lesson').map(f=>lessonById(f.ref)).filter(Boolean);
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Избранное</div><h2 style="margin-top:6px">Сохранённые материалы</h2>
      <p class="lead">Курсы и темы, которые вы отметили звёздочкой. Удалить можно в любой момент — здесь или на самой странице.</p>
    </div></div>
    ${!cs.length&&!ls.length?'<div class="panel panel-pad"><p class="note">Пока пусто. Нажмите ★ рядом с курсом или темой, чтобы сохранить.</p></div>':''}
    ${cs.length?`<div class="block"><h3 class="bh">Курсы</h3><div class="stack">${cs.map(c=>`
      <div class="panel tcard"><div style="flex:1;min-width:0"><b>${esc(c.title)}</b>
        <p class="note" style="margin-top:4px">${esc(dirById(c.direction_code).title)}</p></div>
        ${favBtn('course',c.code)}<button class="btn sm" data-course="${c.code}">Открыть</button></div>`).join('')}</div></div>`:''}
    ${ls.length?`<div class="block"><h3 class="bh">Темы</h3><div class="stack">${ls.map(l=>`
      <div class="panel tcard"><div style="flex:1;min-width:0"><b>${esc(l.title)}</b>
        <p class="note" style="margin-top:4px">${esc(courseById(l.course_code).title)}</p></div>
        ${favBtn('lesson',l.code)}<button class="btn sm" data-lesson="${l.code}">Открыть</button></div>`).join('')}</div></div>`:''}`;
}

/* ===== каталог ===== */
function viewCatalog(){
  return `<div class="hd"><div class="grow">
      <div class="eyebrow">Каталог обучения</div><h2 style="margin-top:6px">Направления деятельности</h2>
      <p class="lead">Все курсы открыты: порядок прохождения выбираете вы. Отметка «рекомендуем начать» показывает логичный маршрут, а обязательность и срок задаются вашей должностью.</p>
    </div></div>
    <div class="dirgrid">${C.directions.map(d=>{
      const p=dirProgress(d.code), cl=dirCourses(d.code);
      const mand=cl.filter(c=>{const a=assignOf(c.code);return a&&(a.kind==='mandatory'||a.kind==='periodic');}).length;
      return `<button class="dircard" data-dir="${d.code}">
        <div class="dirmark">${esc(d.icon||'')}</div>
        <div class="dirbody"><h3>${esc(d.title)}</h3>
          <p class="note">${esc(d.descr||'')}</p>
          <div class="row" style="gap:8px;margin-top:10px">
            <span class="chip ${p.pct===100?'done':'open'}">${p.done} из ${p.total} курсов</span>
            ${mand?`<span class="chip crit">${mand} обязательных</span>`:''}
          </div>
          <div class="meter" style="margin-top:9px"><i style="width:${p.pct}%"></i></div>
        </div></button>`;}).join('')}</div>`;
}
function viewDirection(dcode){
  const d=dirById(dcode), cl=dirCourses(dcode), next=cl.find(c=>!passedC(c.code));
  return `<div class="crumb"><button class="linkbtn" data-go="catalog">Каталог</button> → ${esc(d.title)}</div>
    <div class="hd"><div class="grow"><div class="eyebrow">Направление</div>
      <h2 style="margin-top:6px">${esc(d.title)}</h2><p class="lead">${esc(d.descr||'')}</p></div></div>
    <div class="stack">${cl.map(c=>{
      const st=courseState(c), a=assignOf(c.code), rec=!!next&&next.code===c.code&&st!=='completed';
      const lv=[...new Set(courseLessons(c).map(l=>l.level))].sort();
      return `<div class="panel course${rec?' rec':''}"><div class="panel-pad">
        <div class="row" style="gap:10px;align-items:flex-start">
          <span class="stepn">${c.step}</span>
          <div style="flex:1;min-width:200px">
            <div class="row" style="gap:8px"><h3 style="font-size:16.5px">${esc(c.title)}</h3>
              ${stateChip(st)}${a?`<span class="chip ${a.kind==='mandatory'?'crit':a.kind==='periodic'?'warn':'open'}">${KIND[a.kind]}</span>`:''}
              ${rec?'<span class="chip rec">Рекомендуем начать</span>':''}</div>
            <p class="note" style="margin-top:6px">${esc(c.intro||'')}</p>
            <div class="row" style="gap:6px;margin-top:9px">${lv.map(levelChip).join('')}
              <span class="note">${courseLessons(c).length} тем · ${courseQ(c)} вопросов${a&&a.due_date?` · до ${dmy(a.due_date)}`:''}</span></div>
          </div>
          ${favBtn('course',c.code)}
          <button class="btn primary sm" data-course="${c.code}">Открыть</button>
        </div></div></div>`;}).join('')}</div>`;
}

/* ===== курс с модулями ===== */
function viewCourse(ccode){
  const c=courseById(ccode), d=dirById(c.direction_code), a=assignOf(ccode);
  const att=attemptsOf(ccode), last=att[att.length-1], ca=caOf(ccode), cert=certOf(ccode);
  const mods=courseModules(c), ls=courseLessons(c), blocked=ca.length>0;
  const cfg=c.exam||{q_count:20,time_min:30,pass_pct:80,max_attempts:3};
  const lessonRow=l=>`<div class="panel"><div class="panel-pad" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div class="row" style="gap:8px"><h3 style="font-size:16px">${esc(l.title)}</h3>${levelChip(l.level)}
          ${readL(l.code)?'<span class="chip done">Изучена</span>':''}
          ${(l.materials||[]).some(m=>m.kind==='video')?'<span class="chip vid">Видео</span>':''}</div>
        <p class="note" style="margin-top:6px">${esc(l.intro||'')}</p>
        <p class="note" style="margin-top:5px;color:var(--ink-3)">${(l.cards||[]).length} норм · ${l.questions||0} вопросов · ~${l.duration_min||15} мин</p>
      </div>${favBtn('lesson',l.code)}
      <button class="btn sm" data-lesson="${l.code}">${readL(l.code)?'Повторить':'Изучить'}</button></div></div>`;
  const body = mods.length
    ? mods.map((m,i)=>`<div class="block"><h3 class="bh">${esc(m.title)}</h3>
        <div class="stack">${ls.filter(l=>l.module_code===m.code).map(lessonRow).join('')}</div></div>`).join('')
      + (ls.some(l=>!l.module_code)?`<div class="block"><h3 class="bh">Дополнительные темы</h3>
        <div class="stack">${ls.filter(l=>!l.module_code).map(lessonRow).join('')}</div></div>`:'')
    : `<div class="stack">${ls.map(lessonRow).join('')}</div>`;
  return `<div class="crumb"><button class="linkbtn" data-go="catalog">Каталог</button> →
      <button class="linkbtn" data-dir="${d.code}">${esc(d.title)}</button> → ${esc(c.title)}</div>
    <div class="hd"><div class="grow">
      <div class="row" style="gap:8px"><div class="eyebrow">Курс · шаг ${c.step}</div>
        ${a?`<span class="chip ${a.kind==='mandatory'?'crit':a.kind==='periodic'?'warn':'open'}">${KIND[a.kind]}${a.due_date?` · до ${dmy(a.due_date)}`:''}</span>`:''}</div>
      <h2 style="margin-top:6px">${esc(c.title)}</h2><p class="lead">${esc(c.intro||'')}</p>
    </div>${favBtn('course',c.code)}</div>
    ${cert?`<div class="panel panel-pad" style="border-color:var(--good)">
      <div class="row" style="justify-content:space-between;gap:12px">
        <div><div class="eyebrow" style="color:var(--good)">Курс пройден</div>
        <p style="margin-top:6px;font-size:15px">Сертификат <b>${esc(cert.code)}</b> · ${cert.pct}% · действителен до ${dmy(cert.valid_until)}</p></div>
        <button class="btn sm" data-cert="${c.code}">Открыть сертификат</button></div></div>`:''}
    ${blocked?renderCA(c,ca,last):''}
    ${body}
    <div class="panel panel-pad" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><h3 style="font-size:16.5px">Экзамен по курсу</h3>
        <p class="note" style="margin-top:5px">${Math.min(cfg.q_count,courseQ(c))} вопросов · ${cfg.time_min} минут · порог ${cfg.pass_pct}% ·
        попытка ${att.length+1} из ${cfg.max_attempts}${blocked?' · <b>сначала выполните корректирующие действия</b>':''}</p></div>
      <button class="btn primary" id="btn-exam" data-course="${c.code}" ${blocked?'disabled':''}>Начать экзамен</button>
    </div>
    ${att.length?`<div class="panel panel-pad"><div class="eyebrow">История попыток</div>
      <div class="grid-2" style="margin-top:12px">${att.map((x,i)=>`
        <div class="stat ${x.passed?'pass':'fail'}"><div class="v">${x.pct}%</div>
        <div class="l">Попытка ${i+1} · ${dmy(x.at.slice(0,10))}${i>0?` · <span class="delta ${x.pct-att[i-1].pct>=0?'up':'down'}">${x.pct-att[i-1].pct>=0?'+':''}${x.pct-att[i-1].pct} п.п.</span>`:''}</div>
        </div>`).join('')}</div></div>`:''}`;
}
function renderCA(c,ca,last){
  return `<div class="ca"><div class="eyebrow" style="color:var(--warn)">Корректирующие действия</div>
    <h3 style="margin-top:6px">Попытка не засчитана${last?`: ${last.pct}%`:''}</h3>
    <p class="note" style="margin-top:8px;color:var(--ink-2)">Повторите темы, где были ошибки, и отметьте их выполненными — после этого откроется пересдача.</p>
    <ul class="calist">${ca.map(x=>{const l=lessonById(x.lesson_code);
      return `<li><div style="flex:1"><div class="n">${esc(l?l.title:x.lesson_code)}</div>
        <div class="s">Ошибок в теме: ${x.errors}</div></div>
        <button class="btn sm" data-lesson="${x.lesson_code}">Повторить</button>
        <button class="btn sm primary" data-cadone="${x.lesson_code}" data-course="${c.code}">Выполнено</button></li>`;}).join('')}</ul></div>`;
}

/* ===== урок с материалами ===== */
function viewLesson(code){
  const l=lessonById(code), c=courseById(l.course_code), d=dirById(c.direction_code);
  const mats=l.materials||[];
  const video=mats.filter(m=>m.kind==='video');
  const files=mats.filter(m=>['file','link','audio'].includes(m.kind));
  const vhtml=video.map(v=>v.url
    ? `<div class="panel videoblock"><div class="ratio"><iframe src="${esc(v.url)}" title="${esc(v.title)}" allowfullscreen loading="lazy"></iframe></div>
       <div class="panel-pad row" style="justify-content:space-between"><b>${esc(v.title)}</b>
       ${v.required?'<span class="chip crit">Обязателен к просмотру</span>':''}</div></div>`
    : `<div class="panel videostub"><div class="vicon">▶</div><div><b>${esc(v.title)}</b>
       <p class="note" style="margin-top:3px">Запись готовится. Место под неё зарезервировано: как только видео появится, оно встанет сюда без изменения курса.</p></div></div>`).join('');
  return `<div class="crumb"><button class="linkbtn" data-go="catalog">Каталог</button> →
      <button class="linkbtn" data-dir="${d.code}">${esc(d.title)}</button> →
      <button class="linkbtn" data-course="${c.code}">${esc(c.title)}</button> → ${esc(l.title)}</div>
    <div class="hd"><div class="grow"><div class="row" style="gap:8px"><div class="eyebrow">Тема</div>${levelChip(l.level)}</div>
      <h2 style="margin-top:6px">${esc(l.title)}</h2><p class="lead">${esc(l.intro||'')}</p></div>
      ${favBtn('lesson',l.code)}<button class="btn" data-course="${c.code}">← К курсу</button></div>
    ${vhtml}
    ${files.length?`<div class="panel panel-pad"><div class="eyebrow">Материалы темы</div>
      <ul class="calist" style="margin-top:12px">${files.map(m=>`<li>
        <div style="flex:1"><div class="n">${esc(m.title)}</div><div class="s">${
          {file:'Файл',link:'Ссылка',audio:'Аудио'}[m.kind]||m.kind}${m.required?' · обязателен':''}</div></div>
        ${m.url?`<a class="btn sm" href="${esc(m.url)}" target="_blank" rel="noopener">Открыть</a>`:'<span class="note">готовится</span>'}
      </li>`).join('')}</ul></div>`:''}
    ${(l.cards||[]).map(card=>{const a=C.acts[card.act_code]||{};
      return `<div class="norm"><div class="norm-h"><span class="pt">п. ${card.point}</span><span class="src">${esc(a.title||'')}</span></div>
        <div class="norm-b"><div class="quote">${esc(card.norm)}</div>
          <div class="plain"><b>На практике</b><span>${esc(card.plain||'')}</span></div>
          <div class="srcline"><span>№ ${esc(a.num||'')} от ${esc(a.act_date||'')}${a.reg?` · рег. № ${esc(a.reg)}`:''}</span>
            ${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">Открыть акт в «Әділет» →</a>`:''}</div>
        </div></div>`;}).join('')}
    <div class="panel panel-pad row" style="justify-content:space-between">
      <span class="note">Отметьте тему изученной, когда разберётесь с нормами</span>
      <button class="btn primary" id="btn-read" data-lesson="${l.code}" ${readL(l.code)?'disabled':''}>
        ${readL(l.code)?'Отмечена как изученная':'Отметить изученной'}</button></div>`;
}

/* ===== сертификат с QR (раздел 9 ТЗ) ===== */
function viewCert(ccode){
  const c=courseById(ccode), cert=certOf(ccode);
  if(!cert) return '<div class="panel panel-pad"><p class="note">Сертификат по этому курсу не выдан.</p></div>';
  const url=location.origin+'/verify/'+cert.code;
  return `<div class="hd"><div class="grow"><div class="eyebrow">Сертификат</div>
      <h2 style="margin-top:6px">${esc(c.title)}</h2>
      <p class="lead">Подлинность проверяется по QR-коду или по прямой ссылке — страница проверки открыта без входа в систему.</p>
    </div><button class="btn" data-course="${ccode}">← К курсу</button></div>
    <div class="panel cert">
      <div class="certhead"><div class="ttl">Сертификат о прохождении обучения</div><div class="ln"></div></div>
      <div class="meta">настоящим подтверждается, что</div>
      <div class="nm">${esc(ME.user.full_name)}</div>
      <div class="meta">${esc(ME.user.role||'')}${ME.user.role?' · ':''}${esc(ME.user.org)}</div>
      <div class="meta" style="margin-top:14px">прошёл(ла) курс</div>
      <div class="crs">«${esc(c.title)}»</div>
      <div class="ln"></div>
      <div class="certfoot">
        <div><div class="meta">Результат</div><div class="big">${cert.pct}%</div>
          <div class="meta" style="margin-top:10px">Выдан ${dmy(cert.issued_at.slice(0,10))} · действителен до ${dmy(cert.valid_until)}</div>
          <div class="code">${esc(cert.code)}</div></div>
        <div class="qr"><img src="/qr/${esc(cert.code)}.svg" alt="QR-код проверки" width="120" height="120">
          <a class="note" href="${esc(url)}" target="_blank" rel="noopener">Проверить</a></div>
      </div>
    </div>
    <div class="row"><button class="btn" onclick="window.print()">Распечатать</button></div>`;
}

/* ===== экзамен и тренажёр ===== */
async function startExam(ccode){
  let r; try{ r=await api('/api/exam/start',{course:ccode}); }catch(e){ alert(e.message); return; }
  EX={attempt:r.attempt,qs:r.questions,i:0,answers:{},results:{},course:ccode,
      left:(r.cfg.time_min||30)*60,cfg:r.cfg,timer:null,mode:'exam'};
  EX.timer=setInterval(()=>{ EX.left--; const t=$('#timer');
    if(t){t.textContent=fmt(EX.left);t.classList.toggle('low',EX.left<=120);}
    if(EX.left<=0){clearInterval(EX.timer);finishExam(true);} },1000);
  drawQ();
}
function stopExam(){ if(EX&&EX.timer)clearInterval(EX.timer); EX=null; }
function drawQ(){
  const it=EX.qs[EX.i], res=EX.results[it.code], answered=!!res, chosenPos=EX.answers[it.code];
  const opts=it.options.map((text,pos)=>{
    let cls='opt';
    if(answered){ const cp=it.map.indexOf(res.correct);
      if(pos===cp)cls+=' right'; else if(pos===chosenPos)cls+=' wrong'; }
    return `<button class="${cls}" data-pos="${pos}" ${answered?'disabled':''} aria-pressed="${chosenPos===pos}">
      <span class="k">${'АБВГДЕ'[pos]}</span><span>${esc(text)}</span></button>`;}).join('');
  const a=answered?(res.act||{}):{};
  const explain=answered?`<div class="explain">
      <div class="row" style="gap:8px;margin-bottom:8px">
        <span class="chip ${res.right?'done':'crit'}">${res.right?'Верно':'Неверно'}</span><span class="pt">п. ${res.point}</span></div>
      <p class="t">${esc(res.explain)}</p>
      <div class="srcline"><span>${esc(a.title||'')} — № ${esc(a.num||'')} от ${esc(a.act_date||'')}</span>
        ${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">Первоисточник →</a>`:''}
        <button class="linkbtn" id="btn-complain" data-q="${it.code}" style="margin-left:auto">Оспорить вопрос</button></div>
      <div id="complain-msg" class="note" style="margin-top:8px"></div></div>`:'';
  const last=EX.i===EX.qs.length-1;
  $('#app').innerHTML=`
    <div class="exam-top"><span class="eyebrow">${EX.mode==='exam'?'Экзамен · '+esc(courseById(EX.course).title):'Тренировка'}</span>
      <span class="qnum">Вопрос ${EX.i+1} из ${EX.qs.length}</span>
      <div class="meter" style="flex:1;min-width:110px"><i style="width:${EX.i/EX.qs.length*100}%"></i></div>
      ${EX.mode==='exam'?`<span class="timer" id="timer">${fmt(EX.left)}</span>`:''}</div>
    <div class="panel panel-pad qbody">
      <div class="row" style="gap:8px;margin-bottom:10px">${levelChip(it.level)}</div>
      <p class="qtext">${esc(it.body)}</p><div class="opts">${opts}</div>${explain}
      <div class="exam-foot"><button class="btn primary" id="btn-next" ${answered?'':'disabled'}>
          ${last?(EX.mode==='exam'?'Завершить экзамен':'Показать результат'):'Следующий вопрос'}</button>
        ${EX.mode!=='exam'?'<button class="btn" id="btn-quit">Прервать</button>':''}
        <span class="note">${answered?'':'Выберите один вариант'}</span></div></div>`;
  $$('.opt').forEach(b=>b.onclick=async()=>{
    if(EX.results[it.code])return;
    const pos=+b.dataset.pos, orig=it.map[pos]; EX.answers[it.code]=pos;
    const url=EX.mode==='exam'?'/api/exam/answer':'/api/drill/check';
    const payload=EX.mode==='exam'?{attempt:EX.attempt,question:it.code,chosen:orig}:{question:it.code,chosen:orig};
    try{ EX.results[it.code]=await api(url,payload); }catch(e){ alert(e.message); return; }
    drawQ();});
  $('#btn-next').onclick=()=>{ if(last){ EX.mode==='exam'?finishExam(false):finishDrill(); }
    else { EX.i++; drawQ(); scrollTop(); } };
  const bq=$('#btn-quit'); if(bq)bq.onclick=()=>{stopExam();go({name:'drill'});};
  const bc=$('#btn-complain');
  if(bc)bc.onclick=async()=>{ const r=await api('/api/complaint',{question:bc.dataset.q});
    $('#complain-msg').textContent=r.frozen?`Жалоба принята (${r.count}). Вопрос заморожен до разбора.`
      :`Жалоба принята (${r.count} из ${r.threshold}).`; bc.disabled=true; };
}
async function finishExam(byTime){
  clearInterval(EX.timer);
  const r=await api('/api/exam/finish',{attempt:EX.attempt,by_time:byTime});
  const c=courseById(EX.course); await refresh();
  const wrong=r.wrong||[];
  $('#app').innerHTML=`<div class="hd"><div class="grow"><div class="eyebrow">Результат · ${esc(c.title)}</div>
      <h2 style="margin-top:6px">${esc(r.grade)}${r.passed?' — курс пройден':''}</h2>
      <p class="lead">${byTime?'Время экзамена истекло, засчитаны данные ответы. ':''}${r.passed
        ?(r.certificate?`Сертификат ${esc(r.certificate)} выдан.`:'Курс засчитан.')
        :`Порог — ${r.pass_pct}%. Использовано попыток ${r.attempts_used} из ${r.attempts_max}. Назначены корректирующие действия.`}</p>
    </div></div>
    <div class="grid-2">
      <div class="stat ${r.passed?'pass':'fail'}"><div class="v">${r.pct}%</div><div class="l">${esc(r.grade)}</div></div>
      <div class="stat"><div class="v">${r.right}<span style="font-size:18px;color:var(--ink-3)"> / ${r.total}</span></div><div class="l">Верных ответов</div></div>
      <div class="stat"><div class="v">${r.pass_pct}%</div><div class="l">Проходной порог</div></div>
      <div class="stat"><div class="v" style="${r.delta===null?'':'color:var(--'+(r.delta>=0?'good':'crit')+')'}">${r.delta===null?'—':(r.delta>=0?'+':'')+r.delta}</div>
        <div class="l">${r.delta===null?'Первая попытка':'Прирост к прошлой попытке, п.п.'}</div></div>
    </div>
    <div class="row"><button class="btn primary" data-course="${c.code}">Вернуться к курсу</button>
      ${r.certificate?`<button class="btn" data-cert="${c.code}">Открыть сертификат</button>`:''}</div>
    ${wrong.length?`<div class="panel panel-pad"><div class="eyebrow">Разбор ошибок</div>
      <div style="margin-top:14px">${wrong.map(w=>{const a=(r.acts||{})[w.act_code]||{};
        return `<div class="norm"><div class="norm-h"><span class="pt">п. ${w.point}</span><span class="src">${esc(a.title||'')}</span></div>
          <div class="norm-b"><p style="font-weight:600;font-size:15px">${esc(w.body)}</p>
          <div class="plain" style="margin-top:10px"><b>Верно</b><span>${esc(w.options[w.correct])}</span></div>
          <p class="note" style="margin-top:10px;color:var(--ink-2)">${esc(w.explain)}</p>
          ${a.url?`<div class="srcline"><a href="${esc(a.url)}" target="_blank" rel="noopener">Первоисточник →</a></div>`:''}</div></div>`;}).join('')}</div></div>`:''}`;
  EX=null; bind(); scrollTop();
}
function viewDrill(){
  return `<div class="hd"><div class="grow"><div class="eyebrow">Тестирование</div>
      <h2 style="margin-top:6px">Проверка знаний по любым темам</h2>
      <p class="lead">Раздел не связан с прохождением курсов: соберите тест по нужному направлению и уровню в любой момент. Результат не влияет на статусы и сертификаты.</p></div></div>
    <div class="panel panel-pad"><div class="filters">
        <label>Направление<select id="d-dir"><option value="">Все направления</option>
          ${C.directions.map(d=>`<option value="${d.code}">${esc(d.title)}</option>`).join('')}</select></label>
        <label>Курс<select id="d-course"><option value="">Все курсы направления</option></select></label>
        <label>Уровень<select id="d-level"><option value="">Любой</option>
          ${Object.entries(LEVELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Вопросов<select id="d-count"><option>10</option><option>15</option><option>20</option><option>30</option></select></label>
      </div><div class="row" style="margin-top:16px"><button class="btn primary" id="btn-drill">Собрать тест</button>
        <span class="note" id="drill-note"></span></div></div>`;
}
async function startDrill(){
  const r=await api('/api/drill/start',{direction:$('#d-dir').value,course:$('#d-course').value,
    level:$('#d-level').value,count:+$('#d-count').value});
  if(!r.questions.length){ $('#drill-note').textContent='По этим условиям вопросов не нашлось'; return; }
  EX={qs:r.questions,i:0,answers:{},results:{},mode:'drill'}; drawQ();
}
function finishDrill(){
  const total=EX.qs.length, right=Object.values(EX.results).filter(r=>r.right).length;
  const pct=Math.round(right/total*100);
  const wrong=EX.qs.filter(q=>EX.results[q.code]&&!EX.results[q.code].right);
  $('#app').innerHTML=`<div class="hd"><div class="grow"><div class="eyebrow">Тренировка завершена</div>
      <h2 style="margin-top:6px">${pct}% верных ответов</h2>
      <p class="lead">Это тренировка: на статусы курсов и сертификаты результат не влияет.</p></div></div>
    <div class="grid-2"><div class="stat ${pct>=80?'pass':''}"><div class="v">${pct}%</div><div class="l">Результат</div></div>
      <div class="stat"><div class="v">${right}<span style="font-size:18px;color:var(--ink-3)"> / ${total}</span></div><div class="l">Верных ответов</div></div></div>
    ${wrong.length?`<div class="panel panel-pad"><div class="eyebrow">Темы, где были ошибки</div>
      <ul class="calist" style="margin-top:12px">${[...new Set(wrong.map(w=>w.lesson))].map(code=>{const l=lessonById(code);
        return `<li><div style="flex:1"><div class="n">${esc(l?l.title:code)}</div></div>
          <button class="btn sm" data-lesson="${code}">Открыть тему</button></li>`;}).join('')}</ul></div>`:''}
    <div class="row"><button class="btn primary" data-go="drill">Собрать ещё тест</button></div>`;
  EX=null; bind(); scrollTop();
}

/* ===== поиск ===== */
function viewSearch(term){
  const t=term.toLowerCase(), hits=[];
  C.courses.forEach(c=>{ if(c.title.toLowerCase().includes(t)||(c.intro||'').toLowerCase().includes(t))
    hits.push({type:'Курс',title:c.title,sub:dirById(c.direction_code).title,act:`data-course="${c.code}"`});});
  C.lessons.forEach(l=>{ if(l.title.toLowerCase().includes(t)||(l.intro||'').toLowerCase().includes(t))
    hits.push({type:'Тема',title:l.title,sub:courseById(l.course_code).title,act:`data-lesson="${l.code}"`});});
  C.lessons.forEach(l=>(l.cards||[]).forEach(card=>{
    if((card.norm||'').toLowerCase().includes(t)||(card.plain||'').toLowerCase().includes(t)){
      const a=C.acts[card.act_code]||{};
      hits.push({type:'Норма',title:`п. ${card.point} — ${a.title||''}`,sub:card.norm.slice(0,150)+'…',act:`data-lesson="${l.code}"`});}}));
  return `<div class="hd"><div class="grow"><div class="eyebrow">Поиск</div>
      <h2 style="margin-top:6px">«${esc(term)}» — найдено ${hits.length}</h2>
      <p class="lead">Ищем по названиям курсов и тем, а также по текстам норм внутри уроков.</p></div></div>
    ${hits.length?`<div class="stack">${hits.slice(0,40).map(h=>`<button class="panel hit" ${h.act}>
        <span class="chip locked">${h.type}</span>
        <span style="flex:1;min-width:0"><b>${esc(h.title)}</b><span class="note">${esc(h.sub)}</span></span></button>`).join('')}</div>`
      :`<div class="panel panel-pad"><p class="note">Ничего не найдено. Попробуйте «прикрепление», «дефект», «вакцинация».</p></div>`}`;
}

/* ===== кабинет руководителя (разделы 12, 10, 11 ТЗ) ===== */
function viewChief(){
  return `<div class="hd"><div class="grow"><div class="eyebrow">Кабинет организации</div>
      <h2 style="margin-top:6px">Обучение сотрудников</h2>
      <p class="lead">Состояние обязательного обучения, просрочки, подразделения и подписка. Главный показатель качества — прирост между первой и повторной попыткой.</p>
    </div><div class="row"><button class="btn sm" id="btn-csv">Выгрузить CSV</button>
      <button class="btn sm" data-go="admin">Настройки обучения</button></div></div>
    <div id="chief-body"><p class="note">Загружаю…</p></div>`;
}
async function loadChief(){
  const el=$('#chief-body'); if(!el) return;
  let r; try{ r=await api('/api/org/dashboard'); }catch(e){ el.innerHTML=`<p class="note">${esc(e.message)}</p>`; return; }
  const t=r.totals, s=r.subscription;
  const deltas=r.people.map(p=>p.avg_delta).filter(x=>x!==null);
  const avgD=deltas.length?Math.round(deltas.reduce((a,b)=>a+b,0)/deltas.length):null;
  el.innerHTML=`
    <div class="grid-2">
      <div class="stat"><div class="v">${t.pct}%</div><div class="l">Обучение сотрудников</div>
        <div class="meter" style="margin-top:8px"><i style="width:${t.pct}%"></i></div></div>
      <div class="stat"><div class="v">${t.employees}</div><div class="l">Всего сотрудников</div></div>
      <div class="stat"><div class="v" style="color:var(--good)">${t.completed}</div><div class="l">Обязательных курсов пройдено</div></div>
      <div class="stat"><div class="v" style="color:var(--${t.overdue?'crit':'ink'})">${t.overdue}</div><div class="l">Просрочено</div></div>
      <div class="stat"><div class="v">${t.not_started}</div><div class="l">Не начали обучение</div></div>
      <div class="stat"><div class="v" style="color:var(--${avgD===null||avgD>=0?'good':'crit'})">${avgD===null?'—':(avgD>=0?'+':'')+avgD}</div>
        <div class="l">Средний прирост после корректировки, п.п.</div></div>
    </div>
    <div class="panel panel-pad sub"><div class="row" style="justify-content:space-between;gap:14px;flex-wrap:wrap">
      <div><div class="eyebrow">Подписка</div>
        <p style="margin-top:6px;font-size:15px"><b>${esc(s.title)}</b>${s.trial?' · пробный период':''} ·
          ${s.limit===null?'без ограничения по числу сотрудников':`занято ${s.used} из ${s.limit} мест`}
          ${s.valid_until?` · действует до ${dmy(s.valid_until)}`:''}
          ${s.active?'':' · <span class="chip crit">не активна</span>'}</p></div>
      <button class="btn sm" data-go="billing">Управление подпиской</button></div></div>
    ${r.by_department.length>1?`<div class="panel panel-pad"><div class="eyebrow">По подразделениям</div>
      <div class="grid-2" style="margin-top:12px">${r.by_department.map(d=>`
        <div class="stat"><div class="v">${d.pct}%</div><div class="l">${esc(d.name)} · ${d.done} из ${d.total}</div></div>`).join('')}</div></div>`:''}
    <div class="tblwrap" style="margin-top:18px"><table>
      <thead><tr><th>Сотрудник</th><th>Должность</th><th>Подразделение</th><th>Прогресс</th>
        <th>Просрочено</th><th>Ближайший срок</th><th>Прирост</th><th>Серт.</th><th></th></tr></thead>
      <tbody>${r.people.map(p=>`<tr>
        <td><b>${esc(p.name)}</b><div class="note">${esc(p.email)}</div></td>
        <td class="note">${esc(p.role||'—')}</td><td class="note">${esc(p.department||'—')}</td>
        <td class="num">${p.completed} / ${p.mandatory} <span class="note">(${p.pct}%)</span></td>
        <td class="num">${p.overdue?`<span class="chip crit">${p.overdue}</span>`:'—'}</td>
        <td class="num">${p.nearest_due?dmy(p.nearest_due):'—'}</td>
        <td class="num">${p.avg_delta===null?'—':`<span class="delta ${p.avg_delta>=0?'up':'down'}">${p.avg_delta>=0?'+':''}${p.avg_delta}</span>`}</td>
        <td class="num">${p.certificates}</td>
        <td><button class="btn sm" data-emp="${p.id}">Курсы</button></td></tr>`).join('')}</tbody></table></div>
    <div id="emp-detail"></div>`;
  window.__ORG=r;
  $$('[data-emp]').forEach(b=>b.onclick=()=>showEmp(+b.dataset.emp));
  const csv=$('#btn-csv'); if(csv) csv.onclick=()=>location.href='/api/org/report.csv';
}
function showEmp(id){
  const p=window.__ORG.people.find(x=>x.id===id);
  $('#emp-detail').innerHTML=`<div class="panel panel-pad" style="margin-top:18px">
    <div class="row" style="justify-content:space-between"><div><div class="eyebrow">Отчёт по сотруднику</div>
      <h3 style="margin-top:6px;font-size:17px">${esc(p.name)}</h3>
      <p class="note">${esc(p.role||'—')}${p.department?` · ${esc(p.department)}`:''}</p></div>
      <div class="row"><select id="asg-course" class="mini">${C.courses.map(c=>`<option value="${c.code}">${esc(c.title)}</option>`).join('')}</select>
      <button class="btn sm primary" id="btn-assign" data-user="${p.id}">Назначить курс</button></div></div>
    <div class="tblwrap" style="margin-top:14px"><table>
      <thead><tr><th>Курс</th><th>Тип</th><th>Статус</th><th>Срок</th><th>Результат</th><th>Прирост</th><th>Сертификат</th></tr></thead>
      <tbody>${p.courses.map(c=>`<tr><td>${esc(c.title)}</td><td class="note">${c.kind||'—'}</td>
        <td>${stateChip(c.status)}</td><td class="num">${c.due?dmy(c.due):'—'}</td>
        <td class="num">${c.last_pct!==null?c.last_pct+'%':'—'}</td>
        <td class="num">${c.delta!==null?`<span class="delta ${c.delta>=0?'up':'down'}">${c.delta>=0?'+':''}${c.delta}</span>`:'—'}</td>
        <td class="note">${c.certificate?esc(c.certificate.code):'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#btn-assign').onclick=async()=>{
    const r=await api('/api/org/assign',{user_id:id,course:$('#asg-course').value,kind:'mandatory',due_days:30});
    alert(`Курс назначен, срок до ${dmy(r.due)}`); loadChief();
  };
  document.getElementById('emp-detail').scrollIntoView({behavior:'smooth'});
}

/* ===== подписка (разделы 10 и 11 ТЗ) ===== */
function viewBilling(){
  return `<div class="hd"><div class="grow"><div class="eyebrow">Подписка и тарифы</div>
      <h2 style="margin-top:6px">Управление подпиской</h2>
      <p class="lead">Выбор тарифа, счета, продление и лицензии. Онлайн-оплата подключается после договора эквайринга — сейчас работает выставление счёта и активация после подтверждения оплаты.</p>
    </div><button class="btn" data-go="chief">← В кабинет</button></div>
    <div id="bill-body"><p class="note">Загружаю…</p></div>`;
}
async function loadBilling(){
  const el=$('#bill-body'); if(!el) return;
  let r; try{ r=await api('/api/org/subscription'); }catch(e){ el.innerHTML=`<p class="note">${esc(e.message)}</p>`; return; }
  const s=r.subscription;
  el.innerHTML=`
    <div class="grid-2">
      <div class="stat"><div class="v" style="font-size:22px">${esc(s.title)}</div><div class="l">Текущий тариф</div></div>
      <div class="stat"><div class="v">${s.used}${s.limit===null?'':' / '+s.limit}</div><div class="l">Занято мест</div></div>
      <div class="stat"><div class="v" style="font-size:22px">${s.valid_until?dmy(s.valid_until):'—'}</div><div class="l">Действует до</div></div>
      <div class="stat"><div class="v" style="color:var(--${s.active?'good':'crit'});font-size:22px">${s.active?'активна':'не активна'}</div><div class="l">Состояние</div></div>
    </div>
    <div class="block"><h3 class="bh">Тарифы</h3><div class="dirgrid">${r.tariffs.map(t=>`
      <div class="panel panel-pad tariff${s.tariff===t.code?' cur':''}">
        <div class="row" style="justify-content:space-between"><b>${esc(t.title)}</b>
          ${s.tariff===t.code?'<span class="chip done">текущий</span>':''}</div>
        <div class="price">${t.price_month.toLocaleString('ru-RU')} ₸<span>/мес</span></div>
        <p class="note" style="margin-top:6px">${esc(t.descr||'')}</p>
        <p class="note" style="margin-top:6px;color:var(--ink-3)">${t.max_users===null?'Без ограничения пользователей':`До ${t.max_users} пользователей`}</p>
        <div class="row" style="margin-top:12px"><select class="mini" id="mon-${t.code}">
            <option value="12">12 мес</option><option value="6">6 мес</option><option value="1">1 мес</option></select>
          <button class="btn sm primary" data-inv="${t.code}">Выставить счёт</button></div>
      </div>`).join('')}</div></div>
    ${!s.trial?`<div class="panel panel-pad"><div class="eyebrow">Настройки подписки</div>
      <div class="row" style="margin-top:12px;gap:12px">
        <label class="row" style="gap:7px"><input type="checkbox" id="auto" ${s.auto_renew?'checked':''}> Автопродление</label>
        <label class="row" style="gap:7px">Доп. лицензии <input type="number" id="extra" min="0" value="0" class="mini" style="width:80px"></label>
        <button class="btn sm" id="btn-subsave">Сохранить</button>
        <button class="btn sm" id="btn-suspend">${s.status==='suspended'?'Возобновить':'Приостановить'}</button>
      </div></div>`:''}
    <div class="block"><h3 class="bh">Счета</h3>
      ${r.invoices.length?`<div class="tblwrap"><table>
        <thead><tr><th>Номер</th><th>Тариф</th><th>Период</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
        <tbody>${r.invoices.map(i=>`<tr><td class="num">${esc(i.number)}</td><td class="note">${esc(i.tariff_code)}</td>
          <td class="num">${i.period_months} мес</td><td class="num">${i.amount.toLocaleString('ru-RU')} ₸</td>
          <td>${i.status==='paid'?'<span class="chip done">оплачен</span>':'<span class="chip warn">выставлен</span>'}</td>
          <td>${i.status==='paid'?'':`<button class="btn sm" data-pay="${esc(i.number)}">Подтвердить оплату</button>`}</td></tr>`).join('')}</tbody></table></div>`
        :'<div class="panel panel-pad"><p class="note">Счетов пока нет.</p></div>'}</div>`;
  $$('[data-inv]').forEach(b=>b.onclick=async()=>{
    const t=b.dataset.inv, months=+$(`#mon-${t}`).value;
    const r2=await api('/api/org/subscription/invoice',{tariff:t,months});
    alert(`Счёт ${r2.number} на ${r2.amount.toLocaleString('ru-RU')} ₸ (${r2.months} мес).\n${r2.note}`);
    loadBilling();});
  $$('[data-pay]').forEach(b=>b.onclick=async()=>{
    const r2=await api('/api/org/subscription/activate',{number:b.dataset.pay});
    alert(`Подписка активирована до ${dmy(r2.valid_until)}`); loadBilling();});
  const bs=$('#btn-subsave');
  if(bs) bs.onclick=async()=>{ await api('/api/org/subscription/settings',
    {auto_renew:$('#auto').checked,extra_licenses:+$('#extra').value}); loadBilling(); };
  const bsu=$('#btn-suspend');
  if(bsu) bsu.onclick=async()=>{ await api('/api/org/subscription/settings',
    {suspend:!(s.status==='suspended'),resume:s.status==='suspended'}); loadBilling(); };
}

/* ===== настройки обучения (разделы 8 и 15 ТЗ) ===== */
function viewAdmin(){
  return `<div class="hd"><div class="grow"><div class="eyebrow">Настройки обучения</div>
      <h2 style="margin-top:6px">Траектории, тесты и шкала оценок</h2>
      <p class="lead">Матрица «должность → курсы» задаёт, что назначается автоматически. Параметры тестирования и шкала оценок меняются без изменения кода.</p>
    </div><button class="btn" data-go="chief">← В кабинет</button></div>
    <div id="adm-body"><p class="note">Загружаю…</p></div>`;
}
async function loadAdmin(){
  const el=$('#adm-body'); if(!el) return;
  let r; try{ r=await api('/api/admin/matrix'); }catch(e){ el.innerHTML=`<p class="note">${esc(e.message)}</p>`; return; }
  const mk=(role,course)=>r.matrix.find(m=>m.role_code===role&&m.course_code===course);
  const KINDS=[['','—'],['mandatory','Обязательный'],['recommended','Рекомендуемый'],
               ['optional','Дополнительный'],['periodic','Периодический']];
  el.innerHTML=`
    <div class="block"><h3 class="bh">Матрица «должность → курсы»</h3>
      <div class="tblwrap"><table class="matrix"><thead><tr><th>Должность</th>
        ${r.courses.map(c=>`<th title="${esc(c.title)}">${esc(c.title.slice(0,26))}</th>`).join('')}</tr></thead>
        <tbody>${r.roles.map(role=>`<tr><td><b>${esc(role.title)}</b></td>
          ${r.courses.map(c=>{const m=mk(role.code,c.code);
            return `<td><select class="mini mx" data-role="${role.code}" data-course="${c.code}">
              ${KINDS.map(([v,t])=>`<option value="${v}" ${m&&m.kind===v?'selected':(!m&&!v?'selected':'')}>${t}</option>`).join('')}
            </select></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin-top:8px">Изменение применяется сразу и влияет на назначения новых сотрудников.</p></div>
    <div class="block"><h3 class="bh">Параметры тестирования</h3>
      <div class="tblwrap"><table><thead><tr><th>Курс</th><th>Вопросов</th><th>Минут</th><th>Порог, %</th>
        <th>Попыток</th><th>Сертификат, мес</th><th></th></tr></thead>
        <tbody>${r.courses.map(c=>{const e=r.exam.find(x=>x.course_code===c.code)||{q_count:20,time_min:30,pass_pct:80,max_attempts:3,cert_months:12};
          return `<tr><td>${esc(c.title)}</td>
            <td><input class="mini num" type="number" value="${e.q_count}" data-ex="${c.code}" data-f="q_count"></td>
            <td><input class="mini num" type="number" value="${e.time_min}" data-ex="${c.code}" data-f="time_min"></td>
            <td><input class="mini num" type="number" value="${e.pass_pct}" data-ex="${c.code}" data-f="pass_pct"></td>
            <td><input class="mini num" type="number" value="${e.max_attempts}" data-ex="${c.code}" data-f="max_attempts"></td>
            <td><input class="mini num" type="number" value="${e.cert_months||12}" data-ex="${c.code}" data-f="cert_months"></td>
            <td><button class="btn sm" data-savex="${c.code}">Сохранить</button></td></tr>`;}).join('')}</tbody></table></div></div>
    <div class="block"><h3 class="bh">Шкала оценок</h3>
      <div class="panel panel-pad"><div class="stack" id="scale-rows">${r.scale.map((s,i)=>`
        <div class="row" style="gap:10px"><input class="mini num" type="number" value="${s.min_pct}" data-sc="${i}" data-f="min_pct">
          <span class="note">% и выше —</span>
          <input class="mini" value="${esc(s.title)}" data-sc="${i}" data-f="title" style="flex:1">
          <label class="row" style="gap:6px"><input type="checkbox" ${s.passed?'checked':''} data-sc="${i}" data-f="passed"> зачёт</label>
        </div>`).join('')}</div>
        <button class="btn sm primary" id="btn-scale" style="margin-top:12px">Сохранить шкалу</button></div></div>`;
  $$('.mx').forEach(sel=>sel.onchange=async()=>{
    await api('/api/admin/role-course',{role:sel.dataset.role,course:sel.dataset.course,
      kind:sel.value||'optional',due_days:sel.value==='mandatory'?30:null});
  });
  $$('[data-savex]').forEach(b=>b.onclick=async()=>{
    const code=b.dataset.savex, get=f=>+document.querySelector(`[data-ex="${code}"][data-f="${f}"]`).value;
    await api('/api/admin/exam-settings',{course:code,q_count:get('q_count'),time_min:get('time_min'),
      pass_pct:get('pass_pct'),max_attempts:get('max_attempts'),cert_months:get('cert_months')});
    b.textContent='Сохранено'; setTimeout(()=>b.textContent='Сохранить',1500);
    C=await api('/api/content');});
  $('#btn-scale').onclick=async()=>{
    const n=$$('#scale-rows > .row').length, scale=[];
    for(let i=0;i<n;i++){ const g=f=>document.querySelector(`[data-sc="${i}"][data-f="${f}"]`);
      scale.push({min_pct:+g('min_pct').value,title:g('title').value,passed:g('passed').checked}); }
    await api('/api/admin/scale',{scale}); alert('Шкала сохранена');};
}

/* ===== источники ===== */
function viewAbout(){
  return `<div class="hd"><div class="grow"><div class="eyebrow">Нормативная база</div>
      <h2 style="margin-top:6px">Откуда взят материал</h2>
      <p class="lead">Каждая тема и каждый вопрос привязаны к пункту действующего акта. Тексты получены из ИПС «Әділет».</p></div></div>
    <div class="stack">${Object.values(C.acts).map(a=>{
      const n=C.lessons.reduce((s,l)=>s+(l.cards||[]).filter(c=>c.act_code===a.code).length,0);
      return `<div class="panel panel-pad"><div class="row" style="justify-content:space-between;align-items:flex-start">
          <div style="flex:1;min-width:240px"><h3 style="font-size:16px">${esc(a.title)}</h3>
            <p class="note" style="margin-top:6px">№ ${esc(a.num)} от ${esc(a.act_date)}${a.reg?` · рег. № ${esc(a.reg)}`:''}</p></div>
          <div style="text-align:right"><div class="delta">${n}</div><div class="note">норм в курсах</div></div></div>
        ${a.url?`<div class="srcline"><a href="${esc(a.url)}" target="_blank" rel="noopener">Открыть полный текст →</a></div>`:''}</div>`;}).join('')}</div>`;
}

/* ===== связывание ===== */
function bind(){
  $$('[data-dir]').forEach(b=>b.onclick=()=>go({name:'direction',dir:b.dataset.dir}));
  $$('[data-course]').forEach(b=>{ if(b.id==='btn-exam')return;
    b.onclick=()=>go({name:'course',course:b.dataset.course}); });
  $$('[data-lesson]').forEach(b=>{ if(b.id==='btn-read')return;
    b.onclick=()=>go({name:'lesson',lesson:b.dataset.lesson}); });
  $$('[data-cert]').forEach(b=>b.onclick=()=>go({name:'cert',course:b.dataset.cert}));
  $$('[data-go]').forEach(b=>b.onclick=()=>go({name:b.dataset.go}));
  $$('[data-fav]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    const [kind,ref]=b.dataset.fav.split(':');
    await api('/api/favorites/toggle',{kind,ref}); await refresh(); render();});
  const be=$('#btn-exam'); if(be) be.onclick=()=>startExam(be.dataset.course);
  const br=$('#btn-read');
  if(br) br.onclick=async()=>{ await api(`/api/lesson/${br.dataset.lesson}/read`,{}); await refresh(); render(); };
  $$('[data-cadone]').forEach(b=>b.onclick=async()=>{
    await api('/api/corrective/done',{course:b.dataset.course,lesson:b.dataset.cadone});
    await refresh(); render();});
  const bd=$('#btn-drill'); if(bd) bd.onclick=startDrill;
  const dd=$('#d-dir');
  if(dd) dd.onchange=()=>{ const cs=dd.value?dirCourses(dd.value):[];
    $('#d-course').innerHTML='<option value="">Все курсы направления</option>'+
      cs.map(c=>`<option value="${c.code}">${esc(c.title)}</option>`).join('');};
  const ra=$('#btn-readall');
  if(ra) ra.onclick=async()=>{ await api('/api/notifications/read',{}); await refresh(); render(); };
  if(VIEW.name==='chief') loadChief();
  if(VIEW.name==='billing') loadBilling();
  if(VIEW.name==='admin') loadAdmin();
}

/* ===== старт ===== */
$$('.tab').forEach(t=>t.onclick=()=>{stopExam();go({name:t.dataset.view});});
$('#search').addEventListener('input',e=>{ SEARCH=e.target.value;
  if(SEARCH.trim().length>1||SEARCH==='') render(); });
boot();
