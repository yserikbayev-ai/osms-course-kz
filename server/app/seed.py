"""Импорт справочника ролей и учебного контента в БД."""
import json, os, sys
from . import db

ROLES = [
    ("director",      "Руководитель / директор медицинской организации", True,  10),
    ("chief_doctor",  "Главный врач",                                    True,  20),
    ("deputy_chief",  "Заместитель главного врача",                      True,  30),
    ("admin",         "Администратор",                                   True,  40),
    ("accountant",    "Бухгалтер",                                       False, 50),
    ("gp",            "Врач общей практики",                             False, 60),
    ("therapist",     "Терапевт",                                        False, 70),
    ("pediatrician",  "Педиатр",                                         False, 80),
    ("rehab",         "Реабилитолог",                                    False, 90),
    ("cardiologist",  "Кардиолог",                                       False, 100),
    ("ophthalmologist","Офтальмолог",                                    False, 110),
    ("neurologist",   "Невролог",                                        False, 120),
    ("surgeon",       "Хирург",                                          False, 130),
    ("gynecologist",  "Гинеколог",                                       False, 140),
    ("lab",           "Лаборант",                                        False, 150),
    ("nurse",         "Медицинская сестра",                              False, 160),
]

def seed_roles():
    for code, title, manage, sort in ROLES:
        db.ex("""INSERT INTO roles(code,title,can_manage_org,sort) VALUES(%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title,
                 can_manage_org=EXCLUDED.can_manage_org, sort=EXCLUDED.sort""",
              (code, title, manage, sort))
    print(f"роли: {len(ROLES)}")

def seed_content(path):
    d = json.load(open(path, encoding="utf-8"))
    for code, a in d["acts"].items():
        db.ex("""INSERT INTO acts(code,doc_id,num,act_date,reg,title,url)
                 VALUES(%s,%s,%s,%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET num=EXCLUDED.num, act_date=EXCLUDED.act_date,
                   reg=EXCLUDED.reg, title=EXCLUDED.title, url=EXCLUDED.url""",
              (code, a.get("id"), a.get("num"), a.get("date"), a.get("reg"), a.get("title"), a.get("url")))
    for i, x in enumerate(d["directions"]):
        db.ex("""INSERT INTO directions(code,title,descr,icon,sort) VALUES(%s,%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title, descr=EXCLUDED.descr,
                   icon=EXCLUDED.icon, sort=EXCLUDED.sort""",
              (x["id"], x["title"], x.get("desc"), x.get("icon"), i * 10))
    for c in d["courses"]:
        db.ex("""INSERT INTO courses(code,direction_code,title,intro,step) VALUES(%s,%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET direction_code=EXCLUDED.direction_code,
                   title=EXCLUDED.title, intro=EXCLUDED.intro, step=EXCLUDED.step""",
              (c["id"], c["dir"], c["title"], c.get("intro"), c.get("step", 1)))
    lesson_course = {}
    for c in d["courses"]:
        for j, lid in enumerate(c["lessons"]):
            lesson_course[lid] = (c["id"], j * 10)
    n_cards = 0
    for l in d["lessons"]:
        cc = lesson_course.get(l["id"])
        if not cc:
            continue
        db.ex("""INSERT INTO lessons(code,course_code,title,intro,level,video_url,sort)
                 VALUES(%s,%s,%s,%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET course_code=EXCLUDED.course_code, title=EXCLUDED.title,
                   intro=EXCLUDED.intro, level=EXCLUDED.level, sort=EXCLUDED.sort""",
              (l["id"], cc[0], l["title"], l.get("intro"),
               l.get("level") or l.get("grade") or 1, l.get("video"), cc[1]))
        db.ex("DELETE FROM cards WHERE lesson_code=%s", (l["id"],))
        for k, card in enumerate(l.get("cards", [])):
            db.ex("""INSERT INTO cards(lesson_code,act_code,point,norm,plain,sort)
                     VALUES(%s,%s,%s,%s,%s,%s)""",
                  (l["id"], card.get("a"), card.get("p"), card.get("norm"), card.get("plain"), k * 10))
            n_cards += 1
    n_q = 0
    for q in d["questions"]:
        if q["l"] not in lesson_course:
            continue
        db.ex("""INSERT INTO questions(code,lesson_code,level,body,options,correct,explain,act_code,point)
                 VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)
                 ON CONFLICT (code) DO UPDATE SET lesson_code=EXCLUDED.lesson_code, level=EXCLUDED.level,
                   body=EXCLUDED.body, options=EXCLUDED.options, correct=EXCLUDED.correct,
                   explain=EXCLUDED.explain, act_code=EXCLUDED.act_code, point=EXCLUDED.point""",
              (q["id"], q["l"], q.get("g", 1), q["q"], json.dumps(q["o"], ensure_ascii=False),
               q["c"], q.get("e"), q.get("a"), q.get("p")))
        n_q += 1
    print(f"акты: {len(d['acts'])} · направления: {len(d['directions'])} · курсы: {len(d['courses'])} · "
          f"уроки: {len(d['lessons'])} · карточки норм: {n_cards} · вопросы: {n_q}")

if __name__ == "__main__":
    db.init_schema()
    seed_roles()
    seed_content(sys.argv[1] if len(sys.argv) > 1 else "/opt/lms/content.json")
    print("импорт завершён")
