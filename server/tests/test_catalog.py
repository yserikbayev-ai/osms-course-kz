import pathlib, pytest
from fastapi.testclient import TestClient
from app import structure, auth

PATH = str(pathlib.Path(__file__).resolve().parent.parent / "structure.json")

@pytest.fixture
def api(db):
    structure.load_structure(PATH)
    structure.absorb_direction2()
    org = db.q("INSERT INTO organizations(name) VALUES('Клиника') RETURNING id", one=True)["id"]
    uid = db.q("INSERT INTO users(org_id,full_name,email,password_hash) VALUES(%s,'A','a@t.kz','x') RETURNING id",
               (org,), one=True)["id"]
    from app.main import app
    c = TestClient(app, base_url="https://testserver")
    c.cookies.set(auth.COOKIE, auth.new_session(uid))
    c.uid, c.db = uid, db
    return c

def test_content_has_statuses_links_counters(api):
    d = api.get("/api/content").json()
    dirs = {x["code"]: x for x in d["directions"]}
    assert len(dirs) == 19
    assert dirs["d02"]["total_modules"] > 0
    assert 0 < dirs["d02"]["published_count"] < dirs["d02"]["total_modules"]
    assert dirs["d09"]["published_count"] == 0
    courses = {c["code"]: c for c in d["courses"]}
    assert courses["K02.1"]["status"] == "опубликован" and courses["K09.1"]["status"] == "планируется"
    assert "c-chk-base" not in courses                       # архив из каталога скрыт
    mods = [m for m in d["modules"] if m["status"] == "ссылка"]
    assert mods and all(m["link"] for m in mods)

def test_exam_and_drill_refuse_planned_course(api):
    r = api.post("/api/exam/start", json={"course": "K09.1"})
    assert r.status_code == 409 and "скоро" in r.json()["detail"].lower()
    assert api.post("/api/drill/start", json={"course": "K09.1"}).status_code == 409
    assert api.post("/api/exam/start", json={"course": "c-chk-base"}).status_code == 409   # архив

def test_exam_and_drill_work_on_published(api):
    r = api.post("/api/exam/start", json={"course": "K02.3"})
    assert r.status_code == 200 and r.json()["questions"]
    assert api.post("/api/drill/start", json={"course": "K02.3"}).json()["questions"]

def test_planned_courses_make_no_assignments_or_notices(api):
    from app import logic
    db = api.db
    db.ex("INSERT INTO role_courses(role_code,course_code,kind,due_days) VALUES('gp','K09.1','mandatory',1)")
    assert logic.apply_role_assignments(api.uid, "gp") >= 1       # опубликованные назначены
    assert not db.q("SELECT 1 FROM assignments WHERE user_id=%s AND course_code='K09.1'", (api.uid,))
    db.ex("INSERT INTO assignments(user_id,course_code,kind,due_date) VALUES(%s,'K09.1','mandatory','2020-01-01')", (api.uid,))
    logic.scan_deadlines()
    assert not db.q("SELECT 1 FROM notifications WHERE user_id=%s AND ref='K09.1'", (api.uid,))
    assert all(c["code"] != "K09.1" for c in logic.user_courses(api.uid))
    db.ex("UPDATE users SET is_org_admin=TRUE WHERE id=%s", (api.uid,))
    assert api.post("/api/org/assign", json={"user_id": api.uid, "course": "K09.1"}).status_code == 409

def test_matrix_only_seven_roles_of_sheet(api):
    from app import seed2
    seed2.seed_structure_matrix()
    n1 = api.db.q("SELECT count(*) n FROM role_courses", one=True)["n"]
    seed2.seed_structure_matrix()
    assert api.db.q("SELECT count(*) n FROM role_courses", one=True)["n"] == n1
    q = api.db.q
    kind = lambda role, c: (q("SELECT kind FROM role_courses WHERE role_code=%s AND course_code=%s", (role, c), one=True) or {}).get("kind")
    assert kind("cardiologist", "K05.1") == "mandatory" and kind("gp", "K05.1") == "recommended"
    assert kind("accountant", "K19.1") == "mandatory" and kind("chief_doctor", "K18.3") == "recommended"
    assert kind("gp", "K12.1") is None and kind("pediatrician", "K16.1") is None   # листа на это нет
    for role in ("director", "deputy_chief", "admin", "nurse", "ophthalmologist", "neurologist", "surgeon", "gynecologist", "lab"):
        assert not q("SELECT 1 FROM role_courses WHERE role_code=%s AND course_code ~ '^K[0-9]+\\.[0-9]+$' AND course_code NOT LIKE 'K02.%%'", (role,))
    assert not q("SELECT 1 FROM role_courses WHERE course_code IN ('c-chk-base','c-chk-screen','c-disp-base','c-vax-base')")

def test_archived_course_visible_only_with_history(api):
    from app import logic
    codes = lambda: [c["code"] for c in logic.user_courses(api.uid)]
    assert "c-chk-base" not in codes()
    api.db.ex("""INSERT INTO attempts(user_id,course_code,ticket,total,correct_cnt,pct,passed,finished_at)
                 VALUES(%s,'c-chk-base','[]',5,5,100,TRUE,now())""", (api.uid,))
    assert "c-chk-base" in codes()

def test_real_startup_twice_keeps_old_courses_archived(api):
    import asyncio
    from app import main
    for _ in range(2):
        asyncio.run(main._startup())
    st = {c["code"]: c["status"] for c in api.db.q("SELECT code,status FROM courses")}
    assert st["c-chk-base"] == "архив" and st["K02.1"] == "опубликован" and st["K09.1"] == "планируется"
    assert api.db.q("SELECT 1 FROM role_courses WHERE course_code='K05.1' LIMIT 1", one=True)

def test_startup_loads_k02_content_idempotently(api):
    import asyncio
    from app import main
    asyncio.run(main._startup())
    def snap():
        return (api.db.q("SELECT code,course_code,module_code FROM lessons WHERE course_code LIKE 'K02.%%' ORDER BY code"),
                api.db.q("SELECT q.code,q.frozen FROM questions q JOIN lessons l ON l.code=q.lesson_code WHERE l.course_code LIKE 'K02.%%' ORDER BY q.code"))
    les, qs = snap()
    for c in ("K02.1", "K02.2", "K02.3"):
        assert any(l["course_code"] == c for l in les), c
        assert api.db.q("SELECT count(*) n FROM questions q JOIN lessons l ON l.code=q.lesson_code WHERE l.course_code=%s", (c,), one=True)["n"] > 0
    assert {"V2": "K02.3.3"}["V2"] == next(l["module_code"] for l in les if l["code"] == "V2")
    api.db.ex("UPDATE questions SET frozen=TRUE WHERE code=(SELECT min(code) FROM questions WHERE lesson_code='P1')")
    before = snap()
    asyncio.run(main._startup())
    assert snap() == before
