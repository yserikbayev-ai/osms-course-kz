import csv, pathlib, pytest
from app import video, structure

PATH = str(pathlib.Path(__file__).resolve().parent.parent / "structure.json")
STATIC = pathlib.Path(__file__).resolve().parent.parent / "static"

@pytest.mark.parametrize("raw", [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ&t=5",
    "https://youtu.be/dQw4w9WgXcQ?si=x", "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"])
def test_embed_url_same_address(raw):
    assert video.embed_url(raw) == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"

@pytest.mark.parametrize("raw", ["", None, "dQw4w9WgXcQ", "https://vimeo.com/123456789",
    "https://evil.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/", "javascript:alert(1)", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"])
def test_embed_url_rejects(raw):
    with pytest.raises(ValueError):
        video.embed_url(raw)

def test_import_idempotent_and_bad_rows_do_not_block(db, tmp_path):
    structure.load_structure(PATH); structure.absorb_direction2()
    f = tmp_path / "v.csv"
    f.write_text("код урока;ссылка\nV1;https://youtu.be/dQw4w9WgXcQ\nV2;https://vimeo.com/1\nZZZ;https://youtu.be/dQw4w9WgXcQ\n"
                 "P1;https://www.youtube.com/watch?v=abcdefghijk\n", encoding="utf-8")
    r = video.video_import(str(f))
    assert (r["inserted"], r["skipped"]) == (2, 0)
    assert [n for n, _ in r["errors"]] == [3, 4]
    r2 = video.video_import(str(f))
    assert (r2["inserted"], r2["skipped"], len(r2["errors"])) == (0, 2, 2)
    assert db.q("SELECT url FROM video_slots WHERE lesson_code='V1'", one=True)["url"].endswith("/embed/dQw4w9WgXcQ")
    assert db.q("SELECT url FROM video_slots WHERE lesson_code='V2'", one=True)["url"] is None

def test_export_columns_and_one_placeholder_no_video_files(db, tmp_path):
    out = tmp_path / "e.csv"
    n = video.video_export(str(out))
    rows = list(csv.reader(open(out, encoding="utf-8-sig"), delimiter=";"))
    assert rows[0] == ["код урока", "тема", "длительность, ориентир, мин", "нормы"] and len(rows) == n + 1
    assert any(r[0] == "V1" and r[3] for r in rows[1:]), rows[:4]
    names = sorted(p.name for p in STATIC.rglob("*") if p.is_file())
    assert [x for x in names if x.endswith(".svg")] == ["video-placeholder.svg"]
    assert not [x for x in names if x.rsplit(".", 1)[-1] in ("mp4", "webm", "mov", "mkv", "avi")]

def test_content_api_video_embed_and_placeholder(db, tmp_path):
    from fastapi.testclient import TestClient
    from app import auth
    from app.main import app
    structure.load_structure(PATH); structure.absorb_direction2()
    org = db.q("INSERT INTO organizations(name) VALUES('К') RETURNING id", one=True)["id"]
    uid = db.q("INSERT INTO users(org_id,full_name,email,password_hash) VALUES(%s,'A','a@t.kz','x') RETURNING id", (org,), one=True)["id"]
    f = tmp_path / "v.csv"; f.write_text("V1;https://youtu.be/dQw4w9WgXcQ\n", encoding="utf-8")
    video.video_import(str(f))
    c = TestClient(app, base_url="https://testserver"); c.cookies.set(auth.COOKIE, auth.new_session(uid))
    d = c.get("/api/content").json()
    les = {l["code"]: l for l in d["lessons"]}
    assert les["V1"]["video"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    assert les["V2"]["video"] is None
    assert d["video_placeholder"] == "/static/video-placeholder.svg"
