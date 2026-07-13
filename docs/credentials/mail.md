# IMAP и SMTP: безопасная настройка

Проверено: 2026-07-14 для pinned n8n `2.29.10`.

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
