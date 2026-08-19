"""Общая логика: назначения по должности, статусы обучения, уведомления."""
import datetime as dt
from . import db

KIND_TITLE = {"mandatory":"Обязательный","recommended":"Рекомендуемый",
              "optional":"Дополнительный","periodic":"Периодический"}
STATUS_TITLE = {"not_started":"Не начат","in_progress":"В процессе","completed":"Завершён",
                "failed":"Не пройден","overdue":"Просрочен","repeat_required":"Требует повторного прохождения"}

def notify(user_id, kind, title, body=None, ref=None):
    dup = db.q("""SELECT 1 FROM notifications WHERE user_id=%s AND kind=%s AND ref IS NOT DISTINCT FROM %s
                  AND created_at > now() - interval '20 hours'""", (user_id, kind, ref), one=True)
    if dup:
        return
    db.ex("INSERT INTO notifications(user_id,kind,title,body,ref) VALUES(%s,%s,%s,%s,%s)",
          (user_id, kind, title, body, ref))

def apply_role_assignments(user_id, role_code, notify_user=True):
    """Назначает курсы по должности. Ручные назначения не трогает."""
    if not role_code:
        return 0
    rows = db.q("""SELECT rc.*, c.title FROM role_courses rc JOIN courses c ON c.code=rc.course_code
                   WHERE rc.role_code=%s""", (role_code,))
    n = 0
    for r in rows:
        exists = db.q("SELECT 1 FROM assignments WHERE user_id=%s AND course_code=%s",
                      (user_id, r["course_code"]), one=True)
        if exists:
            continue
        due = (dt.date.today() + dt.timedelta(days=r["due_days"])) if r["due_days"] else None
        db.ex("""INSERT INTO assignments(user_id,course_code,kind,due_date,period_months,source)
                 VALUES(%s,%s,%s,%s,%s,'role')""",
              (user_id, r["course_code"], r["kind"], due, r["period_months"]))
        n += 1
        if notify_user and r["kind"] in ("mandatory", "periodic"):
            notify(user_id, "assigned", f"Назначен курс: {r['title']}",
                   f"Тип обучения: {KIND_TITLE[r['kind']]}." + (f" Срок — до {due:%d.%m.%Y}." if due else ""),
                   r["course_code"])
    return n

def course_status(user_id, course_code, assignment=None):
    """Статус курса по разделу 3 ТЗ."""
    att = db.q("""SELECT pct,passed,finished_at FROM attempts
                  WHERE user_id=%s AND course_code=%s AND finished_at IS NOT NULL
                  ORDER BY finished_at""", (user_id, course_code))
    cert = db.q("""SELECT valid_until FROM certificates WHERE user_id=%s AND course_code=%s AND NOT revoked
                   ORDER BY issued_at DESC LIMIT 1""", (user_id, course_code), one=True)
    today = dt.date.today()
    if cert and cert["valid_until"] < today:
        return "repeat_required"
    if any(a["passed"] for a in att):
        return "completed"
    read = db.q("""SELECT count(*) AS n FROM lesson_progress lp JOIN lessons l ON l.code=lp.lesson_code
                   WHERE lp.user_id=%s AND l.course_code=%s""", (user_id, course_code), one=True)["n"]
    due = assignment["due_date"] if assignment else None
    if due and due < today:
        return "overdue"
    if att:
        return "failed"
    return "in_progress" if read else "not_started"

def user_courses(user_id):
    """Полная картина обучения пользователя: назначения, статусы, сроки, результаты."""
    assigns = {a["course_code"]: a for a in
               db.q("SELECT * FROM assignments WHERE user_id=%s", (user_id,))}
    courses = db.q("""SELECT c.code,c.title,c.intro,c.step,c.direction_code,d.title AS dir_title
                      FROM courses c JOIN directions d ON d.code=c.direction_code
                      ORDER BY d.sort, c.step""")
    atts = db.q("""SELECT course_code,pct,passed,finished_at FROM attempts
                   WHERE user_id=%s AND finished_at IS NOT NULL ORDER BY finished_at""", (user_id,))
    by_course = {}
    for a in atts:
        by_course.setdefault(a["course_code"], []).append(a)
    certs = {c["course_code"]: c for c in
             db.q("SELECT * FROM certificates WHERE user_id=%s AND NOT revoked", (user_id,))}
    out = []
    for c in courses:
        a = assigns.get(c["code"])
        att = by_course.get(c["code"], [])
        st = course_status(user_id, c["code"], a)
        cert = certs.get(c["code"])
        out.append({
            "code": c["code"], "title": c["title"], "intro": c["intro"],
            "direction": c["direction_code"], "dir_title": c["dir_title"], "step": c["step"],
            "kind": a["kind"] if a else None,
            "kind_title": KIND_TITLE.get(a["kind"]) if a else None,
            "due": a["due_date"].isoformat() if a and a["due_date"] else None,
            "period_months": a["period_months"] if a else None,
            "assigned_at": a["assigned_at"].isoformat() if a else None,
            "status": st, "status_title": STATUS_TITLE[st],
            "attempts": [{"pct": x["pct"], "passed": x["passed"],
                          "at": x["finished_at"].isoformat()} for x in att],
            "first_pct": att[0]["pct"] if att else None,
            "last_pct": att[-1]["pct"] if att else None,
            "delta": (att[-1]["pct"] - att[0]["pct"]) if len(att) > 1 else None,
            "certificate": ({"code": cert["code"], "pct": cert["pct"],
                             "issued_at": cert["issued_at"].date().isoformat(),
                             "valid_until": cert["valid_until"].isoformat()} if cert else None)
        })
    return out

def grade_title(pct):
    row = db.q("SELECT title, passed FROM grading_scale WHERE min_pct<=%s ORDER BY min_pct DESC LIMIT 1",
               (pct,), one=True)
    return (row["title"], row["passed"]) if row else ("не пройдено", False)

def exam_cfg(course_code):
    row = db.q("SELECT * FROM exam_settings WHERE course_code=%s", (course_code,), one=True)
    if row:
        return row
    return {"course_code": course_code, "q_count": 20, "time_min": 30, "pass_pct": 80,
            "max_attempts": 3, "shuffle_q": True, "shuffle_o": True, "cert_months": 12}

def sub_status(org_id):
    """Подписка организации: активна ли, сколько мест занято."""
    sub = db.q("""SELECT s.*, t.title, t.max_users, t.price_month FROM subscriptions s
                  JOIN tariffs t ON t.code=s.tariff_code
                  WHERE s.org_id=%s ORDER BY s.created_at DESC LIMIT 1""", (org_id,), one=True)
    used = db.q("SELECT count(*) AS n FROM users WHERE org_id=%s AND is_active", (org_id,), one=True)["n"]
    if not sub:
        return {"active": True, "trial": True, "title": "Пробный период", "used": used,
                "limit": 5, "valid_until": None, "left": max(0, 5 - used)}
    limit = None if sub["max_users"] is None else sub["max_users"] + sub["extra_licenses"]
    active = sub["status"] == "active" and sub["valid_until"] >= dt.date.today()
    return {"active": active, "trial": False, "title": sub["title"], "tariff": sub["tariff_code"],
            "used": used, "limit": limit, "left": None if limit is None else max(0, limit - used),
            "valid_until": sub["valid_until"].isoformat(), "auto_renew": sub["auto_renew"],
            "status": sub["status"], "price_month": sub["price_month"], "id": sub["id"]}

def scan_deadlines():
    """Фоновая проверка: приближение срока, просрочка, истечение сертификата."""
    today = dt.date.today()
    soon = today + dt.timedelta(days=7)
    rows = db.q("""SELECT a.user_id, a.course_code, a.due_date, c.title
                   FROM assignments a JOIN courses c ON c.code=a.course_code
                   WHERE a.due_date IS NOT NULL AND a.due_date <= %s""", (soon,))
    made = 0
    for r in rows:
        st = course_status(r["user_id"], r["course_code"], {"due_date": r["due_date"]})
        if st == "completed":
            continue
        if r["due_date"] < today:
            notify(r["user_id"], "overdue", f"Просрочено обучение: {r['title']}",
                   f"Срок истёк {r['due_date']:%d.%m.%Y}. Пройдите курс как можно скорее.", r["course_code"])
        else:
            notify(r["user_id"], "due_soon", f"Приближается срок: {r['title']}",
                   f"Курс нужно пройти до {r['due_date']:%d.%m.%Y}.", r["course_code"])
        made += 1
    certs = db.q("""SELECT ct.user_id, ct.course_code, ct.valid_until, c.title
                    FROM certificates ct JOIN courses c ON c.code=ct.course_code
                    WHERE NOT ct.revoked AND ct.valid_until <= %s""", (today + dt.timedelta(days=30),))
    for c in certs:
        if c["valid_until"] < today:
            notify(c["user_id"], "repeat", f"Сертификат истёк: {c['title']}",
                   "Требуется повторное прохождение курса.", c["course_code"])
        else:
            notify(c["user_id"], "cert_expiring", f"Истекает сертификат: {c['title']}",
                   f"Действителен до {c['valid_until']:%d.%m.%Y}.", c["course_code"])
        made += 1
    return made
