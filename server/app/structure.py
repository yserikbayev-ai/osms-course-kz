"""Структура 19/53/189 как данные, перенос старых направлений, поглощение направления 2, загрузка содержания."""
import json
from . import db

# старые направления -> новые (спецификация, «Направления»)
OLD_DIRECTIONS = {"attach": "d01", "district": "d01", "vaccine": "d02", "checkup": "d02",
                  "dispensary": "d02", "finance": "d17"}

# поглощение направления 2: старый курс -> новый; урок -> (курс, модуль-тема по листу «Темы (189)»)
OLD_TO_NEW = {"c-chk-base": "K02.1", "c-chk-screen": "K02.1", "c-disp-base": "K02.2", "c-vax-base": "K02.3"}
LESSON_HOME = {"P1": ("K02.1", "K02.1.1"), "P2": ("K02.1", "K02.1.2"), "D1": ("K02.2", "K02.2.1"),
               "V1": ("K02.3", "K02.3.1"), "V2": ("K02.3", "K02.3.3")}
KIND_RANK = {"mandatory": 0, "periodic": 1, "recommended": 2, "optional": 3}   # меньше = жёстче

def load_structure(path):
    d = json.load(open(path, encoding="utf-8"))
    for x in d["directions"]:
        db.ex("""INSERT INTO directions(code,title,num,sort) VALUES(%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title, num=EXCLUDED.num, sort=EXCLUDED.sort""",
              (x["code"], x["title"], x["num"], x["num"] * 10))
    # курсы переезжают до удаления старых направлений, иначе каскад удалит курсы
    for old, new in OLD_DIRECTIONS.items():
        db.ex("UPDATE courses SET direction_code=%s WHERE direction_code=%s", (new, old))
        db.ex("DELETE FROM directions d WHERE code=%s AND NOT EXISTS (SELECT 1 FROM courses WHERE direction_code=d.code)", (old,))
    for c in d["courses"]:   # статус не трогаем: уже опубликованное остаётся
        db.ex("""INSERT INTO courses(code,direction_code,title,step,status) VALUES(%s,%s,%s,%s,'планируется')
                 ON CONFLICT (code) DO UPDATE SET direction_code=EXCLUDED.direction_code,
                   title=EXCLUDED.title, step=EXCLUDED.step""",
              (c["code"], c["direction"], c["title"], c["step"]))
    for m in d["modules"]:
        db.ex("""INSERT INTO modules(code,course_code,title,sort,audience,status) VALUES(%s,%s,%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET course_code=EXCLUDED.course_code, title=EXCLUDED.title,
                   sort=EXCLUDED.sort, audience=EXCLUDED.audience,
                   status=CASE WHEN modules.status='опубликован' THEN modules.status ELSE EXCLUDED.status END""",
              (m["code"], m["course"], m["title"], m["sort"], m.get("audience"),
               "ссылка" if m.get("link_module") else "планируется"))
    for m in d["modules"]:
        if m.get("link_module"):
            db.ex("UPDATE modules SET link_module=%s WHERE code=%s", (m["link_module"], m["code"]))
    return {"directions": len(d["directions"]), "courses": len(d["courses"]),
            "modules": len(d["modules"]), "links": sum(1 for m in d["modules"] if m.get("link_module"))}

def _strict(rows, date_col):
    """Более жёсткий: тип обязательности строже, затем срок раньше (пустой срок — самый мягкий)."""
    return min(rows, key=lambda r: (KIND_RANK.get(r["kind"], 9), r[date_col] is None, r[date_col] or 0, r["id"]))

def _exam_settings(cur, course, refresh=False):
    """Единая формула настроек экзамена: вопросов min(20, max(5, живых)), время 2 мин на вопрос (не меньше 10),
    порог 80. refresh=True пересчитывает число вопросов и время (порог и попытки не трогает)."""
    cur.execute("""INSERT INTO exam_settings(course_code,q_count,time_min,pass_pct,max_attempts)
                   SELECT %s, LEAST(20,GREATEST(5,n)), GREATEST(10,2*LEAST(20,GREATEST(5,n))), 80, 3
                   FROM (SELECT count(*) n FROM questions q JOIN lessons l ON l.code=q.lesson_code
                         WHERE l.course_code=%s AND NOT q.frozen) t
                   ON CONFLICT (course_code) DO """ + ("UPDATE SET q_count=EXCLUDED.q_count, time_min=EXCLUDED.time_min"
                   if refresh else "NOTHING"), (course, course))

def absorb_direction2():
    """Старые курсы направления 2 -> K02.1-3. Все шаги в одной транзакции, повтор ничего не меняет."""
    olds = list(OLD_TO_NEW)
    with db.pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT code FROM courses WHERE code = ANY(%s)", (sorted(set(OLD_TO_NEW.values())),))
        if len(cur.fetchall()) != 3:
            raise RuntimeError("сначала load_structure: курсов K02.1-3 нет")
        moved = 0
        for lesson, (course, module) in LESSON_HOME.items():
            cur.execute("""UPDATE lessons SET course_code=%s, module_code=%s
                           WHERE code=%s AND (course_code<>%s OR module_code IS DISTINCT FROM %s)""",
                        (course, module, lesson, course, module))
            moved += cur.rowcount
            cur.execute("UPDATE modules SET status='опубликован' WHERE code=%s AND status='планируется'", (module,))
        cur.execute("INSERT INTO video_slots(lesson_code) SELECT code FROM lessons ON CONFLICT DO NOTHING")
        repointed = 0
        for new in sorted(set(OLD_TO_NEW.values())):
            src = [o for o, n in OLD_TO_NEW.items() if n == new]
            cur.execute("SELECT DISTINCT user_id FROM assignments WHERE course_code = ANY(%s)", (src,))
            for (uid,) in [tuple(r.values()) for r in cur.fetchall()]:
                cur.execute("SELECT * FROM assignments WHERE user_id=%s AND course_code = ANY(%s)", (uid, src + [new]))
                rows = cur.fetchall()
                repointed += sum(r["course_code"] in src for r in rows)
                win = _strict(rows, "due_date")
                cur.execute("DELETE FROM assignments WHERE id = ANY(%s) AND id<>%s", ([r["id"] for r in rows], win["id"]))
                cur.execute("UPDATE assignments SET course_code=%s WHERE id=%s", (new, win["id"]))
            cur.execute("SELECT DISTINCT role_code FROM role_courses WHERE course_code = ANY(%s)", (src,))
            for (role,) in [tuple(r.values()) for r in cur.fetchall()]:
                cur.execute("SELECT * FROM role_courses WHERE role_code=%s AND course_code = ANY(%s)", (role, src + [new]))
                rows = cur.fetchall()
                win = _strict(rows, "due_days")
                cur.execute("DELETE FROM role_courses WHERE id = ANY(%s) AND id<>%s", ([r["id"] for r in rows], win["id"]))
                cur.execute("UPDATE role_courses SET course_code=%s WHERE id=%s", (new, win["id"]))
            cur.execute("UPDATE corrective_actions SET course_code=%s WHERE course_code = ANY(%s) AND NOT done", (new, src))
            cur.execute("UPDATE courses SET status='опубликован' WHERE code=%s", (new,))
            _exam_settings(cur, new)
        cur.execute("UPDATE courses SET status='архив' WHERE code = ANY(%s) AND status<>'архив'", (olds,))
        return {"moved_lessons": moved, "repointed_assignments": repointed, "archived_courses": cur.rowcount}

def load_content(path):
    """Содержание в формате content.json: acts, lessons (+course, module, status), questions.
    status урока переводит его модуль в «опубликован»; модуль-ссылка уроков не принимает."""
    d = json.load(open(path, encoding="utf-8"))
    n_cards = 0
    with db.pool.connection() as conn, conn.cursor() as cur:
        for code, a in d.get("acts", {}).items():
            cur.execute("""INSERT INTO acts(code,doc_id,num,act_date,reg,title,url) VALUES(%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (code) DO UPDATE SET doc_id=EXCLUDED.doc_id, num=EXCLUDED.num,
                             act_date=EXCLUDED.act_date, reg=EXCLUDED.reg, title=EXCLUDED.title, url=EXCLUDED.url""",
                        (code, a.get("id"), a.get("num"), a.get("date"), a.get("reg"), a.get("title"), a.get("url")))
        for i, l in enumerate(d.get("lessons", [])):
            mod = l.get("module")
            if mod:
                cur.execute("SELECT status FROM modules WHERE code=%s", (mod,))
                m = cur.fetchone()
                if not m:
                    raise ValueError(f"модуль {mod} не найден")
                if m["status"] == "ссылка":
                    raise ValueError(f"модуль {mod} — ссылка на оригинал, своих уроков не имеет")
            cur.execute("""INSERT INTO lessons(code,course_code,module_code,title,intro,level,sort)
                           VALUES(%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (code) DO UPDATE SET course_code=EXCLUDED.course_code,
                             module_code=EXCLUDED.module_code, title=EXCLUDED.title, intro=EXCLUDED.intro,
                             level=EXCLUDED.level, sort=EXCLUDED.sort""",
                        (l["id"], l["course"], mod, l["title"], l.get("intro"),
                         l.get("grade") or l.get("level") or 1, i * 10))
            if mod and l.get("status") == "опубликован":
                cur.execute("UPDATE modules SET status='опубликован' WHERE code=%s", (mod,))
            cur.execute("INSERT INTO video_slots(lesson_code) VALUES(%s) ON CONFLICT DO NOTHING", (l["id"],))
            cur.execute("DELETE FROM cards WHERE lesson_code=%s", (l["id"],))
            for k, c in enumerate(l.get("cards", [])):
                cur.execute("INSERT INTO cards(lesson_code,act_code,point,norm,plain,sort) VALUES(%s,%s,%s,%s,%s,%s)",
                            (l["id"], c.get("a"), c.get("p"), c["norm"], c.get("plain"), k * 10))
                n_cards += 1
            cur.execute("UPDATE questions SET frozen=TRUE WHERE lesson_code=%s AND NOT (code = ANY(%s))",
                        (l["id"], [q["id"] for q in d.get("questions", []) if q["l"] == l["id"]]))
        for q in d.get("questions", []):
            cur.execute("""INSERT INTO questions(code,lesson_code,level,body,options,correct,explain,act_code,point)
                           VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (code) DO UPDATE SET lesson_code=EXCLUDED.lesson_code, level=EXCLUDED.level,
                             body=EXCLUDED.body, options=EXCLUDED.options, correct=EXCLUDED.correct,
                             explain=EXCLUDED.explain, act_code=EXCLUDED.act_code, point=EXCLUDED.point""",
                        (q["id"], q["l"], q.get("g", 1), q["q"], json.dumps(q["o"], ensure_ascii=False),
                         q["c"], q.get("e"), q.get("a"), q.get("p")))
        for course in {l["course"] for l in d.get("lessons", [])}:
            _exam_settings(cur, course, refresh=True)
    return {"acts": len(d.get("acts", {})), "lessons": len(d.get("lessons", [])),
            "cards": n_cards, "questions": len(d.get("questions", []))}
