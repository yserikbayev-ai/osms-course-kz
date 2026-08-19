import os, psycopg
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

DSN = os.environ["LMS_DB_DSN"]
pool = ConnectionPool(DSN, min_size=1, max_size=8, kwargs={"row_factory": dict_row})

def q(sql, params=None, one=False):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params or ())
        if cur.description is None:
            return None
        rows = cur.fetchall()
        return (rows[0] if rows else None) if one else rows

def ex(sql, params=None):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params or ())

def init_schema():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "schema.sql"), encoding="utf-8") as f:
        sql = f.read()
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql)
