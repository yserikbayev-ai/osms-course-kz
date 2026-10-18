import pathlib, pytest
from app import structure

PATH = str(pathlib.Path(__file__).resolve().parent.parent / "structure.json")

@pytest.fixture
def seeded(db):
    """Три сотрудника: A — двойное назначение, B — одно на c-vax-base, C — только попытка и сертификат."""
    q, ex = db.q, db.ex
    org = q("INSERT INTO organizations(name) VALUES('Клиника') RETURNING id", one=True)["id"]
    u = {}
    for n in "ABC":
        u[n] = q("INSERT INTO users(org_id,full_name,email,password_hash) VALUES(%s,%s,%s,'x') RETURNING id",
                 (org, n, f"{n}@t.kz"), one=True)["id"]
    ex("""INSERT INTO assignments(user_id,course_code,kind,due_date) VALUES
          (%s,'c-chk-base','recommended','2026-12-01'),(%s,'c-chk-screen','mandatory','2026-11-01'),
          (%s,'c-vax-base','mandatory','2026-12-15')""", (u["A"], u["A"], u["B"]))
    att = q("""INSERT INTO attempts(user_id,course_code,ticket,total,correct_cnt,pct,passed,finished_at)
               VALUES(%s,'c-chk-base','[]',5,5,100,TRUE,now()) RETURNING id""", (u["C"],), one=True)["id"]
    ex("INSERT INTO certificates(user_id,course_code,code,pct,valid_until) VALUES(%s,'c-chk-base','CERT-1',100,'2027-10-18')", (u["C"],))
    ex("INSERT INTO corrective_actions(user_id,course_code,attempt_id,lesson_code,errors) VALUES(%s,'c-chk-base',%s,'P1',2)", (u["C"], att))
    ex("INSERT INTO lesson_progress(user_id,lesson_code) VALUES(%s,'P1')", (u["C"],))
    structure.load_structure(PATH)
    return db, u

def test_absorb_moves_lessons_and_archives(seeded):
    db, u = seeded
    r = structure.absorb_direction2()
    assert r["moved_lessons"] == 5 and r["archived_courses"] == 4 and r["repointed_assignments"] == 3
    lc = {x["code"]: x["course_code"] for x in db.q("SELECT code,course_code FROM lessons")}
    assert (lc["P1"], lc["P2"], lc["D1"], lc["V1"], lc["V2"]) == ("K02.1", "K02.1", "K02.2", "K02.3", "K02.3")
    st = {x["code"]: x["status"] for x in db.q("SELECT code,status FROM courses")}
    assert [st[c] for c in ("c-chk-base", "c-chk-screen", "c-disp-base", "c-vax-base")] == ["архив"] * 4
    assert [st[c] for c in ("K02.1", "K02.2", "K02.3")] == ["опубликован"] * 3
    assert st["K03.1"] == "планируется" and st["c-osms-right"] == "опубликован"
    ms = {x["code"]: x["status"] for x in db.q("SELECT code,status FROM modules")}
    assert ms["K02.1.1"] == ms["K02.3.1"] == "опубликован" and ms["K02.1.3"] == "планируется"
    assert db.q("SELECT module_code FROM lessons WHERE code='V2'", one=True)["module_code"] == "K02.3.3"

def test_absorb_keeps_history_and_merges_assignments(seeded):
    db, u = seeded
    structure.absorb_direction2()
    a = db.q("SELECT course_code,kind,due_date::text d FROM assignments WHERE user_id=%s", (u["A"],))
    assert a == [{"course_code": "K02.1", "kind": "mandatory", "d": "2026-11-01"}]   # жёстче: срок раньше
    b = db.q("SELECT course_code,d FROM (SELECT course_code,due_date::text d FROM assignments WHERE user_id=%s) t", (u["B"],))
    assert b == [{"course_code": "K02.3", "d": "2026-12-15"}]
    assert db.q("SELECT course_code,passed FROM attempts WHERE user_id=%s", (u["C"],)) == [{"course_code": "c-chk-base", "passed": True}]
    assert db.q("SELECT count(*) n FROM certificates WHERE code='CERT-1' AND NOT revoked", one=True)["n"] == 1
    assert db.q("SELECT count(*) n FROM lesson_progress WHERE lesson_code='P1'", one=True)["n"] == 1
    assert db.q("SELECT course_code FROM corrective_actions WHERE user_id=%s", (u["C"],))[0]["course_code"] == "K02.1"

def test_absorb_matrix_and_idempotent(seeded):
    db, _ = seeded
    structure.absorb_direction2()
    assert db.q("SELECT count(*) n FROM role_courses WHERE course_code IN ('c-chk-base','c-chk-screen','c-disp-base','c-vax-base')", one=True)["n"] == 0
    peds = db.q("SELECT kind FROM role_courses WHERE role_code='pediatrician' AND course_code='K02.1'")
    assert peds == [{"kind": "mandatory"}]          # c-chk-base M + c-chk-screen R -> один, более жёсткий
    assert db.q("SELECT count(*) n FROM exam_settings WHERE course_code IN ('K02.1','K02.2','K02.3')", one=True)["n"] == 3
    snap = [db.q(s) for s in ("SELECT * FROM assignments ORDER BY id", "SELECT * FROM role_courses ORDER BY id",
                              "SELECT code,course_code FROM lessons ORDER BY code", "SELECT code,status FROM courses ORDER BY code")]
    assert structure.absorb_direction2() == {"moved_lessons": 0, "repointed_assignments": 0, "archived_courses": 0}
    structure.load_structure(PATH)                   # повторная загрузка структуры не откатывает поглощение
    assert snap == [db.q(s) for s in ("SELECT * FROM assignments ORDER BY id", "SELECT * FROM role_courses ORDER BY id",
                                      "SELECT code,course_code FROM lessons ORDER BY code", "SELECT code,status FROM courses ORDER BY code")]

def test_schema4_applies_twice_without_changes(db):
    from conftest import apply_schema4
    apply_schema4()   # первая миграция на базе с уже загруженными уроками
    snap = db.q("SELECT code,status FROM courses ORDER BY code"), db.q("SELECT * FROM video_slots ORDER BY lesson_code")
    apply_schema4(); apply_schema4()
    assert snap == (db.q("SELECT code,status FROM courses ORDER BY code"), db.q("SELECT * FROM video_slots ORDER BY lesson_code"))
    assert len(snap[1]) == 15 and {x["status"] for x in snap[0]} == {"опубликован"}
