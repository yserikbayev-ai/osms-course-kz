CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  bin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Роли редактируются администратором без изменения кода (раздел 15 ТЗ)
CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT TRUE,   -- медицинская/административная должность
  can_manage_org BOOLEAN NOT NULL DEFAULT FALSE,
  sort INT NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id BIGINT REFERENCES roles(id),
  department TEXT,
  experience_years INT,
  qualification TEXT,
  is_org_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

CREATE TABLE IF NOT EXISTS acts (
  code TEXT PRIMARY KEY,
  doc_id TEXT, num TEXT, act_date TEXT, reg TEXT, title TEXT, url TEXT
);

CREATE TABLE IF NOT EXISTS directions (
  code TEXT PRIMARY KEY, title TEXT NOT NULL, descr TEXT, icon TEXT, sort INT DEFAULT 100
);

CREATE TABLE IF NOT EXISTS courses (
  code TEXT PRIMARY KEY,
  direction_code TEXT NOT NULL REFERENCES directions(code) ON DELETE CASCADE,
  title TEXT NOT NULL, intro TEXT, step INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lessons (
  code TEXT PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  title TEXT NOT NULL, intro TEXT, level INT NOT NULL DEFAULT 1,
  video_url TEXT, sort INT DEFAULT 100
);

CREATE TABLE IF NOT EXISTS cards (
  id BIGSERIAL PRIMARY KEY,
  lesson_code TEXT NOT NULL REFERENCES lessons(code) ON DELETE CASCADE,
  act_code TEXT REFERENCES acts(code), point TEXT,
  norm TEXT NOT NULL, plain TEXT, sort INT DEFAULT 100
);

CREATE TABLE IF NOT EXISTS questions (
  code TEXT PRIMARY KEY,
  lesson_code TEXT NOT NULL REFERENCES lessons(code) ON DELETE CASCADE,
  level INT NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  options JSONB NOT NULL,
  correct INT NOT NULL,
  explain TEXT,
  act_code TEXT REFERENCES acts(code), point TEXT,
  frozen BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_q_lesson ON questions(lesson_code);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_code TEXT NOT NULL REFERENCES lessons(code) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_code)
);

CREATE TABLE IF NOT EXISTS attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ticket JSONB NOT NULL,          -- список кодов вопросов билета
  total INT, correct_cnt INT, pct INT, passed BOOLEAN, by_time BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_att_user ON attempts(user_id, course_code);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_code TEXT NOT NULL REFERENCES questions(code) ON DELETE CASCADE,
  chosen INT, is_right BOOLEAN,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_code)
);

-- Корректирующие действия: повторение только проваленных тем
CREATE TABLE IF NOT EXISTS corrective_actions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  lesson_code TEXT NOT NULL REFERENCES lessons(code) ON DELETE CASCADE,
  errors INT NOT NULL DEFAULT 0,
  done BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_ca_user ON corrective_actions(user_id, course_code);

CREATE TABLE IF NOT EXISTS certificates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  pct INT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  question_code TEXT NOT NULL REFERENCES questions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
