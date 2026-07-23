# IMAP и SMTP: безопасная настройка

Базовый контракт проверен: 2026-07-14 для pinned n8n `2.29.10`. Параметры Gmail и Яндекс Почты перепроверены по официальным инструкциям 2026-07-23.

Используйте два credentials внутри n8n:

- `IMAP` для штатного Email Trigger (IMAP);
- `SMTP` для узла Send Email в `Core - Provider-Neutral Mail Gateway`.

Официальные references: [Email Trigger (IMAP)](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.emailimap/), [IMAP credential](https://docs.n8n.io/integrations/builtin/credentials/imap/), [Send Email](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/), [SMTP/Send Email credential](https://docs.n8n.io/integrations/builtin/credentials/sendemail/) и [credential management](https://docs.n8n.io/credentials/).

## Перед началом

Получите у mail provider:

- IMAP hostname, port, username и способ authentication;
- SMTP hostname, port, username, sender address и способ authentication;
- требования к TLS: implicit TLS или STARTTLS;
- отдельный app password/OAuth credential, если provider запрещает основной пароль.

Не записывайте эти значения в Git, `.env.example`, workflow JSON, fixtures, screenshots или task evidence. Создавайте credentials через интерфейс n8n; экспортируемый workflow содержит только placeholder credential ID.

## Готовый профиль: Gmail

Официальные параметры:

| Операция | Host | Port | Защита |
|---|---|---:|---|
| IMAP | `imap.gmail.com` | `993` | SSL/TLS |
| SMTP | `smtp.gmail.com` | `465` | SSL/TLS |
| SMTP alternative | `smtp.gmail.com` | `587` | STARTTLS |

Источники: [Google Workspace: third-party mail client](https://support.google.com/a/answer/9003945), [Gmail: подключение другого клиента](https://support.google.com/mail/answer/7126229), [Google Account: app passwords](https://support.google.com/accounts/answer/185833).

Для personal Gmail IMAP включён постоянно с января 2025 года. Google предпочитает `Sign in with Google`/OAuth и не принимает обычный пароль аккаунта в старых third-party схемах. Generic IMAP path этого starter kit можно использовать только с отдельным app password:

1. Включите двухэтапную аутентификацию Google.
2. Создайте отдельный app password для `n8n-rf-mail-triage`.
3. В n8n создайте IMAP credential: полный Gmail-адрес как user, `imap.gmail.com`, `993`, SSL/TLS, app password как secret.
4. Если нужен approval-bound SMTP, создайте отдельный SMTP credential: `smtp.gmail.com`, `465`, SSL/TLS, тот же полный адрес и отдельный app password.
5. Привяжите IMAP credential к `Email Trigger (IMAP)`, но не активируйте workflow до controlled smoke.

Не используйте основной пароль Google. Для Google Workspace app passwords могут быть отключены политикой администратора, а для Advanced Protection могут быть недоступны. В таком случае generic IMAP profile не является допустимым обходом: используйте native Gmail OAuth2 node/trigger с минимальными scopes и нормализуйте его output в Mail Gateway либо попросите администратора одобрить отдельную интеграцию. Не расширяйте scopes до send/delete, если сценарий только читает почту.

Controlled smoke:

1. Отправьте одно письмо с вымышленным неперсональным содержанием из отдельного тестового аккаунта на отдельный тестовый Gmail mailbox.
2. Выполните workflow в `testMode: true`, `draftOnly: true`.
3. Ожидайте одно нормализованное письмо, отсутствие attachments и Telegram `preview`, а не реальную отправку.
4. Если authentication rejected, не включайте «less secure apps» и не вводите основной пароль; проверьте 2-Step Verification, app password и Workspace policy.

## Готовый профиль: Яндекс Почта

Официальные параметры для подключения из России:

| Операция | Host | Port | Защита |
|---|---|---:|---|
| IMAP | `imap.yandex.ru` | `993` | SSL/TLS |
| SMTP | `smtp.yandex.ru` | `465` | SSL/TLS |
| SMTP alternative | `smtp.yandex.ru` | `587` | STARTTLS |

Источник: [Яндекс Почта: настройка других программ](https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others).

1. В Яндекс Почте откройте **Настройки → Почтовые программы**.
2. Разрешите IMAP и вариант **Пароли приложений и OAuth-токены**.
3. В Яндекс ID создайте отдельный пароль приложения типа «Почта» с понятным названием `n8n-rf-mail-triage`.
4. В n8n создайте IMAP credential: `imap.yandex.ru`, `993`, SSL/TLS, логин Яндекса и пароль приложения.
5. При необходимости создайте отдельный SMTP credential: `smtp.yandex.ru`, `465`, SSL/TLS, тот же логин и отдельный пароль приложения.
6. Для Яндекс 360 для бизнеса используйте полный адрес mailbox как user и убедитесь, что администратор организации разрешил IMAP.

Не используйте обычный пароль Яндекс ID. Пароль приложения показывается один раз: сохраните его только в n8n credential, затем удалите локальную копию. Для сценария чтения не создавайте SMTP credential вообще.

Controlled smoke совпадает с Gmail: одно synthetic письмо, attachments off, `testMode: true`, Telegram preview. При `AUTH_FAILED` проверьте разрешение IMAP, тип пароля приложения, полный логин для Яндекс 360 и первый вход через web-интерфейс; не отключайте TLS verification.

## IMAP

1. В n8n откройте Credentials и создайте credential типа `IMAP`.
2. Введите host, port, user и secret из панели provider.
3. В бизнес-workflow добавьте Email Trigger (IMAP), выберите credential и mailbox `INBOX`.
4. Выберите формат `Simple`, `Download Attachments: false`, `Fetch Only New Emails: true` и post-process `Mark as Read`.
5. Преобразуйте trigger output в allowlisted `message` из [mail contract](../contracts/mail.md) и вызовите `normalizeIncoming`.
6. Начните с отдельного тестового mailbox. Не публикуйте workflow до ручного получения одного безопасного письма и проверки результата.

`Download Attachments` выключен по умолчанию: gateway принимает metadata, но не сканирует binary content. Если отдельный сценарий скачивает файл, он обязан добавить malware/content scanning и retention policy до production.

`Mark as Read` и `Fetch Only New Emails` уменьшают повторную обработку, но не заменяют дедупликацию по `messageId` и `processingMarker`. Никогда не выбирайте конфигурацию, которая намеренно возвращает одно письмо снова без idempotent business logic.

## SMTP

1. В n8n создайте credential типа `SMTP`.
2. Введите host, port, user и secret; используйте TLS settings provider.
3. Импортируйте `workflows/core/mail-gateway.json` inactive.
4. В `Send Approved SMTP Email` замените placeholder на созданный SMTP credential.
5. Не включайте `Ignore SSL Issues`: в экспортируемом узле `allowUnauthorizedCerts` равен `false`.
6. Сначала выполните `createDraft`, затем `authorizeSend` с `testMode: true`. Убедитесь, что результат `preview` и письмо не отправлено.
7. Проверьте T-0017 approval flow с тестовым адресатом. Только затем используйте `testMode: false` и `draftOnly: false`.

Send Email настроен на `Text`, без HTML и без attachments. Sender, recipients, subject и body поступают только из уже проверенного draft contract.

## Минимальный production checklist

- отдельные credentials с минимальными правами и app password/OAuth вместо основного пароля;
- TLS certificate verification включена;
- тестовый mailbox и тестовый recipient использованы до production;
- IMAP messages нормализуются до передачи LLM;
- LLM не получает raw MIME, HTML или binary attachment;
- внешний send требует точного approval с тем же `idempotencyKey`;
- собственный marker исключает loop/reply storm;
- execution retention соответствует чувствительности почты;
- SMTP failure не вызывает blind retry: сначала проверяется Sent mailbox/provider status.

## Что проверено локально

Репозиторные tests проверяют importability, contract code, TLS/text settings, отсутствие secret-like values и 20 fixtures. Соединение с реальным provider, delivery, SPF/DKIM/DMARC и попадание в spam требуют user-owned domain и credentials и должны фиксироваться отдельным external smoke evidence.

## Ожидаемый результат и ошибки

| Проверка | Ожидаемый результат |
|---|---|
| IMAP controlled smoke | одно новое тестовое письмо нормализовано; attachment не скачан |
| `createDraft` | bounded plain-text draft, внешней отправки нет |
| `authorizeSend` с safe defaults | `preview`/`draft`, SMTP node не вызывается |
| Approved SMTP smoke | одно письмо появляется у тестового получателя и в Sent/provider history |

| Симптом | Безопасное действие |
|---|---|
| IMAP authentication failed | проверьте app password/OAuth, username и provider access policy |
| SMTP rejected sender/recipient | проверьте подтверждённый sender, relay policy и тестовый recipient |
| TLS/certificate error | проверьте host, port, implicit TLS/STARTTLS и системное время; не включайте Ignore SSL Issues |
| Письмо читается повторно | проверьте `Fetch Only New`, `Mark as Read`, `messageId` и processing marker |
| Timeout/5xx после send | сначала проверьте Sent/provider history; blind retry может создать дубль |

## Ротация и отзыв

1. Создайте новый app password/OAuth credential с доступом только к тестируемому mailbox.
2. Обновите IMAP и SMTP credentials раздельно; не используйте основной пароль пользователя.
3. Повторите одно IMAP receive и один approval-bound SMTP smoke.
4. Отзовите старый app password/token в панели mail provider и проверьте, что старый credential больше не проходит connection test.
5. При утечке сначала отзовите secret и остановите workflow, затем расследуйте executions; не прикладывайте письмо или password к evidence.
