import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from check_scenarios import check_scenarios

SECTION = """## {id} — Название

Длительность: 4 мин.

| № | Экран | Закадровый текст | Акт / пункт |
|---|---|---|---|
| 1 | Титул | Текст нормы. | {act} |
| 2 | Карточка | Ещё текст. | Приказ № 1, п. 3 |
"""


def setup(tmp_path, md):
    tmp_path.mkdir(exist_ok=True)
    (tmp_path / "content-k031.json").write_text(json.dumps({"lessons": [
        {"id": "K03.1.1", "course": "K03.1", "status": "опубликован"},
        {"id": "K03.1.2", "course": "K03.1", "status": "планируется"}]}), encoding="utf-8")
    sc = tmp_path / "sc"; sc.mkdir()
    if md is not None:
        (sc / "K03.1.md").write_text(md, encoding="utf-8")
    return str(tmp_path / "content-k*.json"), str(sc)


def test_complete_scenario_passes_and_unpublished_lesson_is_ignored(tmp_path):
    assert check_scenarios(*setup(tmp_path, SECTION.format(id="K03.1.1", act="Приказ № 1, п. 2"))) == []


def test_missing_section_and_missing_file_are_reported(tmp_path):
    errs = check_scenarios(*setup(tmp_path, SECTION.format(id="K03.1.9", act="x")))
    assert any("K03.1.1" in e and "нет секции" in e for e in errs), errs
    errs = check_scenarios(*setup(tmp_path / "b", None))
    assert any("K03.1.1" in e for e in errs), errs


def test_scene_without_act_is_reported(tmp_path):
    errs = check_scenarios(*setup(tmp_path, SECTION.format(id="K03.1.1", act="")))
    assert any("сцена 1" in e and "акт" in e for e in errs), errs


def test_section_without_scene_table_is_reported(tmp_path):
    errs = check_scenarios(*setup(tmp_path, "## K03.1.1 — Название\n\nПусто.\n"))
    assert any("таблиц" in e for e in errs), errs


def test_cli_exit_code(tmp_path):
    g, d = setup(tmp_path, "## K03.1.1 — Название\n")
    args = [sys.executable, str(Path(__file__).parent / "check_scenarios.py"), "--content-glob", g, "--scenarios-dir", d]
    assert subprocess.run(args, capture_output=True, text=True).returncode != 0
