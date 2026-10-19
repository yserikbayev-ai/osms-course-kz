import json, pathlib, pytest
from app import structure

PATH = str(pathlib.Path(__file__).resolve().parent.parent / "structure.json")

def content(module="K02.1.3"):
    return {"acts": {"A99": {"id": "V1", "num": "№1", "date": "01.01.2020", "reg": "1", "title": "Акт", "url": "https://adilet.zan.kz/rus/docs/V1"}},
            "lessons": [{"id": "F1", "course": "K02.1", "module": module, "status": "опубликован", "grade": 2,
                         "title": "Факторы риска", "intro": "Вступление",
                         "cards": [{"a": "A99", "p": 3, "norm": "Норма", "plain": "Просто"}]}],
            "questions": [{"id": f"q900{g}", "g": g, "l": "F1", "a": "A99", "p": 3, "q": f"Вопрос {g}",
                           "o": ["а", "б", "в", "г"], "c": 1, "e": "Потому"} for g in (1, 2, 3)]}

def write(tmp_path, d):
    p = tmp_path / "c.json"; p.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8"); return str(p)

def test_load_content_fills_directories_and_is_idempotent(db, tmp_path):
    structure.load_structure(PATH); structure.absorb_direction2()
    p = write(tmp_path, content())
    r = structure.load_content(p)
    assert r == {"acts": 1, "lessons": 1, "cards": 1, "questions": 3}
    assert db.q("SELECT course_code,module_code,level FROM lessons WHERE code='F1'", one=True) == \
        {"course_code": "K02.1", "module_code": "K02.1.3", "level": 2}
    assert db.q("SELECT status FROM modules WHERE code='K02.1.3'", one=True)["status"] == "опубликован"
    assert db.q("SELECT count(*) n FROM video_slots WHERE lesson_code='F1'", one=True)["n"] == 1
    assert db.q("SELECT options,correct FROM questions WHERE code='q9001'", one=True) == {"options": ["а", "б", "в", "г"], "correct": 1}
    structure.load_content(p)
    assert db.q("SELECT count(*) n FROM cards WHERE lesson_code='F1'", one=True)["n"] == 1
    assert db.q("SELECT count(*) n FROM questions WHERE lesson_code='F1'", one=True)["n"] == 3

def test_load_content_refuses_link_module(db, tmp_path):
    structure.load_structure(PATH)
    with pytest.raises(ValueError, match="K14.2.2"):
        structure.load_content(write(tmp_path, content("K14.2.2")))
    assert db.q("SELECT count(*) n FROM lessons WHERE code='F1'", one=True)["n"] == 0

def test_old_question_frozen_and_exam_settings_recalculated(db, tmp_path):
    structure.load_structure(PATH); structure.absorb_direction2()
    empty = db.q("SELECT q_count,time_min FROM exam_settings WHERE course_code='K02.1'", one=True)
    structure.load_content(write(tmp_path, content()))
    d = content(); d["questions"] = [{**content()["questions"][0], "id": f"q910{i}", "q": f"Новый {i}", "g": i % 3 + 1} for i in range(1, 13)]
    structure.load_content(write(tmp_path, d))
    frozen = {r["code"] for r in db.q("SELECT code FROM questions WHERE frozen")}
    assert {"q9001", "q9002", "q9003"} <= frozen and "q9101" not in frozen
    s = db.q("SELECT q_count,time_min FROM exam_settings WHERE course_code='K02.1'", one=True)
    assert s["q_count"] > empty["q_count"] and s["time_min"] > empty["time_min"]
    old = sum(q["l"] in ("P1", "P2") for q in json.load(open(pathlib.Path(PATH).parent / "content.json"))["questions"])
    assert s["q_count"] == min(20, old + 12) and s["time_min"] == 2 * s["q_count"]   # 12 новых живых + прежние P1/P2
    structure.load_content(write(tmp_path, d))           # повтор ничего не меняет
    assert {r["code"] for r in db.q("SELECT code FROM questions WHERE frozen")} == frozen

def test_load_all_content_takes_every_course_file_and_survives_broken_one(db, tmp_path):
    from app import main
    structure.load_structure(PATH); structure.absorb_direction2()
    (tmp_path / "content-k031.json").write_text("{не json", encoding="utf-8")
    good = content(); good["lessons"][0]["id"] = "F2"
    for q in good["questions"]:
        q["l"] = "F2"; q["id"] = q["id"].replace("q90", "q95")
    (tmp_path / "content-k059.json").write_text(json.dumps(good, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "other.json").write_text("{не json", encoding="utf-8")   # не по маске — не трогается
    main._load_all_content(str(tmp_path))
    assert db.q("SELECT count(*) n FROM lessons WHERE code='F2'", one=True)["n"] == 1

def test_every_real_content_file_loads(db):
    from app import main
    structure.load_structure(PATH); structure.absorb_direction2()
    failed = main._load_all_content(str(pathlib.Path(PATH).parent / "content"))
    assert failed == []

def test_point_migration_converts_existing_integer_columns(db):
    import psycopg
    from conftest import DSN, apply_schema4
    with psycopg.connect(DSN, autocommit=True) as c:
        c.execute("UPDATE cards SET point=NULL; ALTER TABLE cards ALTER COLUMN point TYPE INT USING NULL")
        c.execute("INSERT INTO cards(lesson_code,norm,point) SELECT code,'н',7 FROM lessons LIMIT 1")
    apply_schema4()
    assert db.q("SELECT point FROM cards WHERE norm='н'", one=True)["point"] == "7"
