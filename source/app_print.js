/* Все материалы курса без результатов обучения и навигации. */
function viewCoursePrint(courseId){
  const c = C_BY_ID[courseId];
  const lessons = courseLessons(c).map((l, i) => `
    <section class="print-lesson">
      <h2>Урок ${i + 1}. ${esc(l.title)}</h2>
      <p>${esc(l.intro)}</p>
      ${l.cards.map(cd => {
        const a = ACTS[cd.a];
        return `<section class="print-norm">
          <h3>п. ${esc(cd.p)} · ${esc(a.title)}</h3>
          <p>${esc(cd.norm)}</p>
          <p><b>На практике:</b> ${esc(cd.plain)}</p>
          <p class="print-source">№ ${esc(a.num)} от ${esc(a.date)} · рег. № ${esc(a.reg)}<br>
            Источник: <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a></p>
        </section>`;
      }).join('')}
    </section>`).join('');
  return `<div class="print-controls panel panel-pad">
      <p>В документ включены все уроки выбранного курса, тексты норм, пояснения и ссылки на приказы.</p>
      <p>Нажмите «Печать / сохранить PDF» и выберите «Сохранить как PDF» в окне печати. Для чистого документа отключите колонтитулы браузера.</p>
      <div class="row">
        <button class="btn primary" id="btn-print-course">Печать / сохранить PDF</button>
        <button class="btn" data-course="${c.id}">← К курсу</button>
      </div>
    </div>
    <article class="course-document">
      <p>Обучение медперсонала по НПА РК</p>
      <h1>${esc(c.title)}</h1>
      <p>${esc(c.intro)}</p>
      <p class="print-source">Источник: ИПС «Әділет», выгрузка 01.08.2026.
        Материал носит учебный характер; для юридически значимых решений сверяйтесь с первоисточниками по ссылкам.</p>
      ${lessons}
    </article>`;
}
