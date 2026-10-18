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
