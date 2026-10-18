# Интерфейсы и правила проекта

## Правила, которые нельзя вывести из кода

- Репозиторий: ~/Projects/osms-course-kz, ветка feat/structure-and-first-direction. Коммитить только в неё. Не пушить, не деплоить.
- Продуктовая версия — серверная: server/ (FastAPI, psycopg, PostgreSQL), интерфейс server/static/. Клиентскую версию (source/, index.html в корне) не трогать.
- Нет зависимости — верни BLOCKED, ничего не ставь. Python-окружение: server/venv если есть, иначе системный python3 с fastapi, psycopg, bcrypt, qrcode. PostgreSQL: локальные бинарники /opt/homebrew/bin (initdb, pg_ctl, psql). Тесты поднимают ВРЕМЕННЫЙ кластер в каталоге tmp на порту 54399, прод и чужие базы не трогать.
- Старые коды курсов, уроков, вопросов не менять. Данные прогресса, сертификатов, назначений не удалять.
- Секреты и пароли в файлы не писать.
- Ничего не додумывать: норма, которой нет в тексте акта, не попадает в карточку, вопрос или вариант ответа. Не хватает первоисточника — тема остаётся «планируется», и ты пишешь об этом в отчёте.
- База НПА (тексты актов, md): /Users/yerzhanserikbayev/Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical Registration/01_Источники/База_знаний_НПА_МЗ_РК, файлы documents/<год>/…, реестр index.csv (разделитель «;», колонки: id, дата, вид, номер, … статус, название). Нужен статус «Новый» или «Обновленный», не «Утративший силу».
- Источники проекта (тексты, реквизиты): /Users/yerzhanserikbayev/Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical LMS/01_Источники/. Артефакты, скриншоты: /Users/yerzhanserikbayev/Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical LMS/03_Артефакты/. Документы в Drive не в репозиторий.
- Структура из перечня Бауржана (источник правды для 19/53/189 и дублей): /Users/yerzhanserikbayev/Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical LMS/03_Артефакты/Fit-gap_перечень_направлений_vs_портал_2026-10-18.xlsx, листы «Курсы (раскладка)» и «Курсы (итог)», «Темы (189)», «Должности (Структура LMS)».
- Язык интерфейса и содержания: русский.

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| schema4 | новые колонки статусов, ссылок модулей и таблица видео-слотов | миграция, идемпотентная | порядок ALTER |
| structure | файл структуры 19/53/189 и его загрузка | load_structure(path) -> {directions, courses, modules, links} | перенос старых направлений и курсов |
| absorb | поглощение старых курсов направления 2 | absorb_direction2() -> {moved_lessons, repointed_assignments, archived_courses} | разрешение конфликтов назначений |
| catalog | выдача каталога со статусами и счётчиками, фильтр планируемого | поля status, link, published_count в ответе контента; отказ экзамену и тренировке на планируемый курс | детали выборки |
| video | слоты, нормализация ссылки, выгрузка и загрузка таблицы | video_export(path), video_import(path) -> {inserted, skipped, errors}, embed_url(raw) -> str | разбор форматов YouTube |
| content2 | уроки, карточки, вопросы направления 2 и загрузка | load_content(path) в справочник актов, карточек, вопросов | форма источника |
| check_content | правила качества содержания | check_content(path) -> list[error], код выхода не ноль при ошибках | сопоставление цитат с текстом акта |
| ui | серый каталог, блок видео, счётчики | экраны на существующем фронтенде | вёрстка |

Швы для тестов: (1) публичные вызовы через API сервера на временной БД; (2) check_content на файле содержания.

## Что построили готовые таски

(пока пусто — дописывают таски по мере завершения)

## Из таска 02 — источники и проверка

- `server/tools/check_content.py`: `check_content(path, acts_path=None, root=None) -> list[str]` (список нарушений, пусто = ок). CLI: `check_content.py <файл> [--acts acts.json] [--root папка проекта на Drive]`, код выхода 1 при ошибках. Формат файла как у `server/content.json` (acts, lessons[cards: a,p,norm], questions: a,p,o,c,e,g,l). 12 правил, цитаты сверяются с текстом акта дословно (ё=е).
- `server/sources/acts.json`: акты A7..A17 {id,num,date,reg,title,url,status,text,topics}; `text` — путь от папки проекта на Drive (`01_Источники/Акты_направления_2/`).
- Темы без акта (остаются «Скоро»): K02.3.2 календарь прививок, K02.1.3 факторы риска хронических заболеваний.
- Старые карточки A7–A11 в `server/content.json` дословность не проходят — новое содержание писать с дословными цитатами, старое не копировать.
- Тесты проверки: `~/.venvs/lms/bin/python -m pytest server/tools -q`

- Таск 01. Команда тестов (одна): `cd server && ~/.venvs/lms/bin/python -m pytest tests -q`. Сама поднимает временный кластер PostgreSQL (порт 54399, trust, /opt/homebrew/opt/postgresql@17/bin) и гасит его в конце сессии; внешняя база не нужна. Если задан LMS_DB_DSN с базой *_test, берётся он. Фикстура `db` (tests/conftest.py) даёт чистую БД со схемами 1–4 и сидом прежних 10 курсов.
- Таск 01. `app.structure`: `load_structure(path)`, `absorb_direction2()` (вызывать после load_structure), `load_content(path)` (content.json + у урока `course`, `module`, `status`; модуль-ссылка отвергается). Схема: `app/schema4.sql` (courses.status, modules.status/link_module/audience, directions.num, таблица video_slots(lesson_code, url)). Применять в main._startup после schema3.


## Из таска 03 — каталог, статусы, видео

- `GET /api/content`: у направления `total_modules`, `published_count`; у курса и модуля `status`; у модуля `link` (код оригинала); у урока `video` (embed-адрес или null); верхний уровень `video_placeholder="/static/video-placeholder.svg"`. Архивные курсы из ответа убраны.
- `POST /api/exam/start`, `/api/drill/start`, `/api/org/assign` на планируемый/архивный курс → 409 с текстом. Тренировка по направлению берёт только опубликованные.
- `logic.unavailable_reason(course) -> str|None` (409 бросают main и api2); автоназначения, сроки и сертификаты считают только опубликованные.
- `seed2.seed_structure_matrix()`; `STRUCT_MATRIX` — только 7 должностей листа «Должности»; у 9 прочих ролей назначений по новым курсам нет до сверки владельцем; сомнительные сопоставления (K03.2, K18.3, d04) помечены в комментариях.
- `video.embed_url(raw)` → youtube-nocookie embed или ValueError; `video.video_export(path)`, `video.video_import(path)` → {inserted, skipped, errors}. CLI: `python -m app.video export|import <файл.csv>`.
- `main._startup`: схемы 1–4 → load_structure → absorb_direction2 → seed_structure_matrix (однократно).
- Тесты: `cd server && ~/.venvs/lms/bin/python -m pytest tests ../server/tools -q`

## Из таска 06
- `server/content/content-k023.json`: 2 урока — V1 → модуль K02.3.1 (53 карточки, 38 вопросов, акты A7, A8, A12), V2 → модуль K02.3.3 (27 карточек, 18 вопросов, акты A14, A15, A16). Коды вопросов k23xxx.
- `structure.LESSON_HOME["V2"] = ("K02.3","K02.3.3")` (было K02.3.1), ожидание в `tests/test_absorb.py` обновлено.
- Старые вопросы v101–v115 заморожены при load_content. exam_settings K02.3: 20 вопросов, 40 мин, 80 %, 3 попытки.
- K02.3.2 «Национальный календарь профилактических прививок» остаётся «планируется»: акта (Постановление № 612) в базе нет.
- Объяснения вопросов (поле e) check_content не сверяет, только цитаты карточек.

## Из таска 07
- UI: `server/static/app.js`, `index.html`. Каталог со счётчиком «опубликовано N из M тем», серые «Скоро», планируемый курс показывает только состав (без экзамена/избранного/попыток), модуль-ссылка → оригинал. Блок видео по `lesson.video` (embed только `https://www.youtube-nocookie.com/embed/`), иначе одна заглушка «Видео готовится».
- Сквозной тест: `cd server && ~/.venvs/lms/bin/python -m pytest tests/e2e -q` (API, без DOM). DOM-тестов нет, UI проверен глазами на скриншотах в `03_Артефакты`.
- Иконки направлений пустые (structure.json).
