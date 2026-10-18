import pathlib
from app import structure

PATH = pathlib.Path(__file__).resolve().parent.parent / "structure.json"

def test_load_structure_counts(db):
    r = structure.load_structure(str(PATH))
    assert r == {"directions": 19, "courses": 53, "modules": 189, "links": 7}   # числа из листа «Курсы (итог)»
    q = db.q
    assert q("SELECT count(*) n FROM directions WHERE code ~ '^d[0-9]{2}$'", one=True)["n"] == 19
    assert q("SELECT count(*) n FROM courses WHERE code ~ '^K[0-9]'", one=True)["n"] == 53
    assert q("SELECT count(*) n FROM courses WHERE code ~ '^K' AND status<>'планируется'", one=True)["n"] == 0
    assert q("SELECT count(*) n FROM modules WHERE code ~ '^K'", one=True)["n"] == 189
    assert q("SELECT count(*) n FROM modules WHERE status='ссылка'", one=True)["n"] == 7
    assert q("SELECT link_module FROM modules WHERE code='K14.2.2'", one=True)["link_module"] == "K09.1.1"

def test_links_have_no_lessons_and_idempotent(db):
    structure.load_structure(str(PATH))
    before = db.q("SELECT code,course_code,status,link_module FROM modules ORDER BY code")
    structure.load_structure(str(PATH))
    assert db.q("SELECT code,course_code,status,link_module FROM modules ORDER BY code") == before
    assert db.q("""SELECT count(*) n FROM lessons l JOIN modules m ON m.code=l.module_code
                   WHERE m.status='ссылка'""", one=True)["n"] == 0

def test_old_directions_moved_without_losing_courses(db):
    old = {c["code"] for c in db.q("SELECT code FROM courses")}
    assert len(old) == 10
    structure.load_structure(str(PATH))
    where = {c["code"]: c["direction_code"] for c in db.q("SELECT code,direction_code FROM courses")}
    assert old <= set(where)
    assert where["c-attach-base"] == where["c-dist-base"] == "d01"
    assert where["c-vax-base"] == where["c-chk-base"] == where["c-disp-base"] == "d02"
    assert where["c-osms-right"] == "d17"
    assert db.q("SELECT count(*) n FROM directions", one=True)["n"] == 19
    assert db.q("SELECT count(*) n FROM lessons", one=True)["n"] == 15
    assert db.q("SELECT count(*) n FROM courses WHERE code IN ('c-osms-right') AND status='опубликован'", one=True)["n"] == 1
