"""Проверка сценариев: check_scenarios.py [--content-glob 'content/content-k*.json'] [--scenarios-dir папка].
Для каждого урока со статусом «опубликован» в <scenarios-dir>/<курс>.md должна быть секция `## <код урока> —`
с таблицей сцен, где у каждой сцены заполнены акт и пункт (последний столбец). Выход не ноль при ошибках."""
import argparse, glob, json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_GLOB = str(HERE.parent / "content" / "content-k*.json")
DEFAULT_DIR = (Path.home() / "Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты"
               / "Medical LMS/03_Артефакты/video/Сценарии")


def section(md, lesson_id):
    m = re.search(rf"^## {re.escape(lesson_id)} —.*?(?=^## |\Z)", md, re.S | re.M)
    return m.group(0) if m else None


def check_scenarios(content_glob=DEFAULT_GLOB, scenarios_dir=DEFAULT_DIR):
    errs = []
    for cf in sorted(glob.glob(str(content_glob))):
        for les in json.load(open(cf, encoding="utf-8")).get("lessons", []):
            if les.get("status") != "опубликован":
                continue
            lid, f = les["id"], Path(scenarios_dir) / f"{les['course']}.md"
            if not f.is_file():
                errs.append(f"урок {lid}: нет файла сценария {f}")
                continue
            sec = section(f.read_text(encoding="utf-8"), lid)
            if sec is None:
                errs.append(f"урок {lid}: нет секции '## {lid} —' в {f.name}")
                continue
            rows = [[c.strip() for c in l.strip().strip("|").split("|")]
                    for l in sec.splitlines() if l.lstrip().startswith("|")]
            scenes = [r for r in rows if r and r[0].isdigit()]
            if not scenes:
                errs.append(f"урок {lid}: нет таблицы сцен")
            for r in scenes:
                if len(r) < 4 or not r[-1]:
                    errs.append(f"урок {lid}: сцена {r[0]} без акта и пункта")
    return errs


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--content-glob", default=DEFAULT_GLOB)
    ap.add_argument("--scenarios-dir", default=str(DEFAULT_DIR))
    a = ap.parse_args()
    e = check_scenarios(a.content_glob, a.scenarios_dir)
    print("\n".join(e) if e else "OK")
    sys.exit(1 if e else 0)
