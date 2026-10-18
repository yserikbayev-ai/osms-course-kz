import os, json, random, asyncio, datetime as dt
from fastapi import FastAPI, Request, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from . import db, auth, logic, api2, video, structure, seed2

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(BASE, "static")
COMPLAINTS_TO_FREEZE = 3

app = FastAPI(title="LMS НПА РК", docs_url=None, redoc_url=None)
app.include_router(api2.r)

def _apply_schema(name):
    here = os.path.dirname(os.path.abspath(__file__))
    p = os.path.join(here, name)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f, db.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(f.read())

async def _deadline_loop():
    while True:
        try:
            logic.scan_deadlines()
        except Exception as e:
            print("scan_deadlines:", e)
        await asyncio.sleep(3600)

@app.on_event("startup")
async def _startup():
    _apply_schema("schema.sql")
    _apply_schema("schema2.sql")
    _apply_schema("schema3.sql")
    _apply_schema("schema4.sql")
    # порядок: сид прежних курсов (в проде уже есть), структура, поглощение; всё идемпотентно
    sp = os.path.join(BASE, "structure.json")
    if os.path.exists(sp) and db.q("SELECT 1 FROM courses LIMIT 1", one=True):
        structure.load_structure(sp)
        structure.absorb_direction2()
        # матрица для планируемых курсов — один раз, чтобы правки руководителя не отменялись при рестарте
        if not db.q("""SELECT 1 FROM role_courses r JOIN courses c ON c.code=r.course_code
                       WHERE c.status='планируется' LIMIT 1""", one=True):
            seed2.seed_structure_matrix()
    asyncio.create_task(_deadline_loop())

def me(request, required=True):
    return auth.current_user(request, required)

def cert_code(user_id, course_code):
    h = abs(hash(f"{user_id}|{course_code}")) % (36 ** 6)
    s, n = "", h
    for _ in range(6):
        s = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n % 36] + s
        n //= 36
    return f"NPA-{s}-26"

# ---------- регистрация и вход ----------
@app.post("/api/register")
def register(data: dict = Body(...)):
    for k in ["full_name", "email", "password", "org_name"]:
        if not str(data.get(k, "")).strip():
            raise HTTPException(400, f"Не заполнено обязательное поле: {k}")
    if len(str(data["password"])) < 6:
        raise HTTPException(400, "Пароль должен быть не короче 6 символов")
    email = data["email"].strip().lower()
    if db.q("SELECT 1 FROM users WHERE email=%s", (email,), one=True):
        raise HTTPException(400, "Пользователь с таким e-mail уже зарегистрирован")

    org = db.q("SELECT id FROM organizations WHERE lower(name)=lower(%s)", (data["org_name"].strip(),), one=True)
    first_in_org = org is None
    if not org:
        org = db.q("INSERT INTO organizations(name,bin) VALUES(%s,%s) RETURNING id",
                   (data["org_name"].strip(), data.get("bin")), one=True)
    else:
        sub = logic.sub_status(org["id"])
        if sub["limit"] is not None and sub["left"] <= 0:
            raise HTTPException(402, f"Достигнут лимит тарифа «{sub['title']}»: {sub['limit']} пользователей. "
                                     "Руководителю нужно докупить лицензии или сменить тариф.")
        if not sub["active"]:
            raise HTTPException(402, "Подписка организации не активна. Обратитесь к руководителю.")

    role = None
    if data.get("role_code"):
        role = db.q("SELECT id, code, can_manage_org FROM roles WHERE code=%s", (data["role_code"],), one=True)
    is_admin = first_in_org or bool(role and role["can_manage_org"])
    u = db.q("""INSERT INTO users(org_id,full_name,phone,email,password_hash,role_id,department,
                                  experience_years,qualification,is_org_admin)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
             (org["id"], data["full_name"].strip(), data.get("phone"), email,
              auth.hash_password(data["password"]), role["id"] if role else None,
              data.get("department"), data.get("experience_years"), data.get("qualification"),
              is_admin), one=True)
    n = logic.apply_role_assignments(u["id"], role["code"] if role else None)
    token = auth.new_session(u["id"])
    r = JSONResponse({"ok": True, "org_created": first_in_org, "assigned": n})
    r.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", max_age=auth.SESSION_DAYS*86400, secure=True)
    return r

@app.post("/api/login")
def login(data: dict = Body(...)):
    email = str(data.get("email", "")).strip().lower()
    row = db.q("SELECT id,password_hash,is_active FROM users WHERE email=%s", (email,), one=True)
    if not row or not auth.check_password(str(data.get("password", "")), row["password_hash"]):
        raise HTTPException(401, "Неверный e-mail или пароль")
    if not row["is_active"]:
        raise HTTPException(403, "Учётная запись отключена")
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
        "department": u["department"], "is_org_admin": u["is_org_admin"],
        "is_region_admin": bool(u.get("is_region_admin"))}}

@app.post("/api/profile")
def profile(request: Request, data: dict = Body(...)):
    u = me(request)
    fields, params = [], []
    for k, col in [("full_name","full_name"),("phone","phone"),("department","department"),
                   ("qualification","qualification")]:
        if k in data:
            fields.append(f"{col}=%s"); params.append(data[k])
    if fields:
        params.append(u["id"])
        db.ex(f"UPDATE users SET {','.join(fields)} WHERE id=%s", params)
    if data.get("role_code") and data["role_code"] != u["role_code"]:
        role = db.q("SELECT id,code,can_manage_org FROM roles WHERE code=%s", (data["role_code"],), one=True)
        if role:
            db.ex("UPDATE users SET role_id=%s WHERE id=%s", (role["id"], u["id"]))
            logic.apply_role_assignments(u["id"], role["code"])
    return {"ok": True}

@app.get("/api/roles")
def api_roles():
    return db.q("SELECT code,title,can_manage_org FROM roles ORDER BY sort,title")

# ---------- контент ----------
@app.get("/api/content")
def content(request: Request):
    me(request)
    acts = {a["code"]: a for a in db.q("SELECT * FROM acts")}
    courses = db.q("SELECT * FROM courses WHERE status<>'архив' ORDER BY direction_code,step")
    shown = [c["code"] for c in courses]
    modules = db.q("SELECT * FROM modules WHERE course_code = ANY(%s) ORDER BY course_code,sort", (shown,))
    lessons = db.q("SELECT * FROM lessons WHERE course_code = ANY(%s) ORDER BY course_code,sort", (shown,))
    dirs = db.q("SELECT * FROM directions ORDER BY sort,title")
    cdir = {c["code"]: c["direction_code"] for c in courses}
    for d in dirs:
        ms = [m for m in modules if cdir.get(m["course_code"]) == d["code"]]
        d["total_modules"] = len(ms)
        d["published_count"] = sum(m["status"] == "опубликован" for m in ms)
    for m in modules:
        m["link"] = m["link_module"]
    vids = {r["lesson_code"]: r["url"] for r in db.q("SELECT lesson_code,url FROM video_slots")}
    cards = db.q("SELECT * FROM cards ORDER BY lesson_code,sort")
    mats = db.q("SELECT id,lesson_code,kind,title,url,required,sort FROM materials ORDER BY lesson_code,sort")
    by_lesson, m_by_lesson = {}, {}
    for c in cards:
        by_lesson.setdefault(c["lesson_code"], []).append(c)
    for m in mats:
        m_by_lesson.setdefault(m["lesson_code"], []).append(m)
    qcount = {r["lesson_code"]: r["n"] for r in
              db.q("SELECT lesson_code, count(*) AS n FROM questions WHERE NOT frozen GROUP BY lesson_code")}
    for l in lessons:
        l["cards"] = by_lesson.get(l["code"], [])
        l["materials"] = m_by_lesson.get(l["code"], [])
        l["questions"] = qcount.get(l["code"], 0)
        l["video"] = video.embed_url(vids[l["code"]]) if vids.get(l["code"]) else None
    exam = {e["course_code"]: e for e in db.q("SELECT * FROM exam_settings")}
    for c in courses:
        c["exam"] = exam.get(c["code"], {"q_count": 20, "time_min": 30, "pass_pct": 80, "max_attempts": 3})
    return {"acts": acts, "directions": dirs, "courses": courses, "modules": modules, "lessons": lessons,
            "video_placeholder": "/static/video-placeholder.svg",
            "scale": db.q("SELECT min_pct,title,passed FROM grading_scale ORDER BY min_pct DESC")}

@app.post("/api/lesson/{code}/read")
def lesson_read(code: str, request: Request):
    u = me(request)
    db.ex("""INSERT INTO lesson_progress(user_id,lesson_code) VALUES(%s,%s)
             ON CONFLICT (user_id,lesson_code) DO NOTHING""", (u["id"], code))
    return {"ok": True}

@app.get("/api/progress")
def progress(request: Request):
    u = me(request)
    att = db.q("""SELECT course_code, pct, passed, finished_at FROM attempts
                  WHERE user_id=%s AND finished_at IS NOT NULL ORDER BY finished_at""", (u["id"],))
    by_course = {}
    for a in att:
        by_course.setdefault(a["course_code"], []).append(
            {"pct": a["pct"], "passed": a["passed"], "at": a["finished_at"].isoformat()})
    ca = db.q("""SELECT course_code, lesson_code, errors, done FROM corrective_actions
                 WHERE user_id=%s AND done=FALSE""", (u["id"],))
    read = [r["lesson_code"] for r in db.q("SELECT lesson_code FROM lesson_progress WHERE user_id=%s", (u["id"],))]
    certs = db.q("SELECT course_code, code, pct, issued_at, valid_until FROM certificates WHERE user_id=%s AND NOT revoked", (u["id"],))
    favs = db.q("SELECT kind,ref FROM favorites WHERE user_id=%s", (u["id"],))
    assigns = db.q("SELECT course_code,kind,due_date FROM assignments WHERE user_id=%s", (u["id"],))
    return {"attempts": by_course, "corrective": ca, "read": read,
            "favorites": favs,
            "assignments": [{**a, "due_date": a["due_date"].isoformat() if a["due_date"] else None} for a in assigns],
            "certificates": [{**c, "issued_at": c["issued_at"].isoformat(),
                              "valid_until": c["valid_until"].isoformat()} for c in certs]}

# ---------- экзамен ----------
@app.post("/api/exam/start")
def exam_start(request: Request, data: dict = Body(...)):
    u = me(request)
    course = data.get("course")
    row = db.q("SELECT title, status FROM courses WHERE code=%s", (course,), one=True)
    if not row:
        raise HTTPException(404, "Курс не найден")
    why = logic.unavailable_reason(row)
    if why:
        raise HTTPException(409, why)
    cfg = logic.exam_cfg(course)
    pending = db.q("""SELECT count(*) AS n FROM corrective_actions
                      WHERE user_id=%s AND course_code=%s AND done=FALSE""", (u["id"], course), one=True)
    if pending["n"]:
        raise HTTPException(409, "Сначала отметьте выполненными корректирующие действия")
    passed_before = db.q("""SELECT 1 FROM attempts WHERE user_id=%s AND course_code=%s AND passed
                            LIMIT 1""", (u["id"], course), one=True)
    if not passed_before:
        used = db.q("""SELECT count(*) AS n FROM attempts WHERE user_id=%s AND course_code=%s
                       AND finished_at IS NOT NULL""", (u["id"], course), one=True)["n"]
        if used >= cfg["max_attempts"]:
            raise HTTPException(409, f"Использованы все попытки ({cfg['max_attempts']}). "
                                     "Дальнейший доступ открывает руководитель организации.")
    pool_q = db.q("""SELECT q.code FROM questions q JOIN lessons l ON l.code=q.lesson_code
                     WHERE l.course_code=%s AND NOT q.frozen""", (course,))
    if not pool_q:
        raise HTTPException(400, "В курсе нет доступных вопросов")
    codes = [x["code"] for x in pool_q]
    if cfg["shuffle_q"]:
        random.shuffle(codes)
    ticket = codes[:min(cfg["q_count"], len(codes))]
    a = db.q("INSERT INTO attempts(user_id,course_code,ticket) VALUES(%s,%s,%s) RETURNING id",
             (u["id"], course, json.dumps(ticket)), one=True)
    rows = db.q("""SELECT q.code,q.body,q.options,q.level,q.act_code,q.point,q.lesson_code
                   FROM questions q WHERE q.code = ANY(%s)""", (ticket,))
    order = {c: i for i, c in enumerate(ticket)}
    rows.sort(key=lambda r: order[r["code"]])
    out = []
    for r in rows:
        idx = list(range(len(r["options"])))
        if cfg["shuffle_o"]:
            random.shuffle(idx)
        out.append({"code": r["code"], "body": r["body"], "level": r["level"], "act": r["act_code"],
                    "point": r["point"], "lesson": r["lesson_code"],
                    "options": [r["options"][i] for i in idx], "map": idx})
    return {"attempt": a["id"], "questions": out, "cfg": cfg}

@app.post("/api/exam/answer")
def exam_answer(request: Request, data: dict = Body(...)):
    u = me(request)
    att = db.q("SELECT * FROM attempts WHERE id=%s AND user_id=%s", (data.get("attempt"), u["id"]), one=True)
    if not att or att["finished_at"]:
        raise HTTPException(400, "Попытка не найдена или уже завершена")
    qq = db.q("SELECT * FROM questions WHERE code=%s", (data.get("question"),), one=True)
    if not qq:
        raise HTTPException(404, "Вопрос не найден")
    chosen = data.get("chosen")
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
    cfg = logic.exam_cfg(att["course_code"])
    course = db.q("SELECT title FROM courses WHERE code=%s", (att["course_code"],), one=True)
    ticket = att["ticket"]
    answers = db.q("SELECT question_code,is_right FROM attempt_answers WHERE attempt_id=%s", (att["id"],))
    amap = {a["question_code"]: a["is_right"] for a in answers}
    total = len(ticket)
    right = sum(1 for c in ticket if amap.get(c))
    pct = round(right / total * 100) if total else 0
    passed = pct >= cfg["pass_pct"]
    grade, _ = logic.grade_title(pct)
    db.ex("""UPDATE attempts SET finished_at=now(), total=%s, correct_cnt=%s, pct=%s, passed=%s, by_time=%s
             WHERE id=%s""", (total, right, pct, passed, bool(data.get("by_time")), att["id"]))

    wrong_codes = [c for c in ticket if not amap.get(c)]
    wrong = db.q("""SELECT q.code,q.body,q.options,q.correct,q.explain,q.act_code,q.point,q.lesson_code
                    FROM questions q WHERE q.code = ANY(%s)""", (wrong_codes,)) if wrong_codes else []
    db.ex("DELETE FROM corrective_actions WHERE user_id=%s AND course_code=%s", (u["id"], att["course_code"]))
    if not passed and wrong:
        per = {}
        for w in wrong:
            per[w["lesson_code"]] = per.get(w["lesson_code"], 0) + 1
        for lesson, errs in per.items():
            db.ex("""INSERT INTO corrective_actions(user_id,course_code,attempt_id,lesson_code,errors)
                     VALUES(%s,%s,%s,%s,%s)""", (u["id"], att["course_code"], att["id"], lesson, errs))
    cert = None
    if passed:
        exists = db.q("""SELECT code FROM certificates WHERE user_id=%s AND course_code=%s AND NOT revoked""",
                      (u["id"], att["course_code"]), one=True)
        if exists:
            cert = exists["code"]
        else:
            code = cert_code(u["id"], att["course_code"])
            valid = dt.date.today() + dt.timedelta(days=30 * cfg["cert_months"])
            db.ex("""INSERT INTO certificates(user_id,course_code,code,pct,valid_until)
                     VALUES(%s,%s,%s,%s,%s)""", (u["id"], att["course_code"], code, pct, valid))
            cert = code
            logic.notify(u["id"], "certificate", f"Получен сертификат: {course['title']}",
                         f"Номер {code}, действителен до {valid:%d.%m.%Y}.", att["course_code"])
    prev = db.q("""SELECT pct FROM attempts WHERE user_id=%s AND course_code=%s AND finished_at IS NOT NULL
                   AND id<>%s ORDER BY finished_at DESC LIMIT 1""", (u["id"], att["course_code"], att["id"]), one=True)
    delta = (pct - prev["pct"]) if prev else None
    logic.notify(u["id"], "result", f"Результат теста: {course['title']}",
                 f"{pct}% — {grade}." + (f" Прирост {delta:+d} п.п." if delta is not None else ""),
                 att["course_code"])
    acts = {a["code"]: a for a in db.q("SELECT * FROM acts")}
    used = db.q("""SELECT count(*) AS n FROM attempts WHERE user_id=%s AND course_code=%s
                   AND finished_at IS NOT NULL""", (u["id"], att["course_code"]), one=True)["n"]
    return {"pct": pct, "right": right, "total": total, "passed": passed, "delta": delta,
            "grade": grade, "certificate": cert, "wrong": wrong, "acts": acts,
            "attempts_used": used, "attempts_max": cfg["max_attempts"], "pass_pct": cfg["pass_pct"]}

# ---------- тренажёр ----------
@app.post("/api/drill/start")
def drill_start(request: Request, data: dict = Body(...)):
    me(request)
    where, params = ["NOT q.frozen", "c.status='опубликован'"], []
    if data.get("direction"):
        where.append("c.direction_code=%s"); params.append(data["direction"])
    if data.get("course"):
        row = db.q("SELECT title, status FROM courses WHERE code=%s", (data["course"],), one=True)
        if not row:
            raise HTTPException(404, "Курс не найден")
        why = logic.unavailable_reason(row)
        if why:
            raise HTTPException(409, why)
        where.append("l.course_code=%s"); params.append(data["course"])
    if data.get("level"):
        where.append("q.level=%s"); params.append(int(data["level"]))
    sql = f"""SELECT q.code,q.body,q.options,q.level,q.act_code,q.point,q.lesson_code
              FROM questions q JOIN lessons l ON l.code=q.lesson_code
              JOIN courses c ON c.code=l.course_code WHERE {' AND '.join(where)}"""
    rows = db.q(sql, params)
    random.shuffle(rows)
    rows = rows[:int(data.get("count") or 10)]
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

@app.post("/api/corrective/done")
def corrective_done(request: Request, data: dict = Body(...)):
    u = me(request)
    db.ex("""UPDATE corrective_actions SET done=TRUE
             WHERE user_id=%s AND course_code=%s AND lesson_code=%s""",
          (u["id"], data.get("course"), data.get("lesson")))
    return {"ok": True}

@app.post("/api/complaint")
def complaint(request: Request, data: dict = Body(...)):
    u = me(request)
    code = data.get("question")
    db.ex("INSERT INTO complaints(user_id,question_code) VALUES(%s,%s)", (u["id"], code))
    n = db.q("SELECT count(*) AS n FROM complaints WHERE question_code=%s", (code,), one=True)["n"]
    if n >= COMPLAINTS_TO_FREEZE:
        db.ex("UPDATE questions SET frozen=TRUE WHERE code=%s", (code,))
    return {"count": n, "frozen": n >= COMPLAINTS_TO_FREEZE, "threshold": COMPLAINTS_TO_FREEZE}

# ---------- проверка сертификата (раздел 9 ТЗ) ----------
def qr_svg(text, box=4):
    """QR-код в SVG без внешних зависимостей."""
    import qrcode
    qr = qrcode.QRCode(border=2, box_size=1)
    qr.add_data(text); qr.make(fit=True)
    m = qr.get_matrix()
    n = len(m)
    rects = []
    for y, row in enumerate(m):
        for x, v in enumerate(row):
            if v:
                rects.append(f'<rect x="{x*box}" y="{y*box}" width="{box}" height="{box}"/>')
    size = n * box
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
            f'<rect width="{size}" height="{size}" fill="#fff"/><g fill="#16232B">{"".join(rects)}</g></svg>')

@app.get("/qr/{code}.svg")
def qr(code: str, request: Request):
    url = str(request.base_url).rstrip("/") + "/verify/" + code
    try:
        return Response(qr_svg(url), media_type="image/svg+xml")
    except Exception:
        raise HTTPException(503, "Генерация QR недоступна")

@app.get("/verify/{code}", response_class=HTMLResponse)
def verify(code: str):
    row = db.q("""SELECT ct.code, ct.pct, ct.issued_at, ct.valid_until, ct.revoked,
                         u.full_name, o.name AS org, c.title AS course, r.title AS role
                  FROM certificates ct JOIN users u ON u.id=ct.user_id
                  JOIN organizations o ON o.id=u.org_id
                  JOIN courses c ON c.code=ct.course_code
                  LEFT JOIN roles r ON r.id=u.role_id
                  WHERE ct.code=%s""", (code,), one=True)
    css = ("<style>body{font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F7F7;"
           "color:#16232B;margin:0;padding:40px 20px;display:flex;justify-content:center}"
           ".c{background:#fff;border:1px solid #D7E0E0;border-radius:12px;padding:32px;max-width:560px;width:100%;"
           "box-shadow:0 8px 24px -12px rgba(22,35,43,.18)}h1{font-size:20px;margin:0 0 6px}"
           ".ok{color:#2E7D53;font-weight:700}.bad{color:#B03A3A;font-weight:700}"
           "dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:20px 0 0;font-size:15px}"
           "dt{color:#74868D}dd{margin:0;font-weight:600}"
           ".mono{font-family:ui-monospace,Menlo,monospace}"
           "@media(prefers-color-scheme:dark){body{background:#0F171C;color:#E7EDEE}"
           ".c{background:#16212A;border-color:#2A3A44}dt{color:#7D8F97}}</style>")
    if not row:
        return HTMLResponse(css + f'<div class="c"><h1>Сертификат не найден</h1>'
                                  f'<p>Код <span class="mono">{code}</span> отсутствует в реестре.</p></div>', 404)
    today = dt.date.today()
    valid = (not row["revoked"]) and row["valid_until"] >= today
    status = ('<span class="ok">действителен</span>' if valid else
              '<span class="bad">' + ("отозван" if row["revoked"] else "истёк") + "</span>")
    return HTMLResponse(css + f"""<div class="c">
      <h1>Проверка сертификата</h1>
      <p>Статус: {status}</p>
      <dl>
        <dt>Номер</dt><dd class="mono">{row['code']}</dd>
        <dt>ФИО</dt><dd>{row['full_name']}</dd>
        <dt>Должность</dt><dd>{row['role'] or '—'}</dd>
        <dt>Организация</dt><dd>{row['org']}</dd>
        <dt>Курс</dt><dd>{row['course']}</dd>
        <dt>Результат</dt><dd>{row['pct']}%</dd>
        <dt>Выдан</dt><dd>{row['issued_at']:%d.%m.%Y}</dd>
        <dt>Действителен до</dt><dd>{row['valid_until']:%d.%m.%Y}</dd>
      </dl></div>""")

app.mount("/static", StaticFiles(directory=STATIC), name="static")

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))
