-- ЭТАП 6. Региональный контур: управление здравоохранения области
-- Над организацией появляется ещё один уровень — регион. Управление
-- здравоохранения видит сводку по всем клиникам области, но не входит в
-- данные пациентов и не управляет чужими подписками: только наблюдение.
CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Организация принадлежит региону; NULL — регион не задан, в сводку не попадает
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS region_code TEXT REFERENCES regions(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_org_region ON organizations(region_code);

-- Учётная запись управления здравоохранения: своя организация (сам орган
-- управления) плюс право смотреть сводку по региону
ALTER TABLE users ADD COLUMN IF NOT EXISTS region_code TEXT REFERENCES regions(code) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_region_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Регионы заводит администратор платформы вручную — список областей меняется
-- редко, отдельный интерфейс под это не нужен:
--   INSERT INTO regions(code,title) VALUES ('vko','Восточно-Казахстанская область');
--   UPDATE organizations SET region_code='vko' WHERE id IN (...);
--   UPDATE users SET region_code='vko', is_region_admin=TRUE WHERE email='...';
