# Email: IMAP, draft и approval-bound SMTP

Проверено: 2026-07-14 для n8n `2.29.10`.

Используйте этот порядок:

1. Получите у provider отдельный app password/OAuth credential, IMAP/SMTP hosts, ports и TLS mode.
2. Создайте раздельные IMAP и SMTP credentials по [подробной инструкции](credentials/mail.md).
3. Импортируйте [Mail Gateway](contracts/mail.md) и [Email Assistant](workflows/email-assistant.md) выключенными.
4. Получите одно безопасное письмо в test mailbox без attachments.
5. Проверьте draft и approval в `testMode: true`; затем выполните один controlled SMTP send тестовому получателю.

Минимальные права: отдельный mailbox/app password, attachments off, TLS verification on, raw MIME/HTML не передаются LLM. Пароль или token хранится только в n8n credential — не в Git, workflow JSON, `.env`, screenshot или evidence.

Успех: IMAP возвращает одно нормализованное новое письмо, safe defaults не отправляют его наружу, approved SMTP smoke появляется у тестового получателя и в Sent/provider history. Ошибки authentication, relay, TLS, повторного чтения и неоднозначной отправки разобраны в credential guide.

Ротация: замените IMAP и SMTP secrets раздельно, повторите receive/send smoke, затем отзовите старые app passwords/tokens в панели provider. Blind retry SMTP запрещён до проверки Sent/history.
