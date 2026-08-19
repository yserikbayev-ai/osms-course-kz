"""Справочники этапов 2–5: траектории по должностям, шкала оценок, тарифы,
настройки тестов, модули курсов."""
from . import db

# Раздел 2 ТЗ: какие курсы обязательны, рекомендованы и повторяются для каждой должности.
# M — обязательный, R — рекомендуемый, O — дополнительный, P(n) — периодический раз в n месяцев.
MATRIX = {
 "gp":            {"c-attach-base":"M","c-dist-base":"M","c-dist-visit":"M","c-vax-base":"M",
                   "c-chk-base":"M","c-chk-screen":"M","c-disp-base":"M",
                   "c-osms-right":"R","c-osms-drug":"R","c-osms-monitor":"P12"},
 "therapist":     {"c-attach-base":"M","c-dist-base":"M","c-dist-visit":"M","c-chk-base":"M",
                   "c-disp-base":"M","c-vax-base":"R","c-osms-right":"R","c-osms-monitor":"P12"},
 "pediatrician":  {"c-vax-base":"M","c-chk-base":"M","c-disp-base":"M","c-attach-base":"M",
                   "c-dist-base":"R","c-chk-screen":"R","c-osms-right":"R"},
 "nurse":         {"c-vax-base":"M","c-chk-base":"M","c-dist-base":"M","c-attach-base":"R",
                   "c-chk-screen":"R"},
 "accountant":    {"c-osms-right":"M","c-osms-drug":"M","c-osms-monitor":"M","c-attach-base":"R"},
 "director":      {"c-osms-right":"M","c-osms-monitor":"M","c-attach-base":"R","c-dist-base":"R"},
 "chief_doctor":  {"c-osms-right":"M","c-osms-monitor":"M","c-attach-base":"M","c-chk-base":"R",
                   "c-vax-base":"R","c-disp-base":"R"},
 "deputy_chief":  {"c-osms-right":"M","c-osms-monitor":"M","c-attach-base":"M","c-dist-visit":"R"},
 "admin":         {"c-attach-base":"M","c-osms-right":"R"},
 "rehab":         {"c-osms-right":"M","c-disp-base":"M","c-dist-visit":"R"},
 "cardiologist":  {"c-osms-right":"M","c-disp-base":"M","c-chk-screen":"R"},
 "ophthalmologist":{"c-osms-right":"M","c-disp-base":"R"},
 "neurologist":   {"c-osms-right":"M","c-disp-base":"M"},
 "surgeon":       {"c-osms-right":"M","c-dist-visit":"R"},
 "gynecologist":  {"c-osms-right":"M","c-chk-screen":"M","c-disp-base":"R"},
 "lab":           {"c-osms-right":"M","c-chk-screen":"R"},
}

SCALE = [(90,"отлично",True),(80,"хорошо",True),(70,"удовлетворительно",False),(0,"не пройдено",False)]

TARIFFS = [
 ("s","Тариф S",10,29000,"До 10 пользователей. Все курсы, тесты, сертификаты, отчёт руководителя.",10),
 ("m","Тариф M",50,89000,"До 50 пользователей. Всё из тарифа S плюс подразделения в отчётности.",20),
 ("l","Тариф L",100,149000,"До 100 пользователей. Всё из тарифа M плюс приоритетная поддержка.",30),
 ("enterprise","Корпоративный",None,299000,"Без ограничения по числу сотрудников, все направления обучения.",40),
]

# Разбивка курсов на модули (раздел 6 ТЗ): направление → курс → модуль → урок
MODULES = {
 "c-vax-base":     [("m-vax-org","Модуль 1. Организация прививочной работы",["V1"]),
                    ("m-vax-adm","Модуль 2. Допуск и согласие",["V2"])],
 "c-attach-base":  [("m-att-base","Модуль 1. Основы прикрепления",["L1.2"]),
                    ("m-att-hard","Модуль 2. Нестандартные ситуации",["L2.3"])],
 "c-dist-visit":   [("m-dv-who","Модуль 1. Кто и что оказывает",["L1.3"]),
                    ("m-dv-doc","Модуль 2. Документация и маршрутизация",["L2.1"])],
 "c-osms-monitor": [("m-mon-types","Модуль 1. Виды дефектов",["L3.1"]),
                    ("m-mon-obj","Модуль 2. Возражения и последствия",["L3.2"]),
                    ("m-mon-cross","Модуль 3. Пересечение норм",["L3.3"])],
}

def seed_matrix():
    n = 0
    for role, courses in MATRIX.items():
        if not db.q("SELECT 1 FROM roles WHERE code=%s", (role,), one=True):
            continue
        for course, mark in courses.items():
            if not db.q("SELECT 1 FROM courses WHERE code=%s", (course,), one=True):
                continue
            kind = {"M":"mandatory","R":"recommended","O":"optional"}.get(mark[0], "periodic")
            period = int(mark[1:]) if mark.startswith("P") else None
            if period: kind = "periodic"
            due = 30 if kind == "mandatory" else (60 if kind == "periodic" else None)
            db.ex("""INSERT INTO role_courses(role_code,course_code,kind,period_months,due_days)
                     VALUES(%s,%s,%s,%s,%s)
                     ON CONFLICT (role_code,course_code) DO UPDATE SET kind=EXCLUDED.kind,
                       period_months=EXCLUDED.period_months, due_days=EXCLUDED.due_days""",
                  (role, course, kind, period, due))
            n += 1
    print(f"связей роль→курс: {n}")

def seed_scale():
    db.ex("DELETE FROM grading_scale")
    for mn, title, passed in SCALE:
        db.ex("INSERT INTO grading_scale(min_pct,title,passed) VALUES(%s,%s,%s)", (mn, title, passed))
    print(f"шкала оценок: {len(SCALE)} ступени")

def seed_tariffs():
    for code, title, mx, price, descr, sort in TARIFFS:
        db.ex("""INSERT INTO tariffs(code,title,max_users,price_month,descr,sort)
                 VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title,
                   max_users=EXCLUDED.max_users, price_month=EXCLUDED.price_month,
                   descr=EXCLUDED.descr, sort=EXCLUDED.sort""", (code, title, mx, price, descr, sort))
    print(f"тарифов: {len(TARIFFS)}")

def seed_exam_settings():
    n = 0
    for c in db.q("SELECT code FROM courses"):
        cnt = db.q("""SELECT count(*) AS n FROM questions q JOIN lessons l ON l.code=q.lesson_code
                      WHERE l.course_code=%s AND NOT q.frozen""", (c["code"],), one=True)["n"]
        qn = min(20, max(5, cnt))
        db.ex("""INSERT INTO exam_settings(course_code,q_count,time_min,pass_pct,max_attempts)
                 VALUES(%s,%s,%s,80,3) ON CONFLICT (course_code) DO NOTHING""",
              (c["code"], qn, max(10, qn * 2)))
        n += 1
    print(f"настроек тестирования: {n}")

def seed_modules():
    n = 0
    for course, mods in MODULES.items():
        if not db.q("SELECT 1 FROM courses WHERE code=%s", (course,), one=True):
            continue
        for i, (code, title, lessons) in enumerate(mods):
            db.ex("""INSERT INTO modules(code,course_code,title,sort) VALUES(%s,%s,%s,%s)
                     ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title, sort=EXCLUDED.sort""",
                  (code, course, title, i * 10))
            for l in lessons:
                db.ex("UPDATE lessons SET module_code=%s WHERE code=%s", (code, l))
            n += 1
    print(f"модулей: {n}")

def seed_materials():
    """Учебные материалы урока сверх карточек норм (раздел 7 ТЗ)."""
    n = 0
    for l in db.q("SELECT code,title FROM lessons"):
        exists = db.q("SELECT 1 FROM materials WHERE lesson_code=%s", (l["code"],), one=True)
        if exists:
            continue
        db.ex("""INSERT INTO materials(lesson_code,kind,title,body,required,sort)
                 VALUES(%s,'text',%s,%s,TRUE,10)""",
              (l["code"], "Разбор норм темы",
               "Карточки норм с цитатами и практическим смыслом — основной материал темы."))
        db.ex("""INSERT INTO materials(lesson_code,kind,title,required,sort)
                 VALUES(%s,'video',%s,FALSE,20)""", (l["code"], f"Видеоурок: {l['title']}"))
        n += 2
    print(f"материалов: {n}")

if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "schema2.sql"), encoding="utf-8") as f:
        sql = f.read()
    with db.pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql)
    print("схема этапов 2–5 применена")
    seed_matrix(); seed_scale(); seed_tariffs(); seed_exam_settings(); seed_modules(); seed_materials()
    print("справочники загружены")
