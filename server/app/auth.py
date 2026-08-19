import os, secrets, datetime as dt
import bcrypt
from fastapi import Request, HTTPException
from . import db

SESSION_DAYS = 30
COOKIE = "lms_session"

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def check_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=SESSION_DAYS)
    db.ex("INSERT INTO sessions(token,user_id,expires_at) VALUES(%s,%s,%s)", (token, user_id, exp))
    return token

def drop_session(token: str):
    if token:
        db.ex("DELETE FROM sessions WHERE token=%s", (token,))

def current_user(request: Request, required: bool = True):
    token = request.cookies.get(COOKIE)
    if not token:
        if required: raise HTTPException(401, "Требуется вход")
        return None
    row = db.q("""SELECT u.*, r.code AS role_code, r.title AS role_title, r.can_manage_org,
                         o.name AS org_name
                  FROM sessions s
                  JOIN users u ON u.id = s.user_id
                  LEFT JOIN roles r ON r.id = u.role_id
                  JOIN organizations o ON o.id = u.org_id
                  WHERE s.token=%s AND s.expires_at > now()""", (token,), one=True)
    if not row:
        if required: raise HTTPException(401, "Сессия истекла")
        return None
    return row
