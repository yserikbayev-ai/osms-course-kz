window.STATE =
{
  "slug": "medical-lms-structure-direction",
  "dir": "2026-10-18-medical-lms-structure-direction",
  "title": "Medical LMS: структура 19 направлений и одно направление под ключ",
  "mode": "semi",
  "depth": "normal",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-10-18-brief.md",
  "memoryFile": "CLAUDE.md",
  "skillDir": "/Users/yerzhanserikbayev/.claude-context/skills/autopilot",
  "startedAt": "2026-10-18T18:29:52+05:00",
  "updatedAt": "2026-10-18T18:52:32+05:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-10-18T18:29:52+05:00",
      "finishedAt": "2026-10-18T18:30:11+05:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-10-18T18:30:11+05:00",
      "finishedAt": "2026-10-18T18:50:00+05:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "note": "вопросов не потребовалось"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-10-18T18:50:00+05:00",
      "finishedAt": "2026-10-18T19:20:00+05:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-10-18T19:20:00+05:00",
      "note": "7 тасков, ярус T2, 3 волны",
      "finishedAt": "2026-10-18T18:37:29+05:00"
    },
    {
      "id": "build",
      "status": "active",
      "startedAt": "2026-10-18T18:37:29+05:00",
      "note": "волна 2 из 3: таски 03, 04, 05 (06 следом)"
    },
    {
      "id": "review",
      "status": "done",
      "finishedAt": "2026-10-18T19:07:36+05:00"
    },
    {
      "id": "final",
      "status": "done",
      "finishedAt": "2026-10-18T19:07:36+05:00"
    }
  ],
  "requirements": {
    "total": 15,
    "done": 0,
    "inTicket": 11,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Данные: статусы, структура 19/53/189, поглощение направления 2",
      "requirements": [
        "R02",
        "R13i",
        "R15i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "server/app/schema4.sql",
        "server/app/structure.py",
        "server/structure.json",
        "server/tests/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 2,
      "handoffs": 0,
      "startedAt": "2026-10-18T18:37:29+05:00",
      "finishedAt": "2026-10-18T18:44:09+05:00",
      "commit": "275507d",
      "tests": "9 passed, было 0"
    },
    {
      "id": "02",
      "title": "Первоисточники направления 2 и проверка содержания",
      "requirements": [
        "R03",
        "R06"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "server/tools/check_content.py",
        "server/sources/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-10-18T18:37:29+05:00",
      "finishedAt": "2026-10-18T18:40:52+05:00",
      "commit": "468f7fc",
      "tests": "15 passed, было 0"
    },
    {
      "id": "03",
      "title": "Каталог со статусами, видео-слоты и ссылки",
      "requirements": [
        "R08",
        "R10",
        "R11",
        "R13i"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "server/app/main.py",
        "server/app/api2.py",
        "server/app/logic.py",
        "server/app/video.py"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-10-18T18:44:09+05:00",
      "finishedAt": "2026-10-18T18:50:23+05:00",
      "commit": "540b79a",
      "tests": "49 passed, было 24"
    },
    {
      "id": "04",
      "title": "Содержание курса K02.1",
      "requirements": [
        "R04",
        "R05",
        "R06",
        "R09"
      ],
      "blockedBy": [
        "01",
        "02"
      ],
      "wave": 2,
      "zone": [
        "server/content/content-k021.json"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-10-18T18:44:09+05:00",
      "finishedAt": "2026-10-18T18:52:12+05:00",
      "commit": "7ceebb8",
      "tests": "check_content OK; всего 50 passed"
    },
    {
      "id": "05",
      "title": "Содержание курса K02.2",
      "requirements": [
        "R04",
        "R05",
        "R06",
        "R09"
      ],
      "blockedBy": [
        "01",
        "02"
      ],
      "wave": 2,
      "zone": [
        "server/content/content-k022.json"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 2,
      "handoffs": 0,
      "startedAt": "2026-10-18T18:44:09+05:00",
      "finishedAt": "2026-10-18T18:52:32+05:00",
      "commit": "51c26ed",
      "tests": "check_content OK"
    },
    {
      "id": "06",
      "title": "Содержание курса K02.3",
      "requirements": [
        "R04",
        "R05",
        "R06",
        "R09"
      ],
      "blockedBy": [
        "01",
        "02"
      ],
      "wave": 2,
      "zone": [
        "server/content/content-k023.json"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 2,
      "handoffs": 0,
      "startedAt": "2026-10-18T18:50:23+05:00",
      "finishedAt": "2026-10-18T19:00:20+05:00",
      "commit": "8da6d59",
      "tests": "check_content OK, 50 passed"
    },
    {
      "id": "07",
      "title": "Интерфейс, сквозная проверка, скриншоты",
      "requirements": [
        "R02",
        "R09",
        "R11",
        "R13i"
      ],
      "blockedBy": [
        "03",
        "04",
        "05",
        "06"
      ],
      "wave": 3,
      "zone": [
        "server/static/",
        "server/tests/e2e/"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-10-18T19:00:20+05:00",
      "finishedAt": "2026-10-18T19:04:33+05:00",
      "commit": "5da5f3a",
      "tests": "51 passed"
    }
  ],
  "singlePass": null,
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 2,
    "fixed": 2,
    "deferred": 0
  },
  "concerns": [
    {
      "ticket": "02",
      "file": "server/tools/check_content.py",
      "note": "проверка структурная: «нелепые варианты» и «ровно один верный по смыслу» машиной не ловятся, нужна слепая приёмка"
    },
    {
      "ticket": "01",
      "file": "server/app/structure.py",
      "note": "structure.py: настройки экзамена дублируют seed2.seed_exam_settings (Reinvention)"
    },
    {
      "ticket": "01",
      "file": "server/app/structure.py",
      "note": "structure.py: absorb_direction2 — два одинаковых цикла для assignments и role_courses; три места вставки video_slots"
    },
    {
      "ticket": "01",
      "file": "server/app/structure.py",
      "note": "tests: нет теста на отказ absorb до load_structure; build_structure.py сам нигде не запускается в тестах"
    },
    {
      "ticket": "03-05",
      "note": "тесты: фиксированный порт временной БД 54399 мешает параллельным прогонам — брать свободный порт"
    },
    {
      "ticket": "03-05",
      "note": "предикат статуса 'опубликован' размазан по logic, main, api2"
    },
    {
      "ticket": "03-05",
      "note": "после load_content нужно пересчитать exam_settings (у K02.2 q_count=5, 10 мин, так как строка создаётся до загрузки вопросов)"
    },
    {
      "ticket": "03-05",
      "note": "старые вопросы p101..p111, d101..d104 и др. остаются в базе рядом с новыми и не проверены check_content"
    },
    {
      "ticket": "03-05",
      "note": "STRUCT_MATRIX: сопоставления K03.2, K18.3, d04 сомнительны, 9 ролей без назначений — сверка владельцем"
    },
    {
      "ticket": "01",
      "note": "seed2.seed_exam_settings содержит вторую копию формулы настроек экзамена — заменить вызовом structure._exam_settings"
    },
    {
      "ticket": "05",
      "note": "в базе НПА в A17 п.11 слово «осложнённым» испорчено при конвертации (осложнҰнным) — поправить файл источника"
    }
  ],
  "reviewers": {
    "manifestSpec": "adde19e6d7b83536f",
    "craft": "a02234d7bc05d4e6e"
  },
  "blind": null
}
