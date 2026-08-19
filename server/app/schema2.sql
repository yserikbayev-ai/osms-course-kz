-- ЭТАП 2. Траектории обучения, назначения, избранное
-- Роль → курс: тип обучения, периодичность, срок выполнения (раздел 2 и 15 ТЗ)
CREATE TABLE IF NOT EXISTS role_courses (
  id BIGSERIAL PRIMARY KEY,
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'recommended',   -- mandatory | recommended | optional | periodic
  period_months INT,                          -- для periodic: через сколько повторять
  due_days INT DEFAULT 30,                    -- срок выполнения с момента назначения
  UNIQUE (role_code, course_code)
);

-- Персональные назначения (авто по роли + ручные от руководителя)
CREATE TABLE IF NOT EXISTS assignments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'mandatory',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date DATE,
  period_months INT,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'role',        -- role | manual
  UNIQUE (user_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_assign_user ON assignments(user_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- course | lesson | material
  ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref)
);

-- ЭТАП 3. Модули, материалы, настройки тестов, шкала оценок
CREATE TABLE IF NOT EXISTS modules (
  code TEXT PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  title TEXT NOT NULL, intro TEXT, sort INT DEFAULT 100
);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS module_code TEXT REFERENCES modules(code) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS duration_min INT DEFAULT 15;

CREATE TABLE IF NOT EXISTS materials (
  id BIGSERIAL PRIMARY KEY,
  lesson_code TEXT NOT NULL REFERENCES lessons(code) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- video | audio | file | link | text
  title TEXT NOT NULL,
  url TEXT,
  body TEXT,
  mime TEXT,
  required BOOLEAN NOT NULL DEFAULT FALSE,     -- обязательность просмотра
  sort INT DEFAULT 100
);
CREATE TABLE IF NOT EXISTS material_progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, material_id)
);

-- Настройки тестирования курса, редактируются администратором (раздел 8 ТЗ)
CREATE TABLE IF NOT EXISTS exam_settings (
  course_code TEXT PRIMARY KEY REFERENCES courses(code) ON DELETE CASCADE,
  q_count INT NOT NULL DEFAULT 20,
  time_min INT NOT NULL DEFAULT 30,
  pass_pct INT NOT NULL DEFAULT 80,
  max_attempts INT NOT NULL DEFAULT 3,
  shuffle_q BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle_o BOOLEAN NOT NULL DEFAULT TRUE,
  cert_months INT NOT NULL DEFAULT 12
);

-- Шкала оценок, редактируемая (раздел 8 ТЗ)
CREATE TABLE IF NOT EXISTS grading_scale (
  id BIGSERIAL PRIMARY KEY,
  min_pct INT NOT NULL,
  title TEXT NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT TRUE
);

-- ЭТАП 4. Уведомления
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- assigned | due_soon | overdue | result | certificate | cert_expiring | repeat
  title TEXT NOT NULL,
  body TEXT,
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

-- ЭТАП 5. Тарифы и подписки
CREATE TABLE IF NOT EXISTS tariffs (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  max_users INT,               -- NULL = без ограничения
  price_month INT NOT NULL DEFAULT 0,
  descr TEXT,
  sort INT DEFAULT 100
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tariff_code TEXT NOT NULL REFERENCES tariffs(code),
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  extra_licenses INT NOT NULL DEFAULT 0,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active',       -- active | suspended | expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_org ON subscriptions(org_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number TEXT UNIQUE NOT NULL,
  amount INT NOT NULL,
  period_months INT NOT NULL DEFAULT 1,
  tariff_code TEXT REFERENCES tariffs(code),
  status TEXT NOT NULL DEFAULT 'issued',       -- issued | paid | cancelled
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
