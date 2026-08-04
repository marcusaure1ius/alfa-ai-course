# ADR-0013: Одно действие для выдачи student-доступа к n8n

Дата: 2026-08-02
Статус: accepted
Supersedes: конфигурационный и invite-сценарий ADR-0015

Отменяемый документ имеет больший номер, потому что был написан под номером
ADR-0012 и перенумерован позже при разборе коллизии трёх ADR-0012. По дате он
предшествует этому решению.

## Контекст

ADR-0015 правильно закрыл фактическую границу доступа, но оставил владельцу
три ручных действия: синхронизировать отдельный gateway secret, пригласить
Member внутри n8n и затем назначить инструмент в Neurokurs. Для продуктового
администратора это выглядит как несколько несвязанных систем, хотя намерение
одно: «выдать этому ученику доступ».

В закреплённой n8n `2.29.10` официальный Public API поддерживает `GET
/api/v1/users/:email` и `POST /api/v1/users`. POST создаёт или повторно
приглашает пользователя, возвращает точную Member identity и, если email не
отправлен, короткоживущую ссылку принятия приглашения. API key может быть
ограничен scopes `user:read` и `user:create`.

## Решение

1. Единственная ручная интеграционная настройка — owner API key n8n в
   `N8N_MANAGEMENT_API_KEY`. Отдельный `N8N_GATE_MANAGEMENT_SECRET` больше не
   задаётся оператором Course Platform.
2. Gateway secret детерминированно выводится HMAC-SHA-256 из уже обязательного
   `AUTH_SECRET` с отдельным domain context. Во время установки управляемой
   среды bootstrap сам создаёт `.env.platform` с mode `0600`, записывает
   derived value и запускает Compose с managed Caddy profile.
3. «Выдать доступ» сначала ищет точный email через Public API. Отсутствующего
   или pending пользователя платформа автоматически приглашает как
   `global:member`. Owner/admin identity, другой email и неоднозначный ответ
   fail closed.
4. Если n8n отправил invitation email, дополнительного шага администратора нет.
   Если SMTP не настроен, возвращённый `/signup?token=…` проверяется на exact
   same-origin/path, шифруется AES-256-GCM ключом, производным от `AUTH_SECRET`,
   и сохраняется в единственной server-side записи назначения до первого
   успешного exchange. Gateway tickets содержат только ссылку на поколение
   назначения и не копируют invite ciphertext. Первый student launch атомарно
   забирает и удаляет сохранённую копию, устанавливает revocable gateway cookie
   и перенаправляет ученика на принятие приглашения. Revoke удаляет копию сразу,
   expiry — ближайшим ежедневным reconciliation.
5. В `tool_access` по-прежнему нет пароля, n8n API key или session cookie.
   Invite path не попадает в DTO, audit или logs. Gateway assignment generation,
   expiry, revoke, service gate и unique identity constraints ADR-0015 остаются
   обязательными.

## Последствия

- Для администратора назначение и отзыв являются одним действием.
- Первый вход нового ученика может потребовать задать собственный пароль n8n;
  это действие ученика, а не предварительная настройка администратора.
- Ротация `AUTH_SECRET` требует тем же изменением повторно применить managed
  profile к VPS; несинхронная ротация закрывает gateway fail-closed.
- Существующая production-среда не становится managed только от deployment
  Course Platform: ей нужен отдельный безопасный re-provision/apply с evidence.
- Реализация не ослабляет ограничения Community edition и не выдаёт owner/admin
  права ученикам.

## Источники

- [n8n User API](https://docs.n8n.io/api/api-reference/#tag/User)
- n8n `2.29.10`, `packages/cli/src/public-api/v1/handlers/users`: GET и POST
  `/api/v1/users`, scopes `user:read`/`user:create`.
- n8n `2.29.10`, `UserService.sendEmails`: invitation JWT действует 90 дней и
  возвращается только при неотправленном email и разрешённом invite-link mode.
