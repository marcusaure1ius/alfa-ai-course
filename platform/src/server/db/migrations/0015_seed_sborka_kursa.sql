-- T-0108: production course restored from Google Docs «Сборка курса».
-- Source document: 1RGJTeHwZ7RqbdRxxYM8iRZwLXDyWKbUpssmZbKklsdw
-- Source revision: AIroW34mh9Nzw76HhX8B2oETxv-lQF7II6puQk-cqjzonEbqej0yfsgkklWg3U_ShvJ4-apT110H2NnYEdTFDthHxGqyS7bS3xOu0PopPxU
-- The migration is deliberately limited to one canonical course, one exact
-- synthetic fixture, and one explicitly named test student.

DO $$
DECLARE
  v_admin_id uuid;
  v_student_id uuid;
  v_course_id uuid;
  v_section_id uuid;
  v_existing_title text;
  v_sections integer;
  v_materials integer;
BEGIN
  SELECT id INTO v_admin_id
  FROM users
  WHERE role_id = 'admin' AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'T-0108 skipped: production seed requires an active admin';
    RETURN;
  END IF;

  SELECT id INTO v_student_id
  FROM users
  WHERE lower(email) = 'test-student@neurokurs.ru'
    AND role_id = 'student'
    AND status = 'active';

  IF v_student_id IS NULL THEN
    RAISE NOTICE 'T-0108 skipped: production seed requires active test-student@neurokurs.ru';
    RETURN;
  END IF;

  -- Remove only the known empty T-0058 production fixture. No other course
  -- qualifies for this guarded cleanup.
  DELETE FROM courses AS course
  WHERE course.slug = 'n8n-t0058'
    AND course.title = 'Практика n8n — T-0058'
    AND course.description = 'Синтетический курс для production full-story проверки T-0058.'
    AND NOT EXISTS (
      SELECT 1 FROM course_sections AS section
      WHERE section.course_id = course.id
    );

  SELECT id, title INTO v_course_id, v_existing_title
  FROM courses
  WHERE slug = 'sborka-kursa';

  IF v_course_id IS NOT NULL AND v_existing_title <> 'Сборка курса' THEN
    RAISE EXCEPTION 'T-0108 slug belongs to a different course';
  END IF;

  INSERT INTO courses (
    id, slug, title, description, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), 'sborka-kursa', 'Сборка курса',
    'Подготовка к интенсиву, выбор процесса, сборка первого агента, типичные ошибки и подведение итогов.', 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = 'published',
    version = courses.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(courses.published_at, now()),
    updated_at = now()
  RETURNING id INTO v_course_id;

  -- Free positional uniqueness before idempotent upserts.
  UPDATE course_sections
  SET position = position + 1000
  WHERE course_id = v_course_id;

  INSERT INTO course_sections (
    id, course_id, slug, title, position, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, 'modul-1-podgotovka-k-intensivu', 'Модуль 1. Подготовка к интенсиву', 0,
    'published', v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    status = 'published',
    version = course_sections.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_sections.published_at, now()),
    updated_at = now()
  RETURNING id INTO v_section_id;

  UPDATE course_materials
  SET position = position + 1000
  WHERE section_id = v_section_id;

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm1-urok-1-chto-takoe-ii-agenty-i-kakie-zadachi-oni-mogut-reshat',
    'article', 'Урок 1. Что такое ИИ-агенты и какие задачи они могут решать', 'В этом уроке вы узнаете, что такое ИИ-агенты, в чем их сильные стороны и ограничения, какие задачи можно и нельзя доверять агентам и какие функции в принципе могут выполнять простые агенты.',
    'В этом уроке вы узнаете, что такое ИИ-агенты, в чем их сильные стороны и ограничения, какие задачи можно и нельзя доверять агентам и какие функции в принципе могут выполнять простые агенты.

## Что такое ИИ-агент

ИИ-агент — это система на базе большой языковой модели (LLM, Large Language Model), которая самостоятельно выполняет задачи от имени пользователя.

Агент понимает инструкции, принимает решения и при необходимости использует инструменты (поиск, базы знаний, API), чтобы получить нужный контекст и выполнить задачу в заданных ограничениях.

Ключевые особенности ИИ-агента:

- Автономность. Агент сам решает, какое действие выполнить следующим, опираясь на текущий контекст.
- Использование инструментов. Агент не просто генерирует текст, а работает с внешними источниками: базами данных, файлами, поиском в интернете.
- Цикличность. Агент работает не в формате «вопрос — ответ», а итеративно: планирует действие, выполняет его, анализирует результат и корректирует следующий шаг.

[Картинка](https://drive.google.com/file/d/1n5XXQuvzjVLLN3jisz4Ntk61j3hgZJNX/view?usp=sharing)

Пример

Подготовка отчёта без агента выглядит так: вы заходите в несколько систем, выгружаете данные, сводите в таблицу, считаете показатели. Агент самостоятельно получает данных из этих систем, готовит отчёт, а вам остаётся проверить его.

## Какие задачи подходят для автоматизации

Не все задачи можно доверить ИИ-агентам. Есть задачи, где агент сэкономит ресурсы, а есть такие, где он сделает критичные ошибки, которые ещё потребуют времени для исправления. Вот критерии задач, которые можно доверить агентам.

### Задача повторяется регулярно

Если действие выполняется каждый день, неделю или месяц, это хороший кандидат на автоматизацию: настройка агента быстрее окупится. А редкие разовые задачи проще сделать вручную, чем тратить время на разработку и поддержку.

Пример

Ежедневная сверка данных из двух систем — автоматизировать. Разовая миграция базы данных — сделать руками.

### Есть чёткий алгоритм

Если задачу можно описать пошагово — сначала А, потом Б, а если условие выполнено, то В, — её обычно можно автоматизировать агентом.

Например, каждый день повторяются одни и те же шаги: открыть систему, применить фильтр, проверить статус, зафиксировать результат.

Если это можно описать как пошаговую инструкцию, агент обычно справляется. В том числе с шаблонными сообщениями и письмами. Если же результат зависит от интуиции, креативности и множества неформализуемых факторов, агент будет работать нестабильно.

Пример

Сравнить две таблицы и найти расхождения — да, это алгоритм. Сгенерировать гипотезы по заданной методике на основе загруженных данных — возможно.

Продумать стратегию выхода продукта на рынок — скорее нет. Здесь лучше использовать ИИ как помощника для обсуждения, а не как автономного агента.

### Задача отнимает много времени

Если задача регулярно занимает больше пары часов в неделю, автоматизация часто оправдана. Если это 10 минут в месяц, проще и дешевле сделать вручную.

Сравните выгоду и затраты: сколько времени уйдёт на настройку и поддержку агента и сколько времени он будет экономить. Автоматизация имеет смысл, когда эта математика сходится.

Пример

Каждую пятницу по 4 часа собирать данные для еженедельного отчёта — автоматизировать. Раз в квартал писать письмо в другой департамент — не автоматизировать.

### Данные доступны

Если данные уже находятся в удобных источниках — Excel, CSV, Jira, базах с API, Confluence, — агента можно подключить быстро.

Если информация хранится в закрытой старой системе без API и экспорта, потребуется помощь технических специалистов. А иногда подключить агента к таким данным невозможно.

### Задача техническая

Если задача не требует сложных решений, но требует большой внимательности и тщательного выполнения повторяющихся операций, её можно автоматизировать.

Пример

«Вот список операций, вот список документов — проверь, что на каждую операцию есть корректный документ». В этой задаче логика прозрачная, а результат измеримый: совпало или не совпало, и список расхождений.

Проверить опечатки, форматы, пропуски в таблицах — там, где человек может устать и пропустить мелочь, агент работает стабильно.

### Низкие риски при ошибке

Если ошибку легко заметить и она не приводит к серьёзным последствиям, задачу можно автоматизировать. Если же ошибка касается денег, клиентов или юридических обязательств, нужен контроль человека.

Вот какие признаки указывают на то, что задача не подходит для автоматизации.

[Картинка](https://drive.google.com/file/d/1o5NTXP3uGsekp5HqrUGRfgYp_16UBgAR/view?usp=sharing)

## Как агент понимает, что делать

Агент не знает сам, как правильно выполнить вашу задачу. На этапе разработки вы задаёте ему инструкции (промпт) и описываете каждый этап работы:

- Цель этапа.
- Контекст и обстоятельства.
- Форматы ответа.
- Рамки и ограничения.
- Типичные ошибки и как их отслеживать.

[Карусель картинок](https://drive.google.com/drive/folders/1cOoO4tTxw9GRA0gIlXdqzgN9JoB9r4MU?usp=drive_link)

## Резюме

ИИ-агент — это система, которая умеет выполнять задачи от имени пользователя.

Агент может:

- Сам решать, кому написать и что отправить, чтобы выполнить задачу.
- Работать сразу с несколькими системами.
- Запускаться автоматически по расписанию.
- Действовать по инструкциям, которые человек задал при его создании.

Для автоматизации с помощью ИИ-агента подходят задачи, которые:

- Отнимают у вас много времени.
- Имеют конкретные алгоритмы и стандарты.
- Выполняются по чёткому порядку действий.
- Имеют хорошо структурированные данные на входе.', 0, 5, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm1-urok-2-kogda-agenty-oshibayutsya-i-kak-etim-upravlyat',
    'article', 'Урок 2. Когда агенты ошибаются, и как этим управлять', 'ИИ-агенты работают на основе вероятностей и не отличают хороший результат от плохого, правильный от ошибочного — функция контроля всегда будет прерогативой человека. В этом уроке описали, в чем слабые места агентов, и…',
    'ИИ-агенты работают на основе вероятностей и не отличают хороший результат от плохого, правильный от ошибочного — функция контроля всегда будет прерогативой человека. В этом уроке описали, в чем слабые места агентов, и как заранее подстраховаться от их ошибок.

### Нейросеть может ошибаться в текстовой генерации

Агент использует нейросеть, а она генерирует текст, основываясь на паттернах из обучения. Поэтому иногда результат получается неточным: модель может неверно понять инструкцию, неудачно обобщить данные, перепутать формулировку или придумать несуществующие факты.

Ошибки могут быть связаны с несовершенством инструкций, иногда — с некачественными данными, а иногда ИИ просто галлюцинирует.

Пример

Вы просите агента кратко описать договор. Агент пишет: «Номер договора — 12345-А», хотя в документе номера договора нет вообще.

Это ошибка текстовой генерации. Чтобы снизить такой риск, нужен второй слой проверки — валидатор. Им может быть другой агент или человек.

### Агенту нужен чётко сформулированный запрос

ИИ-агент не догадывается о вашей задумке. Если запрос расплывчатый, результат тоже будет расплывчатым.

«Проанализируй данные» — слишком абстрактно. «Найди заявки, где сумма больше 1 млн рублей и статус “В обработке” не менялся дольше часа» — уже однозначно.

### Нужен контроль качества

Если агент выдал результат, это ещё не значит, что всё верно. На этапе разработки нужно тестировать разные сценарии, особенно пограничные. После запуска — периодически выборочно проверять результаты.

Не нужно вручную пересматривать все 15 найденных аномальных операций, но проверить 3–5 — разумный минимум. Так вы вовремя заметите, что агент начал ошибаться после обновления данных, шаблона или правил.

### Качество исходных данных влияет на результат

Классическое правило IT: мусор на входе — мусор на выходе (garbage in — garbage out).

Если дать агенту плохие, устаревшие, неполные или неверно оформленные данные, результат тоже будет плохим — даже при хорошей модели.

Пример

Во всех строках Excel-таблицы суммы записаны цифрами: «650 000». Но в одной строке сумма указана как текст: «500 000 рублей». Формальный слой может не распознать это как число и пропустить строку.

Поэтому данные, которые вы даёте агенту,  должны быть:

- Без явных ошибок.
- В правильном формате.
- Без пропусков в ключевых полях.

### Повторные запуски могут давать разные результаты

Большая языковая модель (LLM) работает вероятностно. Она может по-разному сформулировать один и тот же текст: выбрать другое слово, иначе расставить акценты, изменить порядок фраз.

Но формальные операции должны быть стабильными. Если агент извлекает номер счёта, дату платежа или сумму операции по заданным правилам, он должен выдавать один и тот же результат при каждом запуске.

Пример

В текстовом отчёте допустимо изменение формулировок, если данные остаются теми же, например:

- «Всего 15 операций на сумму 100 000 руб.».
- «Обнаружено 15 транзакций на общую сумму 100 000 руб.».

Смысл и суммы одинаковые, отличается только язык.

Но если при одном и том же источнике данных сегодня агент пишет «15 операций», а завтра — «14 операций», это уже не разная формулировка, а критичная ошибка. Причина может быть в галлюцинации, пропуске данных или неправильной обработке.

## Как настроить обработку ошибок

Продумывание сбоев — отдельный этап работы. Мы учим агента не быть сотрудником, а вовремя поднимать красный флаг и звать реального сотрудника, когда сам агент не справляется.

Например, агент пытается выполнить действие, но инструмент недоступен: API не отвечает, файл не найден, база данных «лежит». Что происходит дальше?

Чтобы система не ломалась, агенту заранее задают правила поведения в таких случаях. Эти правила описывают в инструкциях (системном промпте) и в логике сценария.

[Картинка](https://drive.google.com/file/d/1PvFax7Kej4Bb2YGHXdwP85D6CA5oLBUm/view?usp=sharing)

### Резюме

Корректная работа агента зависит от промпта и качества исходных данных. Но даже если правила описаны чётко, а данные — в едином формате и без ошибок, агент всё равно может галлюцинировать.

Избавиться от таких ошибок помогает добавление шага валидации в настройки ИИ-агента. На уровне промпта регулируются правила и ограничения, проверки и способы отработки ошибок.', 1, 4, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm1-urok-3-konstruktor-dlya-sozdaniya-ii-agentov',
    'article', 'Урок 3. Конструктор для создания ИИ-агентов', 'На интенсиве вы будете работать с конструктором для создания ИИ-агентов “n8n”. В этом уроке рассказали, как он устроен, и какие базовые функции имеет.',
    'На интенсиве вы будете работать с конструктором для создания ИИ-агентов “n8n”. В этом уроке рассказали, как он устроен, и какие базовые функции имеет.

## Стартовая страница

Workflows (рабочие процессы) — это и есть основная часть конструктора, с которой вам нужно будет работать. Здесь вы будете создавать процессы автоматизации, подключать сторонние сервисы и настраивать нейросети.

Credentials (учётные данные) — это способ обратиться к сторонним сервисам и забрать оттуда данные в n8n. В большинстве случаев это будут API‑ключи. В интерфейсе n8n вы создаете Credential, вводите туда ключ (например, от CRM или Яндекс GPT), а дальше просто выбираете этот Credential в ноде — и не вставляете ключ в каждое поле вручную.

Executions (запуски/выполнения) — это история того, как workflow реально работал: какие данные пришли, что обработалось, какие ошибки случились. Каждый запуск процесса создаёт Execution.

Variables (переменные) — это значения, которые могут меняться в процессе, и ИИ-агент должен каждый раз использовать нужные (разные) значения.

Например, вы обрабатываете сообщения пользователей, которые пишут в техподдержку. Прежде чем ответить пользователю, нужно проверить несколько параметров: зарегистрирован ли пользователь, и первый раз он обращается с данной проблемой, или повторно. Поэтому вы заводите несколько переменных (например, email для проверки логина, is_unique для проверки уникальности обращения) и в зависимости от их значений сообщение проходит по разным веткам алгоритма агента.

Data tables (таблицы данных / просмотр данных) — это интерфейс внутри Executions, где вы видите данные в табличном виде

Картинка-скриншот

## Workflows (рабочие процессы)

Сценарии ИИ-агентов в n8n выглядят как разветвленные цепочки действий. Цепочки состоят из элементов, каждый из которых выполняет свою конкретную операцию.

Элементы, из которых состоит ваш ИИ-агент в n8n называются ноды или узлы. В конструкторе есть 5 основных типов нод — они задают логику сценария.

Триггеры — запускают сценарий. Примеры: обновление Google‑таблицы, новое сообщение в Telegram, срабатывание по расписанию.

Действия — выполняют операции: отправка отчёта в Telegram, обновление записи в Notion и т. П.

Утилиты — помогают преобразовывать данные и управлять форматами. Пример: разделить поток на ветки «текст» и «голосовое сообщение», скачать файл, сделать транскрипцию.

Нода кода — для кастомных HTTP‑запросов (вебхуков) и запуска скриптов, если готового модуля нет.

Нода ИИ — ноды для работы с AI‑агентами: промты, выбор модели, память, инструменты.

Вы будете собирать ИИ-агента на занятиях из этих элементов. В следующем уроке вы найдете инструкцию по регистрации в n8n и уже до начала занятий сможете попасть в конструктор, попробовать создать первый сценарий, настроить обмен данными и запустить агента.

## Резюме

ИИ-агент в n8n — это процесс, состоящий из элементов-операций, который пользователь настраивает из готовых компонентов.

Процесс включает в себя триггеры, действия, ИИ-ноды, а также продвинутые компоненты с кодом или вспомогательные утилиты.

Для работы важно настроить обмен данными, чтобы процесс мог получать и отдавать данные в сторонние сервисы.', 2, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm1-urok-4-kak-budet-prohodit-obuchenie',
    'article', 'Урок 4. Как будет проходить обучение', 'Инструкция, как получить доступы',
    '- Инструкция, как получить доступы
- Описание кейсов и инструкция для работы
- Расписание обучения
- Ссылка в толк и т.д.', 3, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_sections (
    id, course_id, slug, title, position, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, 'modul-2-ii-agent-kak-tochka-rosta-vybiraem-protsess', 'Модуль 2. ИИ-агент как точка роста: выбираем процесс', 1,
    'published', v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    status = 'published',
    version = course_sections.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_sections.published_at, now()),
    updated_at = now()
  RETURNING id INTO v_section_id;

  UPDATE course_materials
  SET position = position + 1000
  WHERE section_id = v_section_id;

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm2-urok-4-chto-vazhno-znat-do-nachala-zanyatiya',
    'article', 'Урок 4. Что важно знать до начала занятия', 'Шаблон для групповой работы',
    '- Шаблон для групповой работы', 0, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm2-urok-5-vybor-i-adaptatsiya-stsenariya-ii-agenta',
    'article', 'Урок 5. Выбор и адаптация сценария ИИ-агента', 'Видео с занятия',
    '- Видео с занятия
- Презентация спикера
- Инструкция, как получить данные по АПИ из своего сервиса', 1, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_sections (
    id, course_id, slug, title, position, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, 'modul-3-sobiraem-pervogo-agenta', 'Модуль 3. Собираем первого агента', 2,
    'published', v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    status = 'published',
    version = course_sections.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_sections.published_at, now()),
    updated_at = now()
  RETURNING id INTO v_section_id;

  UPDATE course_materials
  SET position = position + 1000
  WHERE section_id = v_section_id;

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm3-urok-6-razbor-keysov-dlya-sozdaniya-ii-agentov',
    'article', 'Урок 6. Разбор кейсов для создания ИИ-агентов', 'Видео занятия',
    '- Видео занятия
- Презентация спикера', 0, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_sections (
    id, course_id, slug, title, position, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, 'modul-4-tipichnye-oshibki-pri-sozdanii-agentov', 'Модуль 4. Типичные ошибки при создании агентов', 3,
    'published', v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    status = 'published',
    version = course_sections.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_sections.published_at, now()),
    updated_at = now()
  RETURNING id INTO v_section_id;

  UPDATE course_materials
  SET position = position + 1000
  WHERE section_id = v_section_id;

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm4-urok-7-razbor-oshibok-pri-sozdanii-agentov',
    'article', 'Урок 7. Разбор ошибок при создании агентов', 'Видео занятия',
    '- Видео занятия
- Презентация спикера', 0, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm4-urok-8-podgotovka-k-prezentatsii',
    'article', 'Урок 8. Подготовка к презентации', 'Информация о презентации',
    '- Информация о презентации
- Критерии оценки агентов', 1, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  INSERT INTO course_sections (
    id, course_id, slug, title, position, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, 'modul-5-podvedenie-itogov', 'Модуль 5. Подведение итогов', 4,
    'published', v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    status = 'published',
    version = course_sections.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_sections.published_at, now()),
    updated_at = now()
  RETURNING id INTO v_section_id;

  UPDATE course_materials
  SET position = position + 1000
  WHERE section_id = v_section_id;

  INSERT INTO course_materials (
    id, course_id, section_id, slug, kind, title, summary,
    body_markdown, position, estimated_minutes, status,
    created_by_user_id, updated_by_user_id,
    published_by_user_id, published_at
  )
  VALUES (
    gen_random_uuid(), v_course_id, v_section_id, 'm5-urok-9-itogi-i-chto-dalshe',
    'article', 'Урок 9. Итоги, и что дальше', 'Поздравляем победителей',
    '- Поздравляем победителей
- Инструкция, как развернуть сервер и подключить ЛЛМ самостоятельно', 0, 3, 'published',
    v_admin_id, v_admin_id, v_admin_id, now()
  )
  ON CONFLICT (course_id, slug) DO UPDATE SET
    section_id = EXCLUDED.section_id,
    kind = EXCLUDED.kind,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    body_markdown = EXCLUDED.body_markdown,
    position = EXCLUDED.position,
    estimated_minutes = EXCLUDED.estimated_minutes,
    status = 'published',
    version = course_materials.version + 1,
    updated_by_user_id = v_admin_id,
    published_by_user_id = v_admin_id,
    published_at = COALESCE(course_materials.published_at, now()),
    updated_at = now();

  SELECT count(*)::int INTO v_sections
  FROM course_sections
  WHERE course_id = v_course_id;

  SELECT count(*)::int INTO v_materials
  FROM course_materials
  WHERE course_id = v_course_id;

  IF v_sections <> 5 OR v_materials <> 10 THEN
    RAISE EXCEPTION 'T-0108 topology mismatch: % sections, % materials',
      v_sections, v_materials;
  END IF;

  -- The test account must open the restored course, not an older fixture.
  UPDATE course_memberships
  SET status = 'revoked',
      revoked_by_user_id = v_admin_id,
      revoked_at = now(),
      updated_at = now()
  WHERE user_id = v_student_id
    AND course_id <> v_course_id
    AND status = 'active';

  INSERT INTO course_memberships (
    course_id, user_id, status, granted_by_user_id,
    revoked_by_user_id, granted_at, revoked_at, updated_at
  )
  VALUES (
    v_course_id, v_student_id, 'active', v_admin_id,
    NULL, now(), NULL, now()
  )
  ON CONFLICT (course_id, user_id) DO UPDATE SET
    status = 'active',
    granted_by_user_id = v_admin_id,
    granted_at = now(),
    revoked_by_user_id = NULL,
    revoked_at = NULL,
    updated_at = now();

  INSERT INTO audit_events (
    id, actor_user_id, action, subject_type, subject_id,
    outcome, metadata
  )
  VALUES (
    gen_random_uuid(), v_admin_id, 'course.source_imported',
    'course', v_course_id, 'success',
    jsonb_build_object(
      'taskKey', 'T-0108',
      'sourceDocumentId', '1RGJTeHwZ7RqbdRxxYM8iRZwLXDyWKbUpssmZbKklsdw',
      'sourceRevisionId', 'AIroW34mh9Nzw76HhX8B2oETxv-lQF7II6puQk-cqjzonEbqej0yfsgkklWg3U_ShvJ4-apT110H2NnYEdTFDthHxGqyS7bS3xOu0PopPxU',
      'sections', v_sections,
      'materials', v_materials,
      'studentEmail', 'test-student@neurokurs.ru'
    )
  );
END
$$;
