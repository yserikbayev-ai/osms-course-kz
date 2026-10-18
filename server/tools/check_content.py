"""Проверка содержания: check_content.py <content.json> [--acts acts.json] [--root папка-проекта-на-Drive].
Выход не ноль, если есть ошибки. Формат файла — как server/content.json (acts, lessons[cards], questions)."""
import argparse, json, re, sys
from pathlib import Path

DEFAULT_ACTS = Path(__file__).parent.parent / "sources" / "acts.json"
DEFAULT_ROOT = Path.home() / "Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical LMS"
LONG_RATIO = 1.5  # правило проекта: верный вариант не длиннее 1,5 от самого длинного из остальных


def norm(s):
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", str(s))  # md-ссылки -> текст
    s = re.sub(r"<br\s*/?>|[*_|]", " ", s)
    s = re.sub(r"[«»“”„‟\"'‘’]", '"', s)
    s = re.sub(r"[‐‑‒–—−]", "-", s)
    return re.sub(r"\s+", " ", s.replace("ё", "е").replace("Ё", "Е")).strip().lower()


def check_content(path, acts_path=None, root=None):
    data = json.load(open(path, encoding="utf-8"))
    sources = json.load(open(acts_path or DEFAULT_ACTS, encoding="utf-8"))
    root = Path(root or DEFAULT_ROOT)
    acts = {**data.get("acts", {}), **{k: {**data.get("acts", {}).get(k, {}), **v} for k, v in sources.items()}}
    texts, errs = {}, []

    def act_text(a):
        if a not in texts:
            f = acts.get(a, {}).get("text")
            texts[a] = norm((root / f).read_text(encoding="utf-8")) if f and (root / f).is_file() else None
        return texts[a]

    def need_act_point(who, o, word):
        a, p = o.get("a"), o.get("p")
        if not a or a not in acts:
            errs.append(f"{who}: {word} без акта")
        if p in (None, ""):
            errs.append(f"{who}: {word} без пункта акта")

    for les in data.get("lessons", []):
        for i, c in enumerate(les.get("cards", []), 1):
            who = f"урок {les['id']}, карточка {i}"
            need_act_point(who, c, "карточка")
            if c.get("a") in acts:
                t = act_text(c["a"])
                if t is None:
                    errs.append(f"{who}: нет текста акта {c['a']} для сверки цитаты")
                elif not c.get("norm") or norm(c["norm"]) not in t:
                    errs.append(f"{who}: цитата не найдена дословно в тексте акта {c['a']}")
        got = {q.get("g") for q in data.get("questions", []) if q.get("l") == les["id"]}
        for g in (1, 2, 3):
            if g not in got:
                errs.append(f"урок {les['id']}: нет вопроса уровня {g}")

    for q in data.get("questions", []):
        who = f"вопрос {q.get('id')}"
        need_act_point(who, q, "вопрос")
        o, c = q.get("o") or [], q.get("c")
        if len(o) != 4:
            errs.append(f"{who}: нужно 4 варианта, их {len(o)}")
        if not isinstance(c, int) or isinstance(c, bool) or not 0 <= c < len(o):
            errs.append(f"{who}: верный вариант должен быть ровно один (индекс), сейчас {c!r}")
            c = None
        if len({norm(x) for x in o}) != len(o):
            errs.append(f"{who}: повтор вариантов ответа")
        if c is not None and len(o) > 1:
            rest = max(len(str(x)) for i, x in enumerate(o) if i != c)
            if len(str(o[c])) > LONG_RATIO * rest:
                errs.append(f"{who}: верный ответ заметно длиннее остальных")
        if not str(q.get("e") or "").strip():
            errs.append(f"{who}: нет объяснения")
        if q.get("g") not in (1, 2, 3):
            errs.append(f"{who}: уровень должен быть 1, 2 или 3")
    return errs


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--acts")
    ap.add_argument("--root")
    a = ap.parse_args()
    e = check_content(a.file, a.acts, a.root)
    print("\n".join(e) if e else "OK")
    sys.exit(1 if e else 0)
