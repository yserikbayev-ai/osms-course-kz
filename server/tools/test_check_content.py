import copy, json, subprocess, sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).parent))
from check_content import check_content

TEXT = "Статья 1. Профилактические осмотры проводятся ежегодно.\nПункт 2. Скрининг\nпроводится  по «целевым группам»."
BASE = {
    "acts": {"A1": {"id": "X1", "num": "1", "date": "01.01.2020", "title": "t"}},
    "lessons": [{"id": "L1", "title": "t", "cards": [
        {"a": "A1", "p": 1, "norm": "Профилактические осмотры проводятся ежегодно.", "plain": "Раз в год."}]}],
    "questions": [
        {"id": f"q{g}", "g": g, "l": "L1", "a": "A1", "p": 1, "q": "Как часто?",
         "o": ["Раз в год", "Раз в месяц", "Раз в неделю", "Никогда"], "c": 0, "e": "Пункт 1."}
        for g in (1, 2, 3, 1, 2, 3)],
}
for _i, _q in enumerate(BASE["questions"]):
    _q["id"] = f"q{_i}"


def run(tmp_path, mutate=None):
    d = copy.deepcopy(BASE)
    if mutate:
        mutate(d)
    (tmp_path / "x.txt").write_text(TEXT, encoding="utf-8")
    (tmp_path / "acts.json").write_text(json.dumps({"A1": {"text": "x.txt"}}), encoding="utf-8")
    f = tmp_path / "content.json"
    f.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    return check_content(str(f), acts_path=str(tmp_path / "acts.json"), root=str(tmp_path))


def q(d, i=0):
    return d["questions"][i]


CASES = {
    "no_act": (lambda d: q(d).pop("a"), "акт"),
    "no_point": (lambda d: q(d).pop("p"), "пункт"),
    "three_options": (lambda d: q(d).update(o=["а", "б", "в"]), "4 вариант"),
    "two_correct": (lambda d: q(d).update(c=[0, 1]), "верн"),
    "no_correct": (lambda d: q(d).update(c=None), "верн"),
    "dup_options": (lambda d: q(d).update(o=["Раз в год", " раз  в год", "Раз в неделю", "Никогда"]), "повтор"),
    "long_correct": (lambda d: q(d).update(o=["Раз в год при условии медосмотра", "Раз", "Два", "Три"]), "длиннее"),
    "no_explanation": (lambda d: q(d).update(e=""), "объяснен"),
    "quote_missing": (lambda d: d["lessons"][0]["cards"][0].update(norm="Осмотры проводятся раз в пять лет."), "цитат"),
    "card_no_act": (lambda d: d["lessons"][0]["cards"][0].pop("a"), "карточк"),
    "card_no_point": (lambda d: d["lessons"][0]["cards"][0].pop("p"), "карточк"),
    "level_missing": (lambda d: [d["questions"].pop(5), d["questions"].pop(2)], "уровн"),
    "level_has_one": (lambda d: q(d, 5).update(g=2), "уровн"),
    "lesson_under_six": (lambda d: [d["questions"].pop(5)], "6"),
}


def test_valid_content_has_no_errors(tmp_path):
    assert run(tmp_path) == []


@pytest.mark.parametrize("name", CASES)
def test_violation_is_reported(tmp_path, name):
    mutate, word = CASES[name]
    errs = run(tmp_path, mutate)
    assert errs and any(word in e for e in errs), errs


def test_quote_matches_after_normalizing_spaces_and_quotes(tmp_path):
    def m(d):
        d["lessons"][0]["cards"][0]["norm"] = 'Скрининг проводится по "целевым группам".'
    assert run(tmp_path, m) == []


def test_cli_exit_code(tmp_path):
    def bad(d):
        q(d).update(o=["а", "б", "в"])
    run(tmp_path, bad)
    args = [sys.executable, str(Path(__file__).parent / "check_content.py"), str(tmp_path / "content.json"),
            "--acts", str(tmp_path / "acts.json"), "--root", str(tmp_path)]
    r = subprocess.run(args, capture_output=True, text=True)
    assert r.returncode != 0 and "4 вариант" in r.stdout
    run(tmp_path)
    assert subprocess.run(args, capture_output=True, text=True).returncode == 0


def test_npa_path_is_read_relative_to_npa_root(tmp_path):
    (tmp_path / "documents").mkdir()
    (tmp_path / "documents" / "a.md").write_text(TEXT, encoding="utf-8")
    d = copy.deepcopy(BASE)
    d["acts"]["A1"]["npa"] = "documents/a.md"
    f = tmp_path / "c.json"
    f.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "none.json").write_text("{}", encoding="utf-8")
    assert check_content(str(f), acts_path=str(tmp_path / "none.json"), npa_root=str(tmp_path)) == []
    d["lessons"][0]["cards"][0]["norm"] = "Осмотры проводятся раз в пять лет."
    f.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    errs = check_content(str(f), acts_path=str(tmp_path / "none.json"), npa_root=str(tmp_path))
    assert any("цитат" in e for e in errs), errs
