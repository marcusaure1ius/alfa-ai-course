# Аудит курсов, шаблонов и Polza.ai для аудитории РФ

Проверено: 2026-07-23. Цены, программы и условия меняются; это датированный снимок публичных страниц, а не обещание продавца или проверка личного кабинета.

## Решение

Для курса оставлены десять коротких самостоятельных уроков. Пять новых сценариев закрывают выбранные задачи малого бизнеса:

1. картинка по тексту;
2. новая картинка по входному изображению;
3. разбор лида из Telegram;
4. персональный ИИ-помощник в Telegram;
5. извлечение данных из первичного документа для ручной сверки.

Внешние JSON напрямую не импортируются. Большинство найденных шаблонов используют OpenAI, Gemini, OpenRouter, Google Sheets, Notion, Airtable или community nodes, автоматически отправляют сообщения и меняют рабочие базы. Для новичка они пересобраны как 5 визуальных блоков без Code/Function и без опасных действий.

## Проверка каждого учебного ресурса

«Публично» означает, что страница открылась без входа. Это не доказывает доступность оплаты, видео, кабинета или внешнего API из любой сети РФ.

| Ресурс | Публичный доступ | Где нужна регистрация | Готовый JSON | Цена/условия на дату проверки | Решение для курса |
|---|---|---|---|---|---|
| [Бесплатный курс Евгения Карташова](https://neurokartashov.ru/n8n-course/) | Статьи и видео открыты | Telegram-бот и согласие с условиями нужны для шаблона установки и дополнительных материалов | На основной странице прямой JSON не найден; выдача через Telegram | Бесплатный хаб; платный [Starter Kit](https://neurokartashov.ru/n8n-starter-kit/) — 7 900 ₽ за 8 workflow | Рекомендовать как русское повторение; не копировать OpenRouter-зависимости |
| [Stepik: ИИ-агенты и автоматизация с n8n](https://stepik.org/course/222232/promo) | Программа открыта | Вход, запись и оплата для уроков | Публичная страница не подтверждает прямую загрузку JSON | 9 296 ₽ по акции до 18.08.2026; 20 уроков, 104 теста, 8 интерактивных задач; обновлён 22.07.2026 | Не для первого шага: в программе есть JavaScript/Python; полезен как следующий курс |
| [n8n-courses.ru](https://n8n-courses.ru/) | Лендинг открыт | Заявка с именем, email, телефоном и Telegram; затем оплата и закрытый Telegram | Заявлены 10+ сценариев, публичного JSON нет | 19 990 ₽; 30+ видео | Идеи по Telegram и контенту полезны, но курс местами допускает код через нейросеть |
| [Udemy: GPT, Telegram, нейросети без кода](https://www.udemy.com/course/n8n-tg-gpt/) | Программа открыта | Аккаунт и покупка для уроков и файлов | JSON-шаблоны заявлены внутри курса | Цена динамическая; 9 лекций, 1 ч 17 мин | Короткий практикум, но OpenAI/Claude и покупка из РФ требуют отдельной проверки |
| [Клуб «Точка сборки»](https://autonpoint.ru/) | Лендинг открыт | Оплата и личный кабинет | Downloads доступны участникам; публичных JSON нет | 1 900 ₽/месяц по указанной акции или 14 900 ₽/365 дней | Библиотека идей по Telegram, VK, CRM и контенту; каждый файл нужно проверять перед импортом |
| [n8n для маркетологов](https://learn.osipenkov.ru/n8n/) | Программа открыта | Покупка, GetCourse-кабинет и закрытый Telegram | Заявлена коллекция шаблонов внутри курса | 29 900 ₽ | Сильный RF-fit: Метрика, Директ, VK Ads, Битрикс24, YandexGPT; подходит после основ |
| [Обучение Дмитрия Шувалова](https://so.n8n.how/?lang=ru) | Открыт только каталог Moodle | Вход нужен для материалов | На публичной части не подтверждён | Цена публично не указана | До регистрации нельзя оценить уроки и JSON; отложено |
| [Cloud.ru: курс валют → Telegram](https://cloud.ru/docs/virtual-machines/ug/topics/tutorials__currency-n8n-tg-bot) | Руководство открыто полностью | Аккаунт Cloud.ru нужен только для повторения шага с VM | Готового JSON нет, workflow собирается вручную | Бесплатно | Хорошая идея дополнительного RF-урока, но не копировать `latest`, публичный порт 5678 и Code node |
| [Официальная n8n Academy](https://learn.n8n.io/) | Каталог открыт | Бесплатная регистрация нужна для прохождения и прогресса | Это лабораторные, не библиотека русских JSON | Бесплатно, английский | Лучший источник основ для преподавателя; для нашей аудитории нужен русский маршрут |
| [Официальная библиотека n8n](https://n8n.io/workflows/) | Каталог и страницы открыты; на дату проверки 10 908 шаблонов | Просмотр не требует входа; аккаунт может понадобиться для действий сайта | JSON конкретного шаблона получен без входа через публичный API, например [`2534`](https://api.n8n.io/templates/workflows/2534) | Есть бесплатные и платные шаблоны | Главный каталог идей. Импортировать только после no-code, credentials, privacy и mutation audit |

## Polza.ai: почему выбран для новых уроков

Проверены официальные страницы:

- [общая документация](https://polza.ai/docs/) заявляет оплату в рублях, работу без VPN, OpenAI-совместимость и более 400 моделей;
- [FAQ](https://polza.ai/docs/glavnoe/faq) подтверждает пополнение картой, через СБП и расчётный счёт;
- [введение в API](https://polza.ai/docs/api-reference/introduction) требует `Authorization: Bearer …`, ограничивает файл/изображение 50 MB и задаёт таймаут 600 секунд;
- [инструкция n8n](https://polza.ai/docs/integracii/n8n) использует Base URL `https://polza.ai/api/v1` и API-ключ из консоли;
- [Chat Completions](https://polza.ai/docs/api-reference/chat/completions) — `POST https://polza.ai/api/v1/chat/completions`;
- [Images Generations](https://polza.ai/docs/api-reference/images/generations) — `POST https://polza.ai/api/v2/images/generations`, ответ может содержать `usage.cost_rub`;
- [Media API](https://polza.ai/docs/api-reference/media/create) — `POST https://polza.ai/api/v1/media`, входное изображение передаётся URL или base64.

### Что понадобится от владельца

Регистрация нужна перед реальным smoke-test:

1. открыть [консоль Polza.ai](https://polza.ai/dashboard) и создать аккаунт;
2. пополнить баланс в рублях;
3. создать API-ключ;
4. в n8n создать **HTTP Header Auth** credential с Name `Authorization` и Value `Bearer ВАШ_API_КЛЮЧ`;
5. выбрать credential в одном учебном workflow и провести контролируемый тест.

API-ключ нельзя присылать в чат или сохранять в Git. До этого шага workflow импортируются выключенными и без credential references.

### Ограничения

- «Без VPN» — заявление сервиса и отсутствие VPN-зависимости в наших workflow, а не гарантия для любой сети и аккаунта.
- Запрос обрабатывает не только Polza.ai, но и выбранный upstream-провайдер модели. Реальные документы и персональные данные требуют отдельной проверки условий обработки.
- Каталог моделей, цена и поддерживаемые параметры меняются. Перед занятием нужно проверить model ID и баланс.
- Примеры model ID в документации могут отставать от фактического каталога: 2026-07-23 документированный пример `dall-e-3` уже не принимался реальным endpoint.

### Credential-free проверка с учебного VPS

2026-07-23 три используемых endpoint были вызваны с синтетическим минимальным body, без Authorization и без сохранения текста ответа:

- `POST /api/v1/chat/completions` → HTTP 401, TLS verify result 0;
- `POST /api/v2/images/generations` → HTTP 401, TLS verify result 0;
- `POST /api/v1/media` → HTTP 401, TLS verify result 0.

Все ответы имели `application/json; charset=utf-8`. Это доказывает достижимость Polza.ai с учебного VPS и корректную границу авторизации, но не доказывает доступ моделей, достаточный баланс или успешную платную генерацию.

### Реальная проверка с user-owned ключом

После регистрации и пополнения владелец ввёл тестовый ключ непосредственно в n8n. Пять manual paths выполнены с учебного VPS на синтетических данных:

- `openai/gpt-4o` успешно подготовил карточку лида, ответ персонального помощника и структурированные поля первичного документа;
- `openai/gpt-image-1.5` успешно создал PNG по русскоязычному описанию;
- `google/gemini-2.5-flash-image` успешно изменил синтетическое изображение по URL;
- пять успешных вызовов стоили суммарно около 6,83 ₽;
- оба изображения получены с `s3.polza.ai`, открылись без VPN с тестовой машины и прошли визуальную проверку.

Текущий model ID выбирался не по примеру в тексте документации, а по публичному [каталогу моделей Polza.ai](https://polza.ai/api/v1/models/catalog). Для image-to-image использован официальный [пример Nano Banana](https://polza.ai/docs/gaidy/nanobanano): Media API, `google/gemini-2.5-flash-image` и один URL reference.

Отдельно зафиксирована provider-зависимость: валидный запрос к `qwen/image` завершился `INTERNAL_ERROR`. Это не ошибка credential или n8n, поэтому для beginner-урока выбран успешно проверенный маршрут Nano Banana.

## Изученные готовые сценарии

### Telegram и персональный помощник

- [Telegram AI assistant, template 2534](https://n8n.io/workflows/2534-telegram-ai-bot-assistant-ready-made-template-for-voice-and-text-messages/) — готовая схема с текстом и голосом, но требует OpenAI/Whisper и содержит 15 nodes.
- [Privacy-focused Telegram + Ollama](https://n8n.io/workflows/6012-create-a-privacy-focused-ai-assistant-with-telegram-ollama-and-whisper/) — уменьшает зависимость от зарубежного API, но требует отдельной локальной модельной инфраструктуры.
- [Мультимодальный Telegram assistant](https://n8n.io/workflows/6003-build-a-multi-modal-telegram-ai-assistant-with-gemini-voice-and-image-generation/) — полезный набор идей, но требует Gemini, AssemblyAI, MongoDB и edge-tts.

Из них взята только понятная бизнес-модель «Telegram → контекст → ответ». В уроке 9 нет памяти и действий; ответ остаётся preview в n8n.

### Лиды

- [Telegram → Gemini → подтверждение CRM-контакта](https://n8n.io/workflows/9700-capture-and-store-crm-contacts-with-telegram-and-gemini-ai/) — хороший паттерн подтверждения, но использует Gemini и Google Sheets.
- [Lead enrichment через Explorium MCP](https://n8n.io/workflows/5421-ai-powered-lead-enrichment-with-explorium-mcp-and-telegram/) — слишком много внешних зависимостей для новичка.
- [Support + lead collection + RAG](https://n8n.io/workflows/9234-customer-support-and-lead-collection-chatbot-with-rag-gpt-4o-sheets-and-telegram/) — полезен как advanced-пример, не как первый урок.

Урок 8 только создаёт карточку и оставляет перенос в CRM менеджеру.

### Первичные документы и расходы

- [Receipt → GPT-4/OCR → Sheets/Notion](https://n8n.io/workflows/8279-extract-and-store-receipt-data-with-gpt-4-ocr-google-sheets-and-notion-via-telegram-bot/) — бесплатный, но автоматически пишет в несколько систем.
- [Invoice OCR → Sheets/Drive/Gmail/Telegram](https://n8n.io/workflows/3618-auto-invoice-and-receipt-ocr-to-google-sheets-drive-gmail-and-telegram-triggers/) — платный и перегруженный.
- [Google Vision OCR → AI → Sheets](https://n8n.io/workflows/6359-process-receipts-with-google-vision-ocr-ai-and-telegram-to-google-sheets/) — бесплатный, но требует Google Vision, OpenRouter, Telegram и Sheets.
- [Telegram invoice OCR](https://n8n.io/workflows/16350-process-telegram-invoice-ocr-with-ocrspace-openai-sheets-and-drive/) — поддерживает JPG/PNG/PDF, но автоматически архивирует и записывает данные.

Урок 10 использует одну мультимодальную модель, показывает raw JSON для сверки и не меняет учётные системы.

### Создание изображений

- [DALL-E через Telegram + Google Sheets](https://n8n.io/workflows/5462-generate-images-with-openai-dall-e-via-telegram-and-log-to-google-sheets/) — лишние зависимости и автоматический журнал.
- [GPT Image 1 через HTTP Request](https://n8n.io/workflows/3705-generate-custom-ai-images-with-openai-gpt-image-1-model/) — подтвердил понятный beginner-паттерн `Manual Trigger → параметры → HTTP Request`.
- [Product photos from a reference image](https://n8n.io/workflows/14201-generate-product-photos-and-videos-from-a-reference-image-with-openai-and-runwayml/) — подтверждает пользу image-to-image для малого бизнеса, но добавляет видео и зарубежные сервисы.

Уроки 6–7 оставляют только описание, один Polza request и ручную проверку результата.

## Дополнительные сценарии для следующей версии

1. отзыв клиента → определение темы и черновик ответа без автопубликации;
2. голосовое сообщение владельца → список задач с ручным подтверждением;
3. отчёт по кассе/таблице → объяснение отклонений без доступа на запись;
4. мониторинг тендеров или закупок → фильтр по критериям → Telegram preview;
5. курс ЦБ РФ → пересчёт прайса → черновик уведомления.

Приоритет следующего урока — отзывы и обратная связь: он понятен большинству предпринимателей, требует только текста и безопасно заканчивается черновиком.
