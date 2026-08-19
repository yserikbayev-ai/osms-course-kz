"""Эндпоинты этапов 2–5: кабинет, траектории, избранное, материалы,
уведомления, кабинет организации, подписки, проверка сертификата."""
import csv, io, datetime as dt
from fastapi import APIRouter, Request, HTTPException, Body
from fastapi.responses import Response, HTMLResponse
from . import db, auth, logic

r = APIRouter()
def me(request, required=True): return auth.current_user(request, required)

# ---------- личный кабинет (раздел 3 и 14 ТЗ) ----------
@r.get("/api/dashboard")
def dashboard(request: Request):
    u = me(request)
    courses = logic.user_courses(u["id"])
    assigned = [c for c in courses if c["kind"]]
    mandatory = [c for c in assigned if c["kind"] in ("mandatory", "periodic")]
    done = [c for c in mandatory if c["status"] == "completed"]
    todo = [c for c in assigned if c["kind"] in ("mandatory", "periodic")
            and c["status"] != "completed"]
    todo.sort(key=lambda c: (c["due"] or "9999-99-99"))
    recommended = [c for c in assigned if c["kind"] == "recommended" and c["status"] != "completed"]
    passed = [c for c in courses if c["status"] == "completed"]
    passed.sort(key=lambda c: (c["attempts"][-1]["at"] if c["attempts"] else ""), reverse=True)
    pct = round(len(done) / len(mandatory) * 100) if mandatory else 0
    notifs = db.q("""SELECT id,kind,title,body,ref,created_at,read_at FROM notifications
                     WHERE user_id=%s ORDER BY created_at DESC LIMIT 20""", (u["id"],))
    certs = [c["certificate"] | {"course": c["title"]} for c in courses if c["certificate"]]
    return {
        "user": {"full_name": u["full_name"], "role": u["role_title"], "org": u["org_name"],
                 "department": u["department"], "is_org_admin": u["is_org_admin"]},
        "progress_pct": pct,
        "counts": {"mandatory": len(mandatory), "completed": len(done),
                   "left": len(mandatory) - len(done), "overdue": len([c for c in mandatory if c["status"]=="overdue"])},
        "todo": todo[:6], "recommended": recommended[:6], "passed": passed[:6],
        "certificates": certs,
        "notifications": [{**n, "created_at": n["created_at"].isoformat(),
                           "read_at": n["read_at"].isoformat() if n["read_at"] else None} for n in notifs],
        "unread": len([n for n in notifs if not n["read_at"]])
    }

@r.get("/api/my-learning")
def my_learning(request: Request):
    u = me(request)
    return {"courses": logic.user_courses(u["id"])}

# ---------- избранное (раздел 4 ТЗ) ----------
@r.get("/api/favorites")
def fav_list(request: Request):
    u = me(request)
    return db.q("SELECT kind,ref,created_at FROM favorites WHERE user_id=%s ORDER BY created_at DESC", (u["id"],))

@r.post("/api/favorites/toggle")
def fav_toggle(request: Request, data: dict = Body(...)):
    u = me(request)
    kind, ref = data.get("kind"), data.get("ref")
    if kind not in ("course", "lesson", "material"):
        raise HTTPException(400, "Неизвестный тип материала")
    ex = db.q("SELECT 1 FROM favorites WHERE user_id=%s AND kind=%s AND ref=%s", (u["id"], kind, ref), one=True)
    if ex:
        db.ex("DELETE FROM favorites WHERE user_id=%s AND kind=%s AND ref=%s", (u["id"], kind, ref))
        return {"in_favorites": False}
    db.ex("INSERT INTO favorites(user_id,kind,ref) VALUES(%s,%s,%s)", (u["id"], kind, ref))
    return {"in_favorites": True}

# ---------- материалы урока (раздел 7 ТЗ) ----------
@r.get("/api/lesson/{code}/materials")
def lesson_materials(code: str, request: Request):
    u = me(request)
    mats = db.q("SELECT * FROM materials WHERE lesson_code=%s ORDER BY sort", (code,))
    seen = {m["material_id"] for m in
            db.q("SELECT material_id FROM material_progress WHERE user_id=%s", (u["id"],))}
    for m in mats:
        m["viewed"] = m["id"] in seen
    return mats

@r.post("/api/material/{mid}/viewed")
def material_viewed(mid: int, request: Request):
    u = me(request)
    db.ex("""INSERT INTO material_progress(user_id,material_id) VALUES(%s,%s)
             ON CONFLICT DO NOTHING""", (u["id"], mid))
    return {"ok": True}

# ---------- уведомления (раздел 13 ТЗ) ----------
@r.get("/api/notifications")
def notif_list(request: Request):
    u = me(request)
    rows = db.q("""SELECT id,kind,title,body,ref,created_at,read_at FROM notifications
                   WHERE user_id=%s ORDER BY created_at DESC LIMIT 50""", (u["id"],))
    return [{**n, "created_at": n["created_at"].isoformat(),
             "read_at": n["read_at"].isoformat() if n["read_at"] else None} for n in rows]

@r.post("/api/notifications/read")
def notif_read(request: Request, data: dict = Body(default={})):
    u = me(request)
    if data.get("id"):
        db.ex("UPDATE notifications SET read_at=now() WHERE user_id=%s AND id=%s", (u["id"], data["id"]))
    else:
        db.ex("UPDATE notifications SET read_at=now() WHERE user_id=%s AND read_at IS NULL", (u["id"],))
    return {"ok": True}

# ---------- кабинет организации (раздел 12 ТЗ) ----------
def _org_admin(request):
    u = me(request)
    if not u["is_org_admin"]:
        raise HTTPException(403, "Раздел доступен руководителю организации")
    return u

@r.get("/api/org/dashboard")
def org_dashboard(request: Request):
    u = _org_admin(request)
    users = db.q("""SELECT us.id,us.full_name,us.department,us.email,us.created_at,
                           r.title AS role_title, r.code AS role_code
                    FROM users us LEFT JOIN roles r ON r.id=us.role_id
                    WHERE us.org_id=%s AND us.is_active ORDER BY us.full_name""", (u["org_id"],))
    people, by_dept, by_role = [], {}, {}
    tot_m = tot_done = tot_over = started = 0
    for p in users:
        courses = logic.user_courses(p["id"])
        mand = [c for c in courses if c["kind"] in ("mandatory", "periodic")]
        done = [c for c in mand if c["status"] == "completed"]
        over = [c for c in mand if c["status"] in ("overdue", "repeat_required")]
        any_att = any(c["attempts"] for c in courses)
        deltas = [c["delta"] for c in courses if c["delta"] is not None]
        tot_m += len(mand); tot_done += len(done); tot_over += len(over)
        started += 1 if any_att else 0
        d = p["department"] or "Без подразделения"
        by_dept.setdefault(d, {"total": 0, "done": 0})
        by_dept[d]["total"] += len(mand); by_dept[d]["done"] += len(done)
        rt = p["role_title"] or "Должность не указана"
        by_role[rt] = by_role.get(rt, 0) + 1
        people.append({
            "id": p["id"], "name": p["full_name"], "email": p["email"],
            "role": p["role_title"], "department": p["department"],
            "mandatory": len(mand), "completed": len(done), "overdue": len(over),
            "pct": round(len(done) / len(mand) * 100) if mand else 0,
            "avg_delta": round(sum(deltas) / len(deltas)) if deltas else None,
            "certificates": len([c for c in courses if c["certificate"]]),
            "nearest_due": min([c["due"] for c in mand if c["due"] and c["status"] != "completed"], default=None),
            "courses": [{"code": c["code"], "title": c["title"], "status": c["status"],
                         "status_title": c["status_title"], "kind": c["kind_title"],
                         "due": c["due"], "last_pct": c["last_pct"], "delta": c["delta"],
                         "certificate": c["certificate"]} for c in courses if c["kind"]]
        })
    not_started = len([p for p in people if p["completed"] == 0 and p["pct"] == 0])
    return {
        "org": u["org_name"],
        "totals": {"employees": len(people), "started": started, "not_started": not_started,
                   "mandatory": tot_m, "completed": tot_done, "overdue": tot_over,
                   "pct": round(tot_done / tot_m * 100) if tot_m else 0},
        "by_department": [{"name": k, **v, "pct": round(v["done"]/v["total"]*100) if v["total"] else 0}
                          for k, v in sorted(by_dept.items())],
        "by_role": [{"role": k, "count": v} for k, v in sorted(by_role.items(), key=lambda x: -x[1])],
        "people": people,
        "subscription": logic.sub_status(u["org_id"])
    }

@r.get("/api/org/report.csv")
def org_report_csv(request: Request):
    u = _org_admin(request)
    data = org_dashboard(request)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Сотрудник", "Должность", "Подразделение", "Курс", "Тип", "Статус",
                "Срок", "Результат", "Прирост", "Сертификат"])
    for p in data["people"]:
        for c in p["courses"]:
            w.writerow([p["name"], p["role"] or "", p["department"] or "", c["title"],
                        c["kind"] or "", c["status_title"], c["due"] or "",
                        f'{c["last_pct"]}%' if c["last_pct"] is not None else "",
                        f'{c["delta"]:+d}' if c["delta"] is not None else "",
                        c["certificate"]["code"] if c["certificate"] else ""])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="obuchenie.csv"'})

@r.post("/api/org/assign")
def org_assign(request: Request, data: dict = Body(...)):
    u = _org_admin(request)
    target = db.q("SELECT id FROM users WHERE id=%s AND org_id=%s", (data.get("user_id"), u["org_id"]), one=True)
    if not target:
        raise HTTPException(404, "Сотрудник не найден в вашей организации")
    course = db.q("SELECT title FROM courses WHERE code=%s", (data.get("course"),), one=True)
    if not course:
        raise HTTPException(404, "Курс не найден")
    days = int(data.get("due_days") or 30)
    due = dt.date.today() + dt.timedelta(days=days)
    db.ex("""INSERT INTO assignments(user_id,course_code,kind,due_date,assigned_by,source)
             VALUES(%s,%s,%s,%s,%s,'manual')
             ON CONFLICT (user_id,course_code) DO UPDATE SET kind=EXCLUDED.kind,
               due_date=EXCLUDED.due_date, assigned_by=EXCLUDED.assigned_by, source='manual'""",
          (target["id"], data["course"], data.get("kind", "mandatory"), due, u["id"]))
    logic.notify(target["id"], "assigned", f"Назначен курс: {course['title']}",
                 f"Назначил руководитель. Срок — до {due:%d.%m.%Y}.", data["course"])
    return {"ok": True, "due": due.isoformat()}

# ---------- подписка и тарифы (разделы 10 и 11 ТЗ) ----------
@r.get("/api/tariffs")
def tariffs(request: Request):
    me(request)
    return db.q("SELECT * FROM tariffs ORDER BY sort")

@r.get("/api/org/subscription")
def org_sub(request: Request):
    u = _org_admin(request)
    inv = db.q("""SELECT number,amount,period_months,tariff_code,status,issued_at,paid_at
                  FROM invoices WHERE org_id=%s ORDER BY issued_at DESC LIMIT 20""", (u["org_id"],))
    return {"subscription": logic.sub_status(u["org_id"]),
            "tariffs": db.q("SELECT * FROM tariffs ORDER BY sort"),
            "invoices": [{**i, "issued_at": i["issued_at"].isoformat(),
                          "paid_at": i["paid_at"].isoformat() if i["paid_at"] else None} for i in inv]}

@r.post("/api/org/subscription/invoice")
def org_invoice(request: Request, data: dict = Body(...)):
    u = _org_admin(request)
    t = db.q("SELECT * FROM tariffs WHERE code=%s", (data.get("tariff"),), one=True)
    if not t:
        raise HTTPException(404, "Тариф не найден")
    months = int(data.get("months") or 12)
    amount = t["price_month"] * months
    seq = db.q("SELECT count(*)+1 AS n FROM invoices", one=True)["n"]
    number = f"LMS-{dt.date.today():%Y%m}-{seq:04d}"
    db.ex("""INSERT INTO invoices(org_id,number,amount,period_months,tariff_code)
             VALUES(%s,%s,%s,%s,%s)""", (u["org_id"], number, amount, months, t["code"]))
    return {"number": number, "amount": amount, "months": months, "tariff": t["title"],
            "note": "Счёт выставлен. Онлайн-оплата подключается после договора эквайринга; "
                    "сейчас оплата по счёту, активация — после подтверждения."}

@r.post("/api/org/subscription/activate")
def org_sub_activate(request: Request, data: dict = Body(...)):
    """Подтверждение оплаты счёта: активирует подписку на оплаченный период."""
    u = _org_admin(request)
    inv = db.q("SELECT * FROM invoices WHERE number=%s AND org_id=%s", (data.get("number"), u["org_id"]), one=True)
    if not inv:
        raise HTTPException(404, "Счёт не найден")
    if inv["status"] == "paid":
        raise HTTPException(400, "Счёт уже оплачен")
    db.ex("UPDATE invoices SET status='paid', paid_at=now() WHERE id=%s", (inv["id"],))
    until = dt.date.today() + dt.timedelta(days=30 * inv["period_months"])
    db.ex("UPDATE subscriptions SET status='expired' WHERE org_id=%s AND status='active'", (u["org_id"],))
    db.ex("""INSERT INTO subscriptions(org_id,tariff_code,valid_until,status)
             VALUES(%s,%s,%s,'active')""", (u["org_id"], inv["tariff_code"], until))
    logic.notify(u["id"], "result", "Подписка активирована",
                 f"Тариф оплачен до {until:%d.%m.%Y}.", None)
    return {"ok": True, "valid_until": until.isoformat()}

@r.post("/api/org/subscription/settings")
def org_sub_settings(request: Request, data: dict = Body(...)):
    u = _org_admin(request)
    sub = db.q("SELECT id FROM subscriptions WHERE org_id=%s AND status='active' ORDER BY created_at DESC LIMIT 1",
               (u["org_id"],), one=True)
    if not sub:
        raise HTTPException(404, "Активная подписка не найдена")
    if "auto_renew" in data:
        db.ex("UPDATE subscriptions SET auto_renew=%s WHERE id=%s", (bool(data["auto_renew"]), sub["id"]))
    if "extra_licenses" in data:
        db.ex("UPDATE subscriptions SET extra_licenses=%s WHERE id=%s", (int(data["extra_licenses"]), sub["id"]))
    if data.get("suspend"):
        db.ex("UPDATE subscriptions SET status='suspended' WHERE id=%s", (sub["id"],))
    if data.get("resume"):
        db.ex("UPDATE subscriptions SET status='active' WHERE id=%s", (sub["id"],))
    return {"ok": True, "subscription": logic.sub_status(u["org_id"])}

# ---------- администрирование ролей и настроек ----------
@r.post("/api/admin/role")
def admin_role(request: Request, data: dict = Body(...)):
    u = _org_admin(request)
    code = (data.get("code") or "").strip()
    if not code or not data.get("title"):
        raise HTTPException(400, "Нужны код и название роли")
    db.ex("""INSERT INTO roles(code,title,can_manage_org,sort) VALUES(%s,%s,%s,%s)
             ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title,
               can_manage_org=EXCLUDED.can_manage_org, sort=EXCLUDED.sort""",
          (code, data["title"], bool(data.get("can_manage_org")), int(data.get("sort") or 200)))
    return {"ok": True}

@r.post("/api/admin/role-course")
def admin_role_course(request: Request, data: dict = Body(...)):
    _org_admin(request)
    db.ex("""INSERT INTO role_courses(role_code,course_code,kind,period_months,due_days)
             VALUES(%s,%s,%s,%s,%s) ON CONFLICT (role_code,course_code) DO UPDATE
             SET kind=EXCLUDED.kind, period_months=EXCLUDED.period_months, due_days=EXCLUDED.due_days""",
          (data["role"], data["course"], data.get("kind", "recommended"),
           data.get("period_months"), data.get("due_days", 30)))
    return {"ok": True}

@r.get("/api/admin/matrix")
def admin_matrix(request: Request):
    _org_admin(request)
    return {"roles": db.q("SELECT code,title,can_manage_org FROM roles ORDER BY sort,title"),
            "courses": db.q("SELECT code,title,direction_code FROM courses ORDER BY direction_code,step"),
            "matrix": db.q("SELECT * FROM role_courses"),
            "scale": db.q("SELECT * FROM grading_scale ORDER BY min_pct DESC"),
            "exam": db.q("SELECT * FROM exam_settings")}

@r.post("/api/admin/exam-settings")
def admin_exam(request: Request, data: dict = Body(...)):
    _org_admin(request)
    db.ex("""INSERT INTO exam_settings(course_code,q_count,time_min,pass_pct,max_attempts,shuffle_q,shuffle_o,cert_months)
             VALUES(%s,%s,%s,%s,%s,%s,%s,%s)
             ON CONFLICT (course_code) DO UPDATE SET q_count=EXCLUDED.q_count, time_min=EXCLUDED.time_min,
               pass_pct=EXCLUDED.pass_pct, max_attempts=EXCLUDED.max_attempts,
               shuffle_q=EXCLUDED.shuffle_q, shuffle_o=EXCLUDED.shuffle_o, cert_months=EXCLUDED.cert_months""",
          (data["course"], int(data.get("q_count", 20)), int(data.get("time_min", 30)),
           int(data.get("pass_pct", 80)), int(data.get("max_attempts", 3)),
           bool(data.get("shuffle_q", True)), bool(data.get("shuffle_o", True)),
           int(data.get("cert_months", 12))))
    return {"ok": True}

@r.post("/api/admin/scale")
def admin_scale(request: Request, data: dict = Body(...)):
    _org_admin(request)
    rows = data.get("scale") or []
    if not rows:
        raise HTTPException(400, "Пустая шкала")
    db.ex("DELETE FROM grading_scale")
    for x in rows:
        db.ex("INSERT INTO grading_scale(min_pct,title,passed) VALUES(%s,%s,%s)",
              (int(x["min_pct"]), x["title"], bool(x.get("passed", True))))
    return {"ok": True}
