/* ================= Конфигурация грейдов ================= */
const GRADES = [
  { n:1, key:'Базовый',     count:20, min:30, desc:'Знание нормы: что положено, кому и кем оказывается' },
  { n:2, key:'Продвинутый', count:25, min:40, desc:'Применение нормы в практической ситуации' },
  { n:3, key:'Экспертный',  count:30, min:50, desc:'Дефекты, снятие оплаты, пересечение норм' }
];
const PASS = 0.8, MAX_TRIES = 3, COMPLAINTS_TO_FREEZE = 3;
const LESSONS = [...G1_LESSONS, ...G2_LESSONS, ...G3_LESSONS];
const QUESTIONS = [...G1_QUESTIONS, ...G2_QUESTIONS, ...G3_QUESTIONS];

/* ================= Состояние ================= */
const KEY = 'osms-course-v1';
const blank = () => ({ grades:{}, complaints:{}, read:{}, ca:{}, name:'' });
let S = load();
function load(){ try{ return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){ return blank(); } }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function gs(n){ return S.grades[n] || (S.grades[n] = { attempts:[], passed:false, caDone:false, caList:[] }); }
function unlocked(n){ return n===1 ? true : !!(S.grades[n-1] && S.grades[n-1].passed); }
function stateOf(n){ return gs(n).passed ? 'done' : (unlocked(n) ? 'open' : 'locked'); }
function frozen(id){ return (S.complaints[id]||0) >= COMPLAINTS_TO_FREEZE; }
function bank(g){ return QUESTIONS.filter(q => q.g===g && !frozen(q.id)); }
function courseProgress(){ return Math.round(GRADES.filter(g=>gs(g.n).passed).length / GRADES.length * 100); }

/* ================= Утилиты ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function shuffle(a){ const r=a.slice(); for(let i=r.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; } return r; }
function srcOf(q){ const a=ACTS[q.a]; return { act:a, point:q.p }; }
function actLine(a){ return `${esc(a.title)} — № ${esc(a.num)} от ${esc(a.date)}`; }
function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function lessonById(id){ return LESSONS.find(l=>l.id===id); }

/* ================= Навигация ================= */
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x===t)));
  ['course','chief','about'].forEach(v => $('#view-'+v).classList.toggle('hidden', v!==t.dataset.view));
  if(EX){ clearInterval(EX.timer); EX = null; renderGrade(); }  // уход со страницы прерывает экзамен
  if(t.dataset.view==='chief') renderChief();
  if(t.dataset.view==='about') renderActs();
  window.scrollTo({top:0,behavior:'smooth'});
}));

/* ================= Боковая панель ================= */
let current = 1;
function renderLadder(){
  $('#ladder').innerHTML = GRADES.map(g => {
    const st = stateOf(g.n), d = gs(g.n);
    const last = d.attempts[d.attempts.length-1];
    const chip = st==='done' ? '<span class="chip done">Сдан</span>'
      : st==='open' ? '<span class="chip open">Доступен</span>'
      : '<span class="chip locked">Закрыт</span>';
    const extra = d.attempts.length ? `<span class="chip ${last.pass?'done':'warn'}">${last.pct}%</span>` : '';
    return `<button class="step" data-state="${st}" aria-current="${g.n===current}" data-g="${g.n}" ${st==='locked'?'disabled':''}>
      <span class="dot">${st==='done'?'✓':g.n}</span>
      <span>
        <h4>${esc(g.key)}</h4>
        <small>${esc(g.desc)}</small>
        <span class="st row" style="gap:6px">${chip}${extra}</span>
      </span></button>`;
  }).join('');
  $('#ladder').querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
    if(b.hasAttribute('disabled')) return;
    current = +b.dataset.g; renderLadder(); renderGrade();
  }));
  const p = courseProgress();
  $('#prog-pct').textContent = p+'%';
  $('#prog-bar').style.width = p+'%';
  $('#prog-bar').parentElement.classList.toggle('good', p===100);
  const total = QUESTIONS.length, fz = QUESTIONS.filter(q=>frozen(q.id)).length;
  $('#bank-note').innerHTML = `${total} вопросов, привязанных к пунктам актов.` + (fz?` <b>${fz}</b> заморожено по жалобам.`:'');
  $('#cert-slot').innerHTML = p===100 ? `<button class="btn primary" style="width:100%" id="btn-cert">Открыть сертификат</button>` : '';
  const bc = $('#btn-cert'); if(bc) bc.addEventListener('click', renderCert);
}

/* ================= Экран грейда ================= */
function renderGrade(){
  const g = GRADES[current-1], d = gs(current);
  const b = bank(current.valueOf());
  const tries = d.attempts.length;
  const last = d.attempts[tries-1];
  const needCA = !d.passed && tries>0 && !d.caDone;
  const blocked = !d.passed && tries>=MAX_TRIES;

  let head = `<div class="hd">
    <div class="grow">
      <div class="eyebrow">Грейд ${g.n} из 3 · ${esc(g.key)}</div>
      <h2 style="margin-top:6px">${esc(g.desc)}</h2>
      <p class="lead">Экзамен: ${g.count} вопросов за ${g.min} минут, проходной порог ${Math.round(PASS*100)}%. Попыток — ${MAX_TRIES}. Вопросы и варианты ответов перемешиваются при каждой попытке.</p>
    </div></div>`;

  let status = '';
  if(d.passed){
    status = `<div class="panel panel-pad" style="border-color:var(--good)">
      <div class="row" style="justify-content:space-between">
        <div><div class="eyebrow" style="color:var(--good)">Грейд сдан</div>
        <p style="margin-top:6px;font-size:15px">Результат последней попытки — <b>${last.pct}%</b> (${last.right} из ${last.total}). ${current<3?'Следующий грейд открыт.':'Курс пройден полностью.'}</p></div>
        <button class="btn sm" id="btn-again">Пройти ещё раз</button>
      </div></div>`;
  } else if(blocked){
    status = `<div class="panel panel-pad" style="border-color:var(--crit)">
      <div class="eyebrow" style="color:var(--crit)">Грейд заблокирован</div>
      <p style="margin-top:6px;font-size:15px">Использованы все ${MAX_TRIES} попытки. Дальнейший доступ открывает руководитель — это управленческое решение, а не автоматическая блокировка навсегда.</p>
      <button class="btn sm" style="margin-top:12px" id="btn-unblock">Разблокировать (действие руководителя)</button></div>`;
  } else if(needCA){
    status = renderCA(d, last);
  }

  const lessons = LESSONS.filter(l => l.grade===current);
  const list = lessons.map(l => {
    const done = !!S.read[l.id];
    return `<div class="panel">
      <div class="panel-pad" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div class="row" style="gap:8px">
            <h3 style="font-size:16.5px">${esc(l.title)}</h3>
            ${done?'<span class="chip done">Изучен</span>':''}
          </div>
          <p class="note" style="margin-top:6px">${esc(l.intro)}</p>
          <p class="note" style="margin-top:6px;color:var(--ink-3)">${l.cards.length} норм · ${QUESTIONS.filter(q=>q.l===l.id).length} вопросов в банке</p>
        </div>
        <button class="btn sm" data-lesson="${l.id}">${done?'Повторить':'Изучить'}</button>
      </div></div>`;
  }).join('');

  const canExam = !blocked && !needCA;
  const examBtn = `<div class="panel panel-pad" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <h3 style="font-size:16.5px">Экзамен грейда</h3>
        <p class="note" style="margin-top:5px">${b.length} вопросов в банке, в билет попадёт ${Math.min(g.count,b.length)}. Попытка ${Math.min(tries+1,MAX_TRIES)} из ${MAX_TRIES}.</p>
      </div>
      <button class="btn primary" id="btn-exam" ${canExam?'':'disabled'}>Начать экзамен</button>
    </div>`;

  const history = tries ? `<div class="panel panel-pad">
      <div class="eyebrow">История попыток</div>
      <div class="grid-2" style="margin-top:12px">${d.attempts.map((a,i)=>`
        <div class="stat ${a.pass?'pass':'fail'}">
          <div class="v">${a.pct}%</div>
          <div class="l">Попытка ${i+1} · ${a.right} из ${a.total}${i>0?` · <span class="delta ${a.pct-d.attempts[i-1].pct>=0?'up':'down'}">${a.pct-d.attempts[i-1].pct>=0?'+':''}${a.pct-d.attempts[i-1].pct} п.п.</span>`:''}</div>
        </div>`).join('')}</div></div>` : '';

  $('#stage').innerHTML = head + status + `<div class="stack">${list}</div>` + examBtn + history;

  $('#stage').querySelectorAll('[data-lesson]').forEach(btn =>
    btn.addEventListener('click', () => openLesson(btn.dataset.lesson)));
  const be=$('#btn-exam'); if(be) be.addEventListener('click', () => startExam(current));
  const ba=$('#btn-again'); if(ba) ba.addEventListener('click', () => startExam(current));
  const bu=$('#btn-unblock'); if(bu) bu.addEventListener('click', () => { gs(current).attempts=[]; gs(current).caDone=false; save(); renderLadder(); renderGrade(); });
  bindCA();
}

/* ================= Корректирующие действия ================= */
function renderCA(d, last){
  const items = d.caList.map(id => lessonById(id)).filter(Boolean);
  return `<div class="ca">
    <div class="eyebrow" style="color:var(--warn)">Шаг 2 из 3 · Корректирующие действия</div>
    <h3 style="margin-top:6px">Попытка не засчитана: ${last.pct}% при пороге ${Math.round(PASS*100)}%</h3>
    <p class="note" style="margin-top:8px;color:var(--ink-2)">Повторный экзамен откроется после того, как вы отметите выполненными корректирующие действия. Это не весь курс заново — только те уроки, по чьим нормам были допущены ошибки.</p>
    <ul class="calist">${items.map(l=>`
      <li><input type="checkbox" data-ca="${l.id}" ${S.ca[l.id]?'checked':''} id="ca-${l.id}">
        <label for="ca-${l.id}" style="flex:1;cursor:pointer">
          <div class="n">${esc(l.title)}</div>
          <div class="s">Ошибок в этой теме: ${last.wrongByLesson[l.id]||0}</div>
        </label>
        <button class="btn sm" data-lesson="${l.id}">Повторить</button>
      </li>`).join('')}</ul>
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="btn-ca-done" ${items.every(l=>S.ca[l.id])?'':'disabled'}>Корректирующие действия выполнены</button>
      <span class="note">Отмечено ${items.filter(l=>S.ca[l.id]).length} из ${items.length}</span>
    </div></div>`;
}
function bindCA(){
  $('#stage').querySelectorAll('[data-ca]').forEach(cb => cb.addEventListener('change', () => {
    S.ca[cb.dataset.ca] = cb.checked; save(); renderGrade();
  }));
  const b = $('#btn-ca-done');
  if(b) b.addEventListener('click', () => {
    const d = gs(current); d.caDone = true;
    d.caList.forEach(id => { S.ca[id] = false; });
    save(); renderGrade();
  });
}

/* ================= Урок ================= */
function openLesson(id){
  const l = lessonById(id);
  const cards = l.cards.map((c,i) => {
    const a = ACTS[c.a];
    return `<div class="norm">
      <div class="norm-h"><span class="pt">п. ${c.p}</span><span class="src">${esc(a.title)}</span></div>
      <div class="norm-b">
        <div class="quote">${esc(c.norm)}</div>
        <div class="plain"><b>На практике</b><span>${esc(c.plain)}</span></div>
        <div class="srcline"><span>№ ${esc(a.num)} от ${esc(a.date)} · рег. № ${esc(a.reg)}</span>
          <a href="${a.url}" target="_blank" rel="noopener">Открыть акт в «Әділет» →</a></div>
      </div></div>`;
  }).join('');
  $('#stage').innerHTML = `<div class="hd">
      <div class="grow">
        <div class="eyebrow">Урок · грейд ${l.grade}</div>
        <h2 style="margin-top:6px">${esc(l.title)}</h2>
        <p class="lead">${esc(l.intro)}</p>
      </div>
      <button class="btn" id="btn-back">← К грейду</button>
    </div>${cards}
    <div class="panel panel-pad row" style="justify-content:space-between">
      <span class="note">Отметьте урок изученным, когда разберётесь с нормами</span>
      <button class="btn primary" id="btn-read">${S.read[l.id]?'Отмечен как изученный':'Отметить изученным'}</button>
    </div>`;
  $('#btn-back').addEventListener('click', () => { renderGrade(); window.scrollTo({top:0,behavior:'smooth'}); });
  $('#btn-read').addEventListener('click', () => { S.read[l.id]=true; save(); renderGrade(); window.scrollTo({top:0,behavior:'smooth'}); });
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ================= Экзамен ================= */
let EX = null;
function startExam(gn){
  const g = GRADES[gn-1];
  const pool = shuffle(bank(gn)).slice(0, g.count);
  EX = { g:gn, qs:pool.map(q => ({ q, order:shuffle([0,1,2,3]) })), i:0, answers:[], left:g.min*60, timer:null };
  EX.timer = setInterval(() => {
    EX.left--; const t = $('#timer');
    if(t){ t.textContent = fmt(EX.left); t.classList.toggle('low', EX.left<=120); }
    if(EX.left<=0){ clearInterval(EX.timer); finishExam(true); }
  }, 1000);
  drawQ();
}
function drawQ(){
  const it = EX.qs[EX.i], q = it.q, a = ACTS[q.a];
  const chosen = EX.answers[EX.i];
  const answered = chosen !== undefined;
  const opts = it.order.map((oi,k) => {
    const isRight = oi===q.c, isChosen = chosen===oi;
    let cls = 'opt';
    if(answered && isRight) cls += ' right';
    else if(answered && isChosen) cls += ' wrong';
    return `<button class="${cls}" data-o="${oi}" ${answered?'disabled':''} aria-pressed="${isChosen?'true':'false'}">
      <span class="k">${'АБВГ'[k]}</span><span>${esc(q.o[oi])}</span></button>`;
  }).join('');
  const explain = answered ? `<div class="explain">
      <div class="row" style="gap:8px;margin-bottom:8px">
        <span class="chip ${chosen===q.c?'done':'crit'}">${chosen===q.c?'Верно':'Неверно'}</span>
        <span class="pt">п. ${q.p}</span>
      </div>
      <p class="t">${esc(q.e)}</p>
      <div class="srcline"><span>${actLine(a)}</span>
        <a href="${a.url}" target="_blank" rel="noopener">Первоисточник →</a>
        <button class="btn sm ghost" id="btn-complain" style="margin-left:auto">Оспорить вопрос</button></div>
      <div id="complain-msg" class="note" style="margin-top:8px"></div>
    </div>` : '';
  const last = EX.i === EX.qs.length-1;
  $('#stage').innerHTML = `
    <div class="exam-top">
      <span class="eyebrow">Экзамен · грейд ${EX.g}</span>
      <span class="qnum">Вопрос ${EX.i+1} из ${EX.qs.length}</span>
      <div class="meter" style="flex:1;min-width:120px"><i style="width:${(EX.i)/EX.qs.length*100}%"></i></div>
      <span class="timer${EX.left<=120?' low':''}" id="timer">${fmt(EX.left)}</span>
    </div>
    <div class="panel panel-pad qbody">
      <p class="qtext">${esc(q.q)}</p>
      <div class="opts">${opts}</div>
      ${explain}
      <div class="exam-foot">
        <button class="btn primary" id="btn-next" ${answered?'':'disabled'}>${last?'Завершить экзамен':'Следующий вопрос'}</button>
        <span class="note">${answered?'':'Выберите один вариант'}</span>
      </div>
    </div>`;
  $('#stage').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    if(EX.answers[EX.i] !== undefined) return;
    EX.answers[EX.i] = +b.dataset.o; drawQ();
  }));
  $('#btn-next').addEventListener('click', () => {
    if(last) finishExam(false); else { EX.i++; drawQ(); window.scrollTo({top:0,behavior:'smooth'}); }
  });
  const bc = $('#btn-complain');
  if(bc) bc.addEventListener('click', () => {
    S.complaints[q.id] = (S.complaints[q.id]||0)+1; save();
    const n = S.complaints[q.id];
    $('#complain-msg').innerHTML = n>=COMPLAINTS_TO_FREEZE
      ? `Жалоба принята (${n}). Вопрос заморожен и больше не будет выдаваться до разбора администратором.`
      : `Жалоба принята (${n} из ${COMPLAINTS_TO_FREEZE}). При ${COMPLAINTS_TO_FREEZE} жалобах вопрос автоматически замораживается.`;
    bc.disabled = true; renderLadder();
  });
}
function finishExam(byTime){
  clearInterval(EX.timer);
  const d = gs(EX.g);
  let right = 0; const wrongByLesson = {}, wrongQs = [];
  EX.qs.forEach((it,i) => {
    if(EX.answers[i] === it.q.c) right++;
    else { wrongByLesson[it.q.l] = (wrongByLesson[it.q.l]||0)+1; wrongQs.push(it.q); }
  });
  const total = EX.qs.length, pct = Math.round(right/total*100), pass = right/total >= PASS;
  d.attempts.push({ pct, right, total, pass, wrongByLesson, byTime });
  if(pass){ d.passed = true; d.caDone = false; }
  else { d.caList = Object.keys(wrongByLesson); d.caDone = false; d.caList.forEach(id => S.ca[id]=false); }
  save();
  const prev = d.attempts.length>1 ? d.attempts[d.attempts.length-2] : null;
  const delta = prev ? pct - prev.pct : null;
  const g = GRADES[EX.g-1];

  const breakdown = wrongQs.length ? `<div class="panel panel-pad">
      <div class="eyebrow">Разбор ошибок</div>
      <div style="margin-top:14px">${wrongQs.map(q => {
        const a = ACTS[q.a];
        return `<div class="norm"><div class="norm-h"><span class="pt">п. ${q.p}</span><span class="src">${esc(a.title)}</span></div>
          <div class="norm-b"><p style="font-weight:600;font-size:15px">${esc(q.q)}</p>
          <div class="plain" style="margin-top:10px"><b>Верно</b><span>${esc(q.o[q.c])}</span></div>
          <p class="note" style="margin-top:10px;color:var(--ink-2)">${esc(q.e)}</p>
          <div class="srcline"><span>№ ${esc(a.num)} от ${esc(a.date)}</span><a href="${a.url}" target="_blank" rel="noopener">Первоисточник →</a></div>
          </div></div>`;
      }).join('')}</div></div>` : '';

  $('#stage').innerHTML = `<div class="hd"><div class="grow">
      <div class="eyebrow">Результат · грейд ${EX.g} «${esc(g.key)}»</div>
      <h2 style="margin-top:6px">${pass?'Грейд сдан':'Порог не достигнут'}</h2>
      <p class="lead">${byTime?'Время экзамена истекло, засчитаны данные ответы. ':''}${pass
        ? (EX.g<3?'Следующий грейд открыт.':'Все три грейда пройдены — доступен сертификат.')
        : `Для сдачи нужно не менее ${Math.round(PASS*100)}%. Назначены корректирующие действия по темам, где были ошибки.`}</p>
    </div></div>
    <div class="grid-2">
      <div class="stat ${pass?'pass':'fail'}"><div class="v">${pct}%</div><div class="l">Результат попытки ${d.attempts.length}</div></div>
      <div class="stat"><div class="v">${right}<span style="font-size:18px;color:var(--ink-3)"> / ${total}</span></div><div class="l">Верных ответов</div></div>
      <div class="stat"><div class="v">${Math.round(PASS*100)}%</div><div class="l">Проходной порог</div></div>
      <div class="stat"><div class="v ${delta===null?'':(delta>=0?'':'')}" style="${delta===null?'':'color:var(--'+(delta>=0?'good':'crit')+')'}">${delta===null?'—':(delta>=0?'+':'')+delta}</div><div class="l">${delta===null?'Первая попытка — база для сравнения':'Прогресс к прошлой попытке, п.п.'}</div></div>
    </div>
    <div class="row"><button class="btn primary" id="btn-to-grade">Вернуться к грейду</button></div>
    ${breakdown}`;
  $('#btn-to-grade').addEventListener('click', () => { renderLadder(); renderGrade(); window.scrollTo({top:0,behavior:'smooth'}); });
  renderLadder();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ================= Сертификат ================= */
function certCode(){
  const base = (S.name||'ANON') + '|' + GRADES.map(g=>gs(g.n).attempts.length).join('');
  let h = 0; for(let i=0;i<base.length;i++){ h = (h*31 + base.charCodeAt(i)) >>> 0; }
  return 'OSMS-' + h.toString(36).toUpperCase().padStart(6,'0').slice(0,6) + '-26';
}
function renderCert(){
  const best = GRADES.map(g => { const a = gs(g.n).attempts.filter(x=>x.pass); return a.length ? Math.max(...a.map(x=>x.pct)) : 0; });
  const avg = Math.round(best.reduce((a,b)=>a+b,0)/3);
  $('#stage').innerHTML = `<div class="hd"><div class="grow">
      <div class="eyebrow">Итог курса</div><h2 style="margin-top:6px">Сертификат</h2>
      <p class="lead">Сертификат подтверждает прохождение всех трёх грейдов и действует 12 месяцев. При изменении норм, вошедших в курс, он не аннулируется, но получает статус «требует актуализации».</p>
    </div><button class="btn" id="btn-back2">← К курсу</button></div>
    <div class="panel panel-pad">
      <div class="row" style="margin-bottom:14px">
        <label class="note" for="nm">Фамилия и инициалы для сертификата</label>
        <input id="nm" value="${esc(S.name)}" placeholder="Например: Серикбаев Е. О."
          style="flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:14px">
      </div>
      <div class="cert">
        <div class="ttl">Сертификат о прохождении обучения</div>
        <div class="ln"></div>
        <div class="meta">настоящим подтверждается, что</div>
        <div class="nm">${esc(S.name || '— укажите фамилию выше —')}</div>
        <div class="meta">прошёл(ла) курс «ОСМС и правила финансирования ПМСП»<br>по нормативным правовым актам Министерства здравоохранения Республики Казахстан</div>
        <div class="ln"></div>
        <div class="meta">Базовый ${best[0]}% · Продвинутый ${best[1]}% · Экспертный ${best[2]}% · средний ${avg}%</div>
        <div class="meta" style="margin-top:8px">Действителен до 02.08.2027</div>
        <div class="code">${certCode()}</div>
      </div>
      <p class="note" style="margin-top:14px">Код проверки формируется по результатам и предъявляется при проверке подлинности. В рабочей версии по нему открывается публичная страница подтверждения.</p>
    </div>`;
  $('#btn-back2').addEventListener('click', () => { renderGrade(); });
  $('#nm').addEventListener('input', e => { S.name = e.target.value; save(); });
  $('#nm').addEventListener('change', renderCert);
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ================= Кабинет руководителя ================= */
const DEMO = [
  { n:'Ахметова Г. С.', role:'ВОП', a1:[72,88], a2:[76,84], a3:[68,null] },
  { n:'Досжанов Б. К.', role:'Терапевт', a1:[85,null], a2:[72,81], a3:[null,null] },
  { n:'Сариева А. М.', role:'Гастроэнтеролог', a1:[90,null], a2:[88,null], a3:[83,null] },
  { n:'Ким В. А.', role:'Терапевт', a1:[64,71], a2:[null,null], a3:[null,null] },
  { n:'Нурлыбек Ж. Т.', role:'Медсестра ОП', a1:[78,86], a2:[70,79], a3:[null,null] }
];
function cell(p){
  if(p[0]===null) return '<span class="chip locked">не начат</span>';
  const first = p[0], second = p[1];
  if(second===null) return `<span class="chip ${first>=80?'done':'warn'}">${first}%</span>`;
  const d = second-first;
  return `<span class="chip ${second>=80?'done':'crit'}">${second}%</span> <span class="delta ${d>=0?'up':'down'}">${d>=0?'+':''}${d}</span>`;
}
function renderChief(){
  const me = GRADES.map(g => { const at = gs(g.n).attempts; return [at[0]?at[0].pct:null, at[1]?at[1].pct:null]; });
  const rows = [{ n:'Вы', role:'Текущий пользователь', a1:me[0], a2:me[1], a3:me[2], me:true }, ...DEMO];
  const done = rows.filter(r => (r.a3[1]??r.a3[0]) >= 80).length;
  const inCA = rows.filter(r => { const vals=[r.a1,r.a2,r.a3]; return vals.some(v => v[0]!==null && v[0]<80 && v[1]===null); }).length;
  const deltas = rows.flatMap(r => [r.a1,r.a2,r.a3]).filter(v => v[0]!==null && v[1]!==null).map(v => v[1]-v[0]);
  const avgD = deltas.length ? Math.round(deltas.reduce((a,b)=>a+b,0)/deltas.length) : null;

  $('#chief-stats').innerHTML = `
    <div class="stat"><div class="v">${rows.length}</div><div class="l">Сотрудников в курсе</div></div>
    <div class="stat"><div class="v" style="color:var(--good)">${done}</div><div class="l">Прошли все три грейда</div></div>
    <div class="stat"><div class="v" style="color:var(--warn)">${inCA}</div><div class="l">На корректирующих действиях</div></div>
    <div class="stat"><div class="v" style="color:var(--${avgD===null||avgD>=0?'good':'crit'})">${avgD===null?'—':(avgD>=0?'+':'')+avgD}</div><div class="l">Средний прирост после корректировки, п.п.</div></div>`;

  $('#chief-tbl').innerHTML = `<thead><tr>
      <th>Сотрудник</th><th>Должность</th><th>Базовый</th><th>Продвинутый</th><th>Экспертный</th><th>Статус</th></tr></thead>
    <tbody>${rows.map(r => {
      const fin = (r.a3[1]??r.a3[0]);
      const st = fin>=80 ? '<span class="chip done">Сертифицирован</span>'
        : [r.a1,r.a2,r.a3].some(v=>v[0]!==null&&v[0]<80&&v[1]===null) ? '<span class="chip warn">Корректирующие действия</span>'
        : '<span class="chip open">В процессе</span>';
      return `<tr${r.me?' style="background:var(--accent-wash)"':''}>
        <td><b>${esc(r.n)}</b></td><td class="note">${esc(r.role)}</td>
        <td class="num">${cell(r.a1)}</td><td class="num">${cell(r.a2)}</td><td class="num">${cell(r.a3)}</td><td>${st}</td></tr>`;
    }).join('')}</tbody>`;
}

/* ================= Источники ================= */
function renderActs(){
  $('#acts-list').innerHTML = Object.values(ACTS).map(a => {
    const qn = QUESTIONS.filter(q => ACTS[q.a].id===a.id).length;
    return `<div class="panel panel-pad">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:240px">
          <h3 style="font-size:16px">${esc(a.title)}</h3>
          <p class="note" style="margin-top:6px">Приказ № ${esc(a.num)} от ${esc(a.date)} · зарегистрирован в Минюсте под № ${esc(a.reg)}</p>
        </div>
        <div style="text-align:right"><div class="delta">${qn}</div><div class="note">вопросов</div></div>
      </div>
      <div class="srcline"><a href="${a.url}" target="_blank" rel="noopener">Открыть полный текст в «Әділет» →</a></div>
    </div>`;
  }).join('');
}

/* ================= Старт ================= */
$('#btn-reset').addEventListener('click', () => {
  if(confirm('Сбросить весь прогресс курса? Это действие нельзя отменить.')){
    S = blank(); save(); current = 1; renderLadder(); renderGrade();
  }
});
renderLadder();
renderGrade();
