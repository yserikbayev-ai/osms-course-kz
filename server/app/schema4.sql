-- ЭТАП 7. Структура 19 направлений / 53 курса / 189 модулей: статусы, ссылки модулей, слоты видео.
-- Идемпотентна: применяется при каждом старте и в тестах.
-- Существующие курсы и модули остаются опубликованными (значение по умолчанию).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'опубликован'
  CHECK (status IN ('планируется','опубликован','архив'));
ALTER TABLE modules ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'опубликован'
  CHECK (status IN ('планируется','опубликован','ссылка'));
-- у модуля со ссылкой — код модуля-оригинала; своих уроков такой модуль не имеет
ALTER TABLE modules ADD COLUMN IF NOT EXISTS link_module TEXT REFERENCES modules(code) ON DELETE SET NULL;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE directions ADD COLUMN IF NOT EXISTS num INT;

-- Слот видео у каждого урока: url пуст — показывается заглушка
CREATE TABLE IF NOT EXISTS video_slots (
  lesson_code TEXT PRIMARY KEY REFERENCES lessons(code) ON DELETE CASCADE,
  url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO video_slots(lesson_code) SELECT code FROM lessons ON CONFLICT DO NOTHING;

-- point бывает «47-1», «11 (часть первая)»: на уже существующей БД приводим INT к TEXT
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='cards' AND column_name='point') = 'integer' THEN
    ALTER TABLE cards ALTER COLUMN point TYPE TEXT USING point::text;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='questions' AND column_name='point') = 'integer' THEN
    ALTER TABLE questions ALTER COLUMN point TYPE TEXT USING point::text;
  END IF;
END $$;
