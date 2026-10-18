"""Сквозная проверка на временной БД: регистрация -> роль -> урок направления 2 -> карточки ->
тренировка -> экзамен до сертификата -> видео-слот -> импорт ссылок. Только публичный API."""
import pathlib, pytest
from fastapi.testclient import TestClient
from app import structure, seed2, video

SERVER = pathlib.Path(__file__).resolve().parents[2]

@pytest.fixture
def client(db):
    structure.load_structure(str(SERVER / "structure.json")); structure.absorb_direction2()
    for n in ("k021", "k022", "k023"):
        structure.load_content(str(SERVER / "content" / f"content-{n}.json"))
    seed2.seed_structure_matrix()
    from app.main import app
    return TestClient(app, base_url="https://testserver")

def test_full_flow(client, db, tmp_path):
    r = client.post("/api/register", json={"full_name": "Педиатр", "email": "p@t.kz", "password": "secret1",
                                           "org_name": "Клиника", "role_code": "pediatrician"})
    assert r.status_code == 200 and r.json()["assigned"] > 0
    # назначение по роли: K02.3 обязательный
    prog = client.get("/api/progress").json()
    assert any(a["course_code"] == "K02.3" and a["kind"] == "mandatory" for a in prog["assignments"])
    # каталог: 19 / 53 / 189 в структуре, планируемое не открывается
    d = client.get("/api/content").json()
    assert len(d["directions"]) == 19
    assert db.q("SELECT count(*) n FROM courses WHERE status<>'архив' AND code ~ '^K[0-9]+\\.[0-9]+$'", one=True)["n"] == 53
    assert db.q("SELECT count(*) n FROM modules WHERE code ~ '^K[0-9]+\\.[0-9]+\\.[0-9]+$'", one=True)["n"] == 189
    assert client.post("/api/exam/start", json={"course": "K09.1"}).status_code == 409
    # урок направления 2: карточки, слот видео пуст
    les = {l["code"]: l for l in d["lessons"]}["V1"]
    assert les["cards"] and les["video"] is None and d["video_placeholder"] == "/static/video-placeholder.svg"
    assert client.post("/api/lesson/V1/read").status_code == 200
    # правильный ответ не уходит в браузер до ответа
    dr = client.post("/api/drill/start", json={"course": "K02.3", "count": 3}).json()["questions"]
    assert dr and all("correct" not in q and "explain" not in q for q in dr)
    q = dr[0]; right = db.q("SELECT correct FROM questions WHERE code=%s", (q["code"],), one=True)["correct"]
    assert client.post("/api/drill/check", json={"question": q["code"], "chosen": right}).json()["right"]
    # видео-слот: импорт ссылок
    f = tmp_path / "v.csv"; f.write_text("код урока;ссылка\nV1;https://youtu.be/dQw4w9WgXcQ\n", encoding="utf-8")
    assert video.video_import(str(f))["inserted"] == 1
    les = {l["code"]: l for l in client.get("/api/content").json()["lessons"]}["V1"]
    assert les["video"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    # экзамен курса до сертификата
    ex = client.post("/api/exam/start", json={"course": "K02.3"}).json()
    assert all("correct" not in x and "explain" not in x for x in ex["questions"])
    for x in ex["questions"]:
        right = db.q("SELECT correct FROM questions WHERE code=%s", (x["code"],), one=True)["correct"]
        assert client.post("/api/exam/answer", json={"attempt": ex["attempt"], "question": x["code"], "chosen": right}).json()["right"]
    fin = client.post("/api/exam/finish", json={"attempt": ex["attempt"]}).json()
    assert fin["passed"] and fin["certificate"]
    assert client.get("/api/progress").json()["certificates"][0]["course_code"] == "K02.3"
