"""Сводный реестр модулей и актов: python3 tools/build_registry.py [--out файл.xlsx].
Источники: structure.json, content/content-k*.json, итог_NN.tsv (причины, пометки «ссылка») и, для направления 2,
Реестр_источников_направления_2.xlsx. Нужен openpyxl (системный python3). Падает, если число модулей или
вопросов в листе не сходится с исходниками."""
import argparse, collections, glob, json, re
from pathlib import Path
import openpyxl

HERE = Path(__file__).parent
SRV = HERE.parent
DRIVE = (Path.home() / "Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical LMS")
SRC = DRIVE / "01_Источники"
REG = SRC / "Реестр_модулей_и_актов"
SCEN = DRIVE / "03_Артефакты/video/Сценарии"


def read_tsv():
    """итог_NN.tsv -> {модуль: [код, статус, акты, карточек, вопросов, причина]}; в K13/K16 разделитель '; '."""
    rows = {}
    for f in sorted(REG.glob("итог_*.tsv")):
        for ln in f.read_text(encoding="utf-8").splitlines():
            r = [x.strip() for x in (ln.split("\t") if "\t" in ln else ln.split(";"))]
            if re.match(r"K\d\d\.\d\.\d", r[0]):
                rows[r[0]] = r + [""] * (6 - len(r))
    return rows


def d2_reasons():
    ws = openpyxl.load_workbook(SRC / "Реестр_источников_направления_2.xlsx")["Вердикты по темам"]
    return {r[0]: r[4] for r in ws.iter_rows(values_only=True) if r[0] and str(r[0]).startswith("K02")}


def act_label(a):
    n = a["num"]
    return (f"Приказ МЗ РК № {n}" if n.startswith("ҚР") else f"Акт № {n}") + f" от {a['date']}"


def build(out):
    st = json.load(open(SRV / "structure.json", encoding="utf-8"))
    dirs = {d["code"]: f"{d['num']}. {d['title']}" for d in st["directions"]}
    courses = {c["code"]: c for c in st["courses"]}
    tsv, d2 = read_tsv(), d2_reasons()
    by_mod, acts = {}, {}   # by_mod: модуль -> урок; acts: V-код -> сводка
    total_q = total_c = 0
    for f in sorted(glob.glob(str(SRV / "content/content-k*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        total_q += len(d["questions"])
        for les in d["lessons"]:
            if les["status"] != "опубликован":
                continue
            qs = [q for q in d["questions"] if q["l"] == les["id"]]
            used = collections.Counter(c["a"] for c in les["cards"])
            qa = collections.Counter(q["a"] for q in qs)
            total_c += len(les["cards"])
            by_mod[les["module"]] = dict(lesson=les["id"], cards=len(les["cards"]), qs=len(qs),
                                         acts=[d["acts"][k]["id"] for k in used | qa])
            for k in used | qa:
                a = d["acts"][k]
                s = acts.setdefault(a["id"], dict(a=a, cards=0, qs=0, mods=set()))
                s["cards"] += used[k]; s["qs"] += qa[k]; s["mods"].add(les["module"])
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Модули"
    ws.append(["Модуль", "Направление", "Курс", "Название", "Статус", "Урок", "Вопросов", "Карточек",
               "Акты (коды)", "Акты (названия)", "Причина / ссылка", "Сценарий"])
    for m in st["modules"]:
        c, t, b = m["code"], tsv.get(m["code"]), by_mod.get(m["code"])
        if b:
            status, reason = "опубликован", ""
        elif t and t[1] == "ссылка":
            status, reason = "ссылка", t[2]
        else:
            status, reason = "планируется", (t[5] if t else d2.get(c, ""))
        acodes = sorted(b["acts"]) if b else []
        ws.append([c, dirs[courses[m["course"]]["direction"]], f"{m['course']} {courses[m['course']]['title']}",
                   m["title"], status, b["lesson"] if b else "", b["qs"] if b else 0, b["cards"] if b else 0,
                   ", ".join(acodes), "; ".join(acts[x]["a"]["title"] for x in acodes), reason,
                   str(SCEN / f"{m['course']}.md") if b else ""])
    wa = wb.create_sheet("Акты")
    wa.append(["Код", "Название", "Реквизит", "Ссылка", "Карточек", "Вопросов", "Модули"])
    for k, s in sorted(acts.items()):
        a = s["a"]
        wa.append([k, a["title"], act_label(a), a.get("url", ""), s["cards"], s["qs"], ", ".join(sorted(s["mods"]))])
    for w in (ws, wa):
        w.freeze_panes = "A2"; w.auto_filter.ref = w.dimensions
    # сверка
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    assert len(rows) == len(st["modules"]), "число модулей не сходится со structure.json"
    assert sum(r[6] for r in rows) == total_q, f"вопросов в листе {sum(r[6] for r in rows)} != в content {total_q}"
    assert sum(r[7] for r in rows) == total_c
    assert sum(s["qs"] for s in acts.values()) == total_q
    wb.save(out)
    cnt = collections.Counter(r[4] for r in rows)
    print(f"модулей {len(rows)} {dict(cnt)}; актов {len(acts)}; вопросов {total_q}; карточек {total_c}\n{out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REG / "Реестр_модулей_и_актов.xlsx"))
    build(ap.parse_args().out)
