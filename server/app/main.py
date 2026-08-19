import os, json, random, datetime as dt
from fastapi import FastAPI, Request, Response, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from . import db, auth

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(BASE, "static")
PASS = 0.8
EXAM_SIZE = 20
COMPLAINTS_TO_FREEZE = 3

app = FastAPI(title="LMS НПА РК", docs_url=None, redoc_url=None)

@app.on_event("startup")
def _startup():
    db.init_schema()

# ---------- вспомогательное ----------
def me(request, required=True):
    return auth.current_user(request, required)

def cert_code(user_id, course_code):
    h = abs(hash(f"{user_id}|{course_code}")) % (36 ** 6)
    s = ""
    n = h
    for _ in range(6):
        s = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n % 36] + s
        n //= 36
    return f"NPA-{s}-26"

# ---------- регистрация и вход ----------
@app.post("/api/register")
def register(data: dict = Body(...)):
    need = ["full_name", "email", "password", "org_name"]
    for k in need:
        if not str(data.get(k, "")).strip():
            raise HTTPException(400, f"Не заполнено обязательное поле: {k}")
    email = data["email"].strip().lower()
    if db.q("SELECT 1 FROM users WHERE email=%s", (email,), one=True):
        raise HTTPException(400, "Пользователь с таким e-mail уже зарегистрирован")

    org = db.q("SELECT id FROM organizations WHERE lower(name)=lower(%s)", (data["org_name"].strip(),), one=True)
    first_in_org = org is None
    if not org:
        org = db.q("INSERT INTO organizations(name,bin) VALUES(%s,%s) RETURNING id",
                   (data["org_name"].strip(), data.get("bin")), one=True)
    role = None
    if data.get("role_code"):
        role = db.q("SELECT id, can_manage_org FROM roles WHERE code=%s", (data["role_code"],), one=True)

    is_admin = first_in_org or bool(role and role["can_manage_org"])
    u = db.q("""INSERT INTO users(org_id,full_name,phone,email,password_hash,role_id,department,
                                  experience_years,qualification,is_org_admin)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
             (org["id"], data["full_name"].strip(), data.get("phone"), email,
              auth.hash_password(data["password"]), role["id"] if role else None,
              data.get("department"), data.get("experience_years"), data.get("qualification"),
              is_admin), one=True)
    token = auth.new_session(u["id"])
    r = JSONResponse({"ok": True, "org_created": first_in_org})
    r.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", max_age=auth.SESSION_DAYS*86400, secure=True)
    return r

@app.post("/api/login")
def login(data: dict = Body(...)):
    email = str(data.get("email", "")).strip().lower()
    row = db.q("SELECT id,password_hash FROM users WHERE email=%s", (email,), one=True)
    if not row or not auth.check_password(str(data.get("password", "")), row["password_hash"]):
        raise HTTPException(401, "Неверный e-mail или пароль")
    db.ex("UPDATE users SET last_login=now() WHERE id=%s", (row["id"],))
    token = auth.new_session(row["id"])
    r = JSONResponse({"ok": True})
    r.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", max_age=auth.SESSION_DAYS*86400, secure=True)
    return r

@app.post("/api/logout")
def logout(request: Request):
    auth.drop_session(request.cookies.get(auth.COOKIE))
    r = JSONResponse({"ok": True})
    r.delete_cookie(auth.COOKIE)
    return r

@app.get("/api/me")
def api_me(request: Request):
    u = me(request, required=False)
    if not u:
        return {"auth": False, "roles": db.q("SELECT code,title FROM roles ORDER BY sort,title")}
    return {"auth": True, "user": {
        "id": u["id"], "full_name": u["full_name"], "email": u["email"], "phone": u["phone"],
        "org": u["org_name"], "role": u["role_title"], "role_code": u["role_code"],
        "department": u["department"], "is_org_admin": u["is_org_admin"]
    }}

@app.get("/api/roles")
def api_roles():
    return db.q("SELECT code,title,can_manage_org FROM roles ORDER BY sort,title")

# ---------- контент ----------
@app.get("/api/content")
def content(request: Request):
    me(request)
    acts = {a["code"]: a for a in db.q("SELECT * FROM acts")}
    dirs = db.q("SELECT * FROM directions ORDER BY sort,title")
    courses = db.q("SELECT * FROM courses ORDER BY direction_code,step")
    lessons = db.q("SELECT * FROM lessons ORDER BY course_code,sort")
    cards = db.q("SELECT * FROM cards ORDER BY lesson_code,sort")
    by_lesson = {}
    for c in cards:
        by_lesson.setdefault(c["lesson_code"], []).append(c)
    for l in lessons:
        l["cards"] = by_lesson.get(l["code"], [])
    qcount = {r["lesson_code"]: r["n"] for r in
              db.q("SELECT lesson_code, count(*) AS n FROM questions WHERE NOT frozen GROUP BY lesson_code")}
    for l in lessons:
        l["questions"] = qcount.get(l["code"], 0)
    return {"acts": acts, "directions": dirs, "courses": courses, "lessons": lessons}

@app.post("/api/lesson/{code}/read")
def lesson_read(code: str, request: Request):
    u = me(request)
    db.ex("""INSERT INTO lesson_progress(user_id,lesson_code) VALUES(%s,%s)
             ON CONFLICT (user_id,lesson_code) DO NOTHING""", (u["id"], code))
    return {"ok": True}

# ---------- прогресс ----------
@app.get("/api/progress")
def progress(request: Request):
    u = me(request)
    att = db.q("""SELECT course_code, pct, passed, finished_at, started_at, id
                  FROM attempts WHERE user_id=%s AND finished_at IS NOT NULL
                  ORDER BY finished_at""", (u["id"],))
    by_course = {}
    for a in att:
        by_course.setdefault(a["course_code"], []).append(
            {"pct": a["pct"], "passed": a["passed"], "at": a["finished_at"].isoformat()})
    ca = db.q("""SELECT course_code, lesson_code, errors, done FROM corrective_actions
                 WHERE user_id=%s AND done=FALSE""", (u["id"],))
    read = [r["lesson_code"] for r in db.q("SELECT lesson_code FROM lesson_progress WHERE user_id=%s", (u["id"],))]
    certs = db.q("SELECT course_code, code, pct, issued_at, valid_until FROM certificates WHERE user_id=%s", (u["id"],))
    return {"attempts": by_course, "corrective": ca, "read": read,
            "certificates": [{**c, "issued_at": c["issued_at"].isoformat(),
                              "valid_until": c["valid_until"].isoformat()} for c in certs]}

# ---------- экзамен ----------
@app.post("/api/exam/start")
def exam_start(request: Request, data: dict = Body(...)):
    u = me(request)
    course = data.get("course")
    if not db.q("SELECT 1 FROM courses WHERE code=%s", (course,), one=True):
        raise HTTPException(404, "Курс не найден")
    pending = db.q("""SELECT count(*) AS n FROM corrective_actions
                      WHERE user_id=%s AND course_code=%s AND done=FALSE""", (u["id"], course), one=True)
    if pending["n"]:
        raise HTTPException(409, "Сначала отметьте выполненными корректирующие действия")
    pool_q = db.q("""SELECT q.code FROM questions q JOIN lessons l ON l.code=q.lesson_code
                     WHERE l.course_code=%s AND NOT q.frozen""", (course,))
    if not pool_q:
        raise HTTPException(400, "В курсе нет доступных вопросов")
    codes = [r["code"] for r in pool_q]
    random.shuffle(codes)
    ticket = codes[:min(EXAM_SIZE, len(codes))]
    a = db.q("INSERT INTO attempts(user_id,course_code,ticket) VALUES(%s,%s,%s) RETURNING id",
             (u["id"], course, json.dumps(ticket)), one=True)
    rows = db.q("""SELECT q.code,q.body,q.options,q.level,q.act_code,q.point,q.lesson_code
                   FROM questions q WHERE q.code = ANY(%s)""", (ticket,))
    order = {c: i for i, c in enumerate(ticket)}
    rows.sort(key=lambda r: order[r["code"]])
    out = []
    for r in rows:
        idx = list(range(len(r["options"])))
        random.shuffle(idx)
        out.append({"code": r["code"], "body": r["body"], "level": r["level"],
                    "act": r["act_code"], "point": r["point"], "lesson": r["lesson_code"],
                    "options": [r["options"][i] for i in idx], "map": idx})
    return {"attempt": a["id"], "questions": out, "pass": PASS}

@app.post("/api/exam/answer")
def exam_answer(request: Request, data: dict = Body(...)):
    u = me(request)
    att = db.q("SELECT * FROM attempts WHERE id=%s AND user_id=%s", (data.get("attempt"), u["id"]), one=True)
    if not att or att["finished_at"]:
        raise HTTPException(400, "Попытка не найдена или уже завершена")
    qq = db.q("SELECT * FROM questions WHERE code=%s", (data.get("question"),), one=True)
    if not qq:
        raise HTTPException(404, "Вопрос не найден")
    chosen = data.get("chosen")            # индекс в исходном порядке вариантов
    is_right = (chosen == qq["correct"])
    db.ex("""INSERT INTO attempt_answers(attempt_id,question_code,chosen,is_right)
             VALUES(%s,%s,%s,%s) ON CONFLICT (attempt_id,question_code) DO NOTHING""",
          (att["id"], qq["code"], chosen, is_right))
    act = db.q("SELECT * FROM acts WHERE code=%s", (qq["act_code"],), one=True)
    return {"right": is_right, "correct": qq["correct"], "explain": qq["explain"],
            "act": act, "point": qq["point"]}

@app.post("/api/exam/finish")
def exam_finish(request: Request, data: dict = Body(...)):
    u = me(request)
    att = db.q("SELECT * FROM attempts WHERE id=%s AND user_id=%s", (data.get("attempt"), u["id"]), one=True)
    if not att:
        raise HTTPException(404, "Попытка не найдена")
    if att["finished_at"]:
        raise HTTPException(400, "Попытка уже завершена")
    ticket = att["ticket"]
    answers = db.q("SELECT question_code,is_right FROM attempt_answers WHERE attempt_id=%s", (att["id"],))
    amap = {a["question_code"]: a["is_right"] for a in answers}
    total = len(ticket)
    right = sum(1 for c in ticket if amap.get(c))
    pct = round(right / total * 100) if total else 0
    passed = (right / total) >= PASS if total else False
    db.ex("""UPDATE attempts SET finished_at=now(), total=%s, correct_cnt=%s, pct=%s, passed=%s, by_time=%s
             WHERE id=%s""", (total, right, pct, passed, bool(data.get("by_time")), att["id"]))

    wrong_codes = [c for c in ticket if not amap.get(c)]
    wrong = db.q("""SELECT q.code,q.body,q.options,q.correct,q.explain,q.act_code,q.point,q.lesson_code
                    FROM questions q WHERE q.code = ANY(%s)""", (wrong_codes,)) if wrong_codes else []
    # корректирующие действия по проваленным темам
    db.ex("""DELETE FROM corrective_actions WHERE user_id=%s AND course_code=%s""", (u["id"], att["course_code"]))
    if not passed and wrong:
        per = {}
        for w in wrong:
            per[w["lesson_code"]] = per.get(w["lesson_code"], 0) + 1
        for lesson, errs in per.items():
            db.ex("""INSERT INTO corrective_actions(user_id,course_code,attempt_id,lesson_code,errors)
                     VALUES(%s,%s,%s,%s,%s)""", (u["id"], att["course_code"], att["id"], lesson, errs))
    cert = None
    if passed:
        exists = db.q("SELECT code FROM certificates WHERE user_id=%s AND course_code=%s",
                      (u["id"], att["course_code"]), one=True)
        if exists:
            cert = exists["code"]
        else:
            code = cert_code(u["id"], att["course_code"])
            valid = dt.date.today() + dt.timedelta(days=365)
            db.ex("""INSERT INTO certificates(user_id,course_code,code,pct,valid_until)
                     VALUES(%s,%s,%s,%s,%s)""", (u["id"], att["course_code"], code, pct, valid))
            cert = code
    prev = db.q("""SELECT pct FROM attempts WHERE user_id=%s AND course_code=%s AND finished_at IS NOT NULL
                   AND id<>%s ORDER BY finished_at DESC LIMIT 1""", (u["id"], att["course_code"], att["id"]), one=True)
    delta = (pct - prev["pct"]) if prev else None
    acts = {a["code"]: a for a in db.q("SELECT * FROM acts")}
    return {"pct": pct, "right": right, "total": total, "passed": passed, "delta": delta,
            "certificate": cert, "wrong": wrong, "acts": acts}

# ---------- тренажёр ----------
@app.post("/api/drill/start")
def drill_start(request: Request, data: dict = Body(...)):
    me(request)
    where, params = ["NOT q.frozen"], []
    if data.get("direction"):
        where.append("c.direction_code=%s"); params.append(data["direction"])
    if data.get("course"):
        where.append("l.course_code=%s"); params.append(data["course"])
    if data.get("level"):
        where.append("q.level=%s"); params.append(int(data["level"]))
    sql = f"""SELECT q.code,q.body,q.options,q.level,q.act_code,q.point,q.lesson_code
              FROM questions q JOIN lessons l ON l.code=q.lesson_code
              JOIN courses c ON c.code=l.course_code WHERE {' AND '.join(where)}"""
    rows = db.q(sql, params)
    random.shuffle(rows)
    n = int(data.get("count") or 10)
    rows = rows[:n]
    out = []
    for r in rows:
        idx = list(range(len(r["options"])))
        random.shuffle(idx)
        out.append({"code": r["code"], "body": r["body"], "level": r["level"], "act": r["act_code"],
                    "point": r["point"], "lesson": r["lesson_code"],
                    "options": [r["options"][i] for i in idx], "map": idx})
    return {"questions": out}

@app.post("/api/drill/check")
def drill_check(request: Request, data: dict = Body(...)):
    me(request)
    qq = db.q("SELECT * FROM questions WHERE code=%s", (data.get("question"),), one=True)
    if not qq:
        raise HTTPException(404, "Вопрос не найден")
    act = db.q("SELECT * FROM acts WHERE code=%s", (qq["act_code"],), one=True)
    return {"right": data.get("chosen") == qq["correct"], "correct": qq["correct"],
            "explain": qq["explain"], "act": act, "point": qq["point"]}

# ---------- корректирующие действия ----------
@app.post("/api/corrective/done")
def corrective_done(request: Request, data: dict = Body(...)):
    u = me(request)
    db.ex("""UPDATE corrective_actions SET done=TRUE
             WHERE user_id=%s AND course_code=%s AND lesson_code=%s""",
          (u["id"], data.get("course"), data.get("lesson")))
    return {"ok": True}

# ---------- жалобы на вопрос ----------
@app.post("/api/complaint")
def complaint(request: Request, data: dict = Body(...)):
    u = me(request)
    code = data.get("question")
    db.ex("INSERT INTO complaints(user_id,question_code) VALUES(%s,%s)", (u["id"], code))
    n = db.q("SELECT count(*) AS n FROM complaints WHERE question_code=%s", (code,), one=True)["n"]
    if n >= COMPLAINTS_TO_FREEZE:
        db.ex("UPDATE questions SET frozen=TRUE WHERE code=%s", (code,))
    return {"count": n, "frozen": n >= COMPLAINTS_TO_FREEZE, "threshold": COMPLAINTS_TO_FREEZE}

# ---------- кабинет организации ----------
@app.get("/api/org/report")
def org_report(request: Request):
    u = me(request)
    if not u["is_org_admin"]:
        raise HTTPException(403, "Доступ только для руководителя организации")
    rows = db.q("""
        SELECT us.id, us.full_name, r.title AS role_title, us.department,
               a.course_code, a.pct, a.passed, a.finished_at
        FROM users us
        LEFT JOIN roles r ON r.id = us.role_id
        LEFT JOIN attempts a ON a.user_id = us.id AND a.finished_at IS NOT NULL
        WHERE us.org_id=%s ORDER BY us.full_name, a.finished_at""", (u["org_id"],))
    people = {}
    for r in rows:
        p = people.setdefault(r["id"], {"name": r["full_name"], "role": r["role_title"],
                                        "department": r["department"], "courses": {}})
        if r["course_code"]:
            p["courses"].setdefault(r["course_code"], []).append({"pct": r["pct"], "passed": r["passed"]})
    return {"org": u["org_name"], "people": list(people.values())}

# ---------- статика ----------
app.mount("/static", StaticFiles(directory=STATIC), name="static")

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))
