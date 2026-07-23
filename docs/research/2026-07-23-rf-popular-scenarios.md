# Популярные LLM-сценарии для аудитории в РФ

Дата исследования: 2026-07-23. Задача: `T-0040`.

## Короткий вывод

Для первого RF-набора приоритетны не «автономные агенты на все случаи», а три понятных контура:

1. важная почта → LLM-классификация → Telegram;
2. входящее письмо → LLM-черновик → проверка человеком;
3. Telegram → LLM-ассистент с draft-only ответом.

Они повторяются в публичном каталоге n8n, подходят предпринимателю без отдельного рабочего приложения и собираются на уже проверенных Mail, Telegram и LLM gateways. Для LLM default RF-path — Yandex AI Studio или GigaChat. Ни один бизнес-workflow не вызывает provider API напрямую.

## Что означает «популярный»

n8n не публикует на каждой найденной странице сопоставимое число production users или successful executions. Поэтому исследование не выдаёт каталог шаблонов за репрезентативную статистику рынка.

Использованы три прозрачных proxy:

- один и тот же job повторяется в нескольких независимо опубликованных n8n templates;
- job попадает в стабильные категории каталога: `AI Chatbot`, `Personal Productivity`, `Ticket Management`, `AI Summarization`;
- канал релевантен РФ: по Mediascope месячный охват Telegram в России среди населения 12+ в октябре 2025 года составлял 74%.

Источники дают сигнал для приоритизации, но не доказывают ROI конкретной компании.

## Кандидаты и приоритет

Шкала: 3 — сильный сигнал/соответствие, 2 — средний, 1 — слабый. Итог не является научным рейтингом; это воспроизводимое продуктовое решение.

| Сценарий | Повторяемость в templates | RF-fit | Безопасность и простота | Решение |
|---|---:|---:|---:|---|
| Важная почта → AI triage → Telegram alert | 3 | 3 | 3 | внедрён как `businessRfEmailTelegramTriageV1` |
| AI-черновик ответа на письмо → ручная проверка | 3 | 3 | 3 | уже есть `businessEmailAssistantV1`; SMTP не вызывается |
| Telegram LLM-ассистент | 3 | 3 | 3 | уже есть `businessTelegramAssistantV1`, draft-only |
| Лид из формы/чата → LLM-квалификация → CRM + Telegram | 2 | 3 | 2 | уже есть `businessGuardedLeadHandlerV1` с approval |
| Ежедневная сводка бизнеса → LLM → Telegram | 2 | 3 | 3 | уже есть `businessDailyExecutiveDigestV1` |
| Поиск писем естественным языком из Telegram | 2 | 3 | 2 | кандидат следующей версии; нужны отдельные Gmail/Yandex search adapters и read-only policy |
| Мультиканальная поддержка Gmail + Telegram + база знаний | 2 | 3 | 1 | не включена целиком: RAG/knowledge source и memory требуют отдельного privacy/quality design |
| AI-очистка/удаление почты | 2 | 2 | 1 | отклонена для starter pack: модель не должна автоматически удалять почту |

## Наблюдаемые template-сигналы

- [AI email triage и Telegram notifications](https://n8n.io/workflows/3968-ai-email-triage-and-alert-system-with-gpt-4-and-telegram-notifications/) — triage, summary, escalation и alert.
- [AI email response с Telegram approval](https://n8n.io/workflows/6026-automate-email-responses-with-openai-and-telegram-approval-for-gmail/) — определение необходимости ответа, draft и human-in-the-loop.
- [Gmail search assistant в Telegram](https://n8n.io/workflows/5044-gmail-ai-search-assistant-on-telegram-gemini-powered/) — natural-language search и выдача результатов в Telegram.
- [Gmail/Telegram customer support](https://n8n.io/workflows/4474-automate-multi-channel-customer-support-with-gmail-telegram-and-gpt-ai/) — повторяющийся multi-channel support job.
- [Telegram voice/text assistant с Gmail](https://n8n.io/workflows/8648-voice-and-text-assistant-with-telegram-gemini-ai-calendar-gmail-and-notion/) — Telegram как front-end к рабочим действиям.
- [Telegram assistant с email approval](https://n8n.io/workflows/17015-run-a-telegram-voice-and-chat-assistant-with-openai-gmail-calendar-and-notion/) — ассистент и подтверждение отправки.
- [Gmail classification и urgent Telegram alerts](https://n8n.io/workflows/7257-organize-gmail-with-gpt-4-and-send-urgent-notifications-via-telegram-and-whatsapp/) — классификация и срочные уведомления.
- [Gmail cleanup с AI и Telegram](https://n8n.io/workflows/3502-smart-gmail-cleaner-with-ai-validator-and-telegram-alerts/) — подтверждает спрос на inbox cleanup, но destructive delete в RF-набор не переносится.

Это независимые публичные templates разных авторов, найденные и проверенные 2026-07-23. Они подтверждают повторяемость jobs, но не качество, безопасность или число реальных установок.

## Почему Telegram — основной канал уведомлений

[Mediascope, «Аудитория Интернета», октябрь 2025](https://mediascope.net/upload/iblock/539/zgazi40m8k99k5nfm21x50rfx31xdui4/%D0%9D%D0%A0%D0%A4_Mediascope_%D0%90%D1%83%D0%B4%D0%B8%D1%82%D0%BE%D1%80%D0%B8%D1%8F_%D0%98%D0%BD%D1%82%D0%B5%D1%80%D0%BD%D0%B5%D1%82%D0%B0.pdf) показывает 74% месячного охвата Telegram среди населения России 12+ на desktop и mobile. Это не доказывает, что Telegram подходит каждой компании, но делает его разумным default-каналом для учебного продукта в РФ.

[Официальная Telegram Bot API](https://core.telegram.org/bots/api) предоставляет HTTPS interface. Бот не может первым начать диалог: владелец должен открыть чат и отправить сообщение до controlled smoke.

## Почта: Gmail и Яндекс

Оба пути используют общий Mail Gateway:

- Gmail — `imap.gmail.com:993` и `smtp.gmail.com:465`/`587`; Google предпочитает OAuth, а generic IMAP path допустим только с отдельным app password и 2-Step Verification. Источники: [Gmail client help](https://support.google.com/mail/answer/7126229), [Google Workspace settings](https://support.google.com/a/answer/9003945).
- Яндекс Почта — `imap.yandex.ru:993` и `smtp.yandex.ru:465`/`587`, с включённым IMAP и отдельным паролем приложения. Источник: [Яндекс Почта](https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others).

Пошаговые профили находятся в [mail credentials guide](../credentials/mail.md). Реальная авторизация и доставка не заявляются без user-owned test mailbox и credentials.

## LLM для работы без обязательного VPN

RF-набор не включает VPN, proxy или обход ограничений. Приоритетны официальные российские API:

| Provider | Репозиторный путь | Подтверждено | Не подтверждено без credentials |
|---|---|---|---|
| Yandex AI Studio | `adapterYandexAiStudioLlmV1` | официальный `https://ai.api.cloud.yandex.net/v1`, API-key flow, model discovery contract | доступ конкретного folder, модели, квоты и billing |
| GigaChat | `adapterGigaChatLlmV1` | OAuth flow и единый `https://api.giga.chat/v1` для новых подключений с 17.07.2026 | доступ account/model, квоты, реальный completion и CA chain на VPS |

Источники: [Yandex AI Studio quick start](https://aistudio.yandex.ru/docs/ru/ai-studio/quickstart/index.html), [GigaChat API authorization](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api), [GigaChat changelog](https://developers.sber.ru/docs/ru/gigachat/changelog).

Фраза «без VPN» означает архитектурный выбор официальных публичных RF-oriented API и отсутствие VPN-зависимости в workflow. Это не гарантия доступности из любой сети: DNS/TLS, аккаунт, тариф и credentials проверяются controlled smoke на пользовательском VPS.

### Локальный reachability probe 2026-07-23

Из текущей рабочей среды без provider credentials подтверждено:

- TCP connect: `imap.gmail.com:993`, `smtp.gmail.com:465`, `imap.yandex.ru:993`, `smtp.yandex.ru:465`;
- `https://api.telegram.org` вернул HTTP `200`;
- `https://ai.api.cloud.yandex.net/v1/models` и `https://api.giga.chat/v1/models` ответили HTTP `401`, то есть DNS/TLS/HTTP endpoint доступен, а аутентификация ожидаемо не пройдена.

Это узкий network probe одной среды, не external smoke пользовательского VPS и не доказательство доступности аккаунта, модели или тарифа.

## Что внедрено

Новый [RF Email Triage to Telegram](../workflows/rf-email-telegram-triage.md):

- читает `UNSEEN` через Gmail или Яндекс IMAP;
- не скачивает attachments;
- нормализует письмо через Mail Gateway;
- по закрытой provider-карте вызывает Yandex AI Studio adapter по умолчанию, GigaChat или generic LLM contract;
- передаёт LLM максимум 6000 символов plain text, subject и только sender domain;
- локально валидирует category/priority/summary;
- отправляет в Telegram только high/urgent или security alerts;
- маскирует email отправителя и не передаёт полный текст письма;
- по умолчанию остаётся inactive, `testMode: true`, `draftOnly: true`.

Вместе с уже существующими workflows это образует пять готовых business-сценариев; все пять используют LLM через общий контракт, а Mail/Telegram/provider logic остаётся переиспользуемой.

## Ограничения evidence

- Templates исследованы как публичные описания; их JSON и внешние credentials не копировались.
- Mediascope подтверждает охват канала, а не спрос на конкретный workflow.
- Локальные contract tests не доказывают real Gmail/Yandex/Telegram/Yandex AI Studio/GigaChat connectivity.
- Любое production включение требует synthetic controlled smoke и проверки execution retention.
