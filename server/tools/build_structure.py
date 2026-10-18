"""Строит server/structure.json из xlsx fit-gap (листы «Курсы (раскладка)», «Курсы (итог)», «Темы (189)»).
Запуск: python3 server/tools/build_structure.py [xlsx] [out.json]  (нужен openpyxl, в venv lms его нет)."""
import json, os, re, sys
import openpyxl

XLSX = ("/Users/yerzhanserikbayev/Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/"
        "00 Проекты/Medical LMS/03_Артефакты/Fit-gap_перечень_направлений_vs_портал_2026-10-18.xlsx")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "structure.json")

def rows(wb, name):
    return [r for r in list(wb[name].iter_rows(values_only=True))[1:] if r[0] is not None]

def build(xlsx):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    audience = {(r[0], r[2]): r[3] for r in rows(wb, "Темы (189)")}
    directions, courses, modules = {}, {}, []
    for code, num, dtitle, ctitle, mnum, mtitle, mtype, *_ in rows(wb, "Курсы (раскладка)"):
        directions.setdefault(num, {"code": f"d{num:02d}", "num": num, "title": dtitle})
        if code not in courses:
            courses[code] = {"code": code, "direction": f"d{num:02d}", "title": ctitle,
                             "step": int(code.split(".")[1])}
        m = {"code": f"{code}.{mnum}", "course": code, "title": mtitle, "sort": mnum * 10,
             "audience": audience[(num, mtitle)]}
        mm = re.fullmatch(r"ссылка на модуль направления (\d+)", mtype)
        if mm:
            m["_link_dir"] = int(mm.group(1))
        modules.append(m)
    by_title = {}
    for m in modules:
        if "_link_dir" not in m:
            by_title.setdefault((courses[m["course"]]["direction"], m["title"]), []).append(m["code"])
    for m in modules:
        if "_link_dir" in m:
            orig = by_title[(f"d{m.pop('_link_dir'):02d}", m["title"])]
            assert len(orig) == 1, (m["code"], orig)
            m["link_module"] = orig[0]
    # сверка с листом «Курсы (итог)»
    for r in rows(wb, "Курсы (итог)"):
        if r[0] == "Итого курсов":
            assert (len(modules), sum("link_module" in m for m in modules)) == (r[4], r[5])
        else:
            mods = [m for m in modules if m["course"] == r[0]]
            assert (len(mods), sum("link_module" in m for m in mods)) == (r[4], r[5]), r[0]
    assert (len(directions), len(courses), len(modules)) == (19, 53, 189)
    return {"source": os.path.basename(xlsx), "directions": list(directions.values()),
            "courses": list(courses.values()), "modules": modules}

if __name__ == "__main__":
    d = build(sys.argv[1] if len(sys.argv) > 1 else XLSX)
    out = sys.argv[2] if len(sys.argv) > 2 else OUT
    with open(out, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(len(d["directions"]), len(d["courses"]), len(d["modules"]),
          sum("link_module" in m for m in d["modules"]))
