# ADR-0012: Индивидуальная n8n identity и отзыв через обязательный gateway

Дата: 2026-08-02
Статус: accepted

## Контекст

Скрытие прямого URL в Neurokurs не отзывает уже сохранённый адрес или активную
n8n-сессию. Кроме того, состояние `ready_owner_setup_required` нельзя отдавать
ученику: первый вошедший пользователь создаёт единственного instance owner.

Для pinned n8n `2.29.10` официально подтверждены следующие границы:

- owner можно заранее задать через environment variables, а UI/API-изменения
  этой записи блокируются; функция доступна с n8n `2.17.0`;
- self-hosted user management поддерживает приглашения отдельных пользователей;
- Public API владельца позволяет получить пользователя по email;
- Community edition не включает Projects, SSO и sharing. При этом workflow и
  credentials доступны только instance owner и создавшему их пользователю;
- удаление пользователя — отдельное разрушительное действие, которое может
  удалить или передать его workflow/credentials.

Источники: [user management](https://docs.n8n.io/deploy/host-n8n/configure-n8n/user-management/),
[User API](https://docs.n8n.io/connect/n8n-api/user/),
[Community edition](https://docs.n8n.io/deploy/host-n8n/community-edition-features/),
[add/remove users](https://docs.n8n.io/administer/manage-users-and-access/add-and-remove-users/),
[Caddy forward_auth](https://caddyserver.com/docs/caddyfile/directives/forward_auth).

## Решение

1. Owner setup доступен только платформенному admin через gateway. Student не
   получает launch, пока installation не имеет состояние `ready`.
2. Каждый student заранее приглашён в n8n как `Member` с тем же нормализованным
   email. Перед назначением Neurokurs server-to-server проверяет identity через
   официальный `GET /api/v1/users/:email`; owner/admin identity отклоняется.
3. В `tool_access` сохраняются только n8n user id и email, без пароля, API key,
   invite token или session cookie. Уникальные индексы запрещают совместную
   identity двум назначениям одной среды.
4. Launch возвращает не origin n8n, а same-origin endpoint Neurokurs. Он выдаёт
   одноразовый 60-секундный ticket. Ticket передаётся POST form body, поэтому
   не попадает в URL и стандартные access logs. Exchange принимает запрос
   только с server-only secret управляемого Caddy. Caddy обменивает ticket на
   host-only
   `Secure; HttpOnly; SameSite=Lax` gateway cookie.
5. Каждый editor/API request проходит Caddy `forward_auth`. Authorizer заново
   проверяет user, course membership, identity binding, неизменяемое поколение
   назначения, expiry,
   license gate, global service gate, environment и installation health. Отказ
   license gate, revoke и global off инвалидируют сохранённые gateway sessions.
6. Без gateway доступны только health и публичные webhook/form endpoints.
   Management API требует одновременно owner API key и отдельный
   `X-Neurokurs-Management` secret, который Caddy удаляет перед n8n.
7. Standalone starter kit сохраняет прежний Caddyfile. Управляемая среда явно
   подключает `docker-compose.platform.yml` и `config/Caddyfile.platform`.

## Последствия и ограничения

- Сохранённый URL и n8n login cookie без действующей gateway session бесполезны.
- Revoke блокирует доступ, но намеренно не удаляет n8n account и учебные данные.
  Окончательное удаление выполняется отдельно доверенным owner после выбора,
  что делать с workflow/credentials.
- Community edition даёт personal ownership, но не платные Projects/SSO/policy
  controls. Нельзя заявлять полную tenant-isolation от instance owner: owner по
  официальной модели видит все ресурсы.
- Первый вход по invite может требовать сначала открыть инструмент из
  Neurokurs в том же браузере, чтобы получить gateway cookie.
- Конфигурация считается production-ready только после отдельного deployment
  evidence управляемого Compose override; локальные tests не заменяют VPS/TLS.
