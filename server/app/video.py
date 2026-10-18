"""Видео-слоты: ссылки только YouTube (youtube-nocookie), файлов на сервере нет.
CLI: python -m app.video export <out.csv> | import <in.csv>"""
import csv, re, sys
from urllib.parse import urlparse, parse_qs
from . import db

_ID = re.compile(r"[A-Za-z0-9_-]{11}")
_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"}

def embed_url(raw):
    """Любая форма ссылки YouTube -> https://www.youtube-nocookie.com/embed/<id>; иное -> ValueError."""
    u = urlparse((raw or "").strip())
    host = (u.hostname or "").lower()
    parts = [p for p in u.path.split("/") if p]
    vid = None
    if u.scheme in ("http", "https"):
        if host in ("youtu.be", "www.youtu.be") and len(parts) == 1:
            vid = parts[0]
        elif host in _HOSTS:
            if u.path == "/watch":
                vid = (parse_qs(u.query).get("v") or [None])[0]
            elif len(parts) == 2 and parts[0] in ("shorts", "embed"):
                vid = parts[1]
    if not vid or not _ID.fullmatch(vid):
        raise ValueError("ожидается ссылка YouTube (watch, shorts, embed или youtu.be)")
    return f"https://www.youtube-nocookie.com/embed/{vid}"

def video_export(path):
    """CSV «код урока; тема; длительность; нормы» для сценариев. Длительность — ориентир:
    минута на карточку нормы, не меньше двух (реальной длительности в данных нет)."""
    rows = db.q("""SELECT l.code,l.title,
                   coalesce(array_agg(c.act_code||' '||coalesce(c.point::text,'') ORDER BY c.sort)
                            FILTER (WHERE c.id IS NOT NULL), '{}') AS norms
                   FROM lessons l
                   LEFT JOIN cards c ON c.lesson_code=l.code
                   GROUP BY l.code,l.title,l.course_code,l.sort ORDER BY l.course_code,l.sort""")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["код урока", "тема", "длительность, ориентир, мин", "нормы"])
        for r in rows:
            w.writerow([r["code"], r["title"], max(2, len(r["norms"])), "; ".join(n.strip() for n in r["norms"])])
    return len(rows)

def video_import(path):
    """CSV «код урока; ссылка». -> {inserted, skipped, errors:[(строка, причина)]}.
    skipped — та же ссылка уже стоит; повторный запуск ничего не меняет."""
    ins, skip, errs = 0, 0, []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for n, row in enumerate(csv.reader(f, delimiter=";"), 1):
            if n == 1 and row and row[0].strip().lower() == "код урока":
                continue
            if not any(x.strip() for x in row):
                continue
            if len(row) < 2:
                errs.append((n, "нужны два столбца: код урока; ссылка")); continue
            code, raw = row[0].strip(), row[1].strip()
            try:
                url = embed_url(raw)
            except ValueError as e:
                errs.append((n, str(e))); continue
            if not db.q("SELECT 1 FROM lessons WHERE code=%s", (code,), one=True):
                errs.append((n, f"урока {code} нет")); continue
            cur = db.q("SELECT url FROM video_slots WHERE lesson_code=%s", (code,), one=True)
            if cur and cur["url"] == url:
                skip += 1; continue
            db.ex("""INSERT INTO video_slots(lesson_code,url) VALUES(%s,%s) ON CONFLICT (lesson_code)
                     DO UPDATE SET url=EXCLUDED.url, updated_at=now()""", (code, url))
            ins += 1
    return {"inserted": ins, "skipped": skip, "errors": errs}

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("export", "import"):
        sys.exit("python -m app.video export|import <файл.csv>")
    if sys.argv[1] == "export":
        print("выгружено уроков:", video_export(sys.argv[2]))
    else:
        r = video_import(sys.argv[2])
        print(f"вставлено {r['inserted']} / пропущено {r['skipped']} / ошибок {len(r['errors'])}")
        for n, why in r["errors"]:
            print(f"  строка {n}: {why}")
        sys.exit(1 if r["errors"] else 0)
