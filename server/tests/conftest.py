import json, os, pathlib, psycopg, pytest

import shutil, subprocess, tempfile

PGBIN = "/opt/homebrew/opt/postgresql@17/bin"
PORT = 54399
_tmp = None

def _start_cluster():
    """Временный кластер PostgreSQL (trust, порт 54399); гасится в pytest_unconfigure."""
    global _tmp
    _tmp = tempfile.mkdtemp(prefix="lms_pg_")
    subprocess.run([f"{PGBIN}/initdb", "-D", _tmp, "-A", "trust", "-U", "lms", "-E", "UTF8"],
                   check=True, capture_output=True)
    subprocess.run([f"{PGBIN}/pg_ctl", "-D", _tmp, "-o", f"-p {PORT} -k {_tmp} -c listen_addresses=localhost",
                    "-w", "-l", f"{_tmp}/log", "start"], check=True, capture_output=True)
    subprocess.run([f"{PGBIN}/createdb", "-h", "localhost", "-p", str(PORT), "-U", "lms", "lms_test"],
                   check=True, capture_output=True)
    return f"postgresql://lms@localhost:{PORT}/lms_test"

def pytest_unconfigure(config):
    try:
        from app import db as appdb
        appdb.pool.close()
    except Exception:
        pass
    if _tmp:
        subprocess.run([f"{PGBIN}/pg_ctl", "-D", _tmp, "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(_tmp, ignore_errors=True)

DSN = os.environ.get("LMS_DB_DSN") or _start_cluster()
if not DSN.rstrip("/").rsplit("/", 1)[-1].split("?")[0].endswith("_test"):
    pytest.exit("LMS_DB_DSN должен указывать на базу *_test (тесты стирают схему)", 2)
os.environ["LMS_DB_DSN"] = DSN

APP = pathlib.Path(__file__).resolve().parent.parent / "app"
SERVER = APP.parent

@pytest.fixture
def db():
    """Чистая тестовая БД: схемы 1-4, роли и контент прежних 10 курсов, справочники этапов 2-5."""
    from app import db as appdb, seed, seed2
    with psycopg.connect(DSN, autocommit=True) as c:
        c.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        for n in ("schema.sql", "schema2.sql", "schema3.sql", "schema4.sql"):
            c.execute((APP / n).read_text(encoding="utf-8"))
    seed.seed_roles()
    seed.seed_content(str(SERVER / "content.json"))
    seed2.seed_matrix(); seed2.seed_exam_settings(); seed2.seed_modules()
    return appdb

def apply_schema4():
    with psycopg.connect(DSN, autocommit=True) as c:
        c.execute((APP / "schema4.sql").read_text(encoding="utf-8"))
