# Capability matrix: n8n, LLM и CRM providers

- Статус: baseline принят в `T-0004`; единая provider matrix финализирована в `T-0016`
- Проверено: 2026-07-14
- Базовая версия n8n: `2.29.10`
- Источники: только официальная документация и исходный код n8n на закреплённом tag; один явно отмеченный HTTP probe без credentials

## Назначение и границы доказательств

Документ определяет, какие интеграционные пути можно закладывать в MVP, а какие требуют contract test с реальными credentials. Он не утверждает, что provider работает только потому, что называет API OpenAI-compatible.

Статусы в матрицах:

- **Verified (docs/source)** — поведение подтверждено официальной документацией или исходным кодом exact n8n tag.
- **Candidate, runtime test required** — официальные контракты выглядят совместимыми, но связка provider ↔ n8n не проверена реальным запросом.
- **Unsupported for default path** — подтверждённое расхождение делает default path ненадёжным.
- **Unverified** — официального подтверждения для конкретного endpoint/формата не найдено.

Для executable matrix `T-0016` эти статусы сведены к четырём точным labels: `verified_static`, `mocked_contract`, `external_unverified` и `unsupported_default`. Окружение проверки: local Node fixture harness и clean import в pinned n8n `2.29.10`; external credentials отсутствовали. Канонический датированный результат и точные credential gaps находятся в [LLM provider guide](../llm-providers.md#единая-проверочная-матрица), machine-readable snapshot — в `tests/fixtures/llm/provider-matrix.json`.

Фактический API smoke test с credentials относится к implementation-задачам `T-0013`–`T-0016`; до него UI-валидация n8n, tool calling и structured output не считаются работающими.

## Возможности n8n 2.29.10

| Возможность | Статус | Что подтверждено | Следствие для MVP |
|---|---|---|---|
| Custom Base URL в OpenAI credential | Verified (source) | Credential содержит `Base URL`, по умолчанию `https://api.openai.com/v1` | Можно направить OpenAI Chat Model на совместимый API |
| Bearer API key | Verified (source) | Credential добавляет `Authorization: Bearer <apiKey>` | Native path подходит только для совместимого Bearer-auth |
| Дополнительный header | Verified (source) | Credential разрешает один custom header | Это не заменяет полноценный OAuth lifecycle |
| Credential test | Verified (source) | Тест всегда вызывает `GET <Base URL>/models` | Provider без рабочего `/models` может не пройти native credential test |
| Model discovery | Verified (source) | Chat Model загружает список через OpenAI client `models.list()` | Нельзя считать список доступным без provider test |
| Ручной Model ID | Verified (source) | Model — resource locator с режимами list и manual ID | Manual ID — fallback после сохранения пригодного credential |
| Chat Completions | Verified (source) | Chat Model поддерживает custom Base URL | Для generic provider это default API path |
| Responses API | Verified (source), provider compatibility unverified | В текущем node опция включена по умолчанию | Для generic provider выключать, пока `/responses` отдельно не подтверждён |
| JSON mode / JSON Schema | Verified in n8n, provider compatibility unverified | Node имеет JSON-output options; Structured Output Parser принимает JSON Schema без `$ref` | Включать только после provider contract test; иначе prompt + parse + validation/retry |
| AI Agent | Verified (docs) | Начиная с n8n 1.82 AI Agent работает как Tools Agent и требует минимум один tool | Не использовать Agent для обычной extraction/classification; model должна поддерживать ожидаемый tool schema |
| Built-in GigaChat/Bitrix24 node | Unsupported in exact tag | В полном source tree tag `n8n@2.29.10` нет путей `gigachat` или `bitrix` | Использовать HTTP Request/reusable adapter, не обещать native node |

Официальные источники:

- [OpenAI credential source, n8n@2.29.10](https://github.com/n8n-io/n8n/blob/n8n%402.29.10/packages/nodes-base/credentials/OpenAiApi.credentials.ts)
- [OpenAI Chat Model source, n8n@2.29.10](https://github.com/n8n-io/n8n/blob/n8n%402.29.10/packages/%40n8n/nodes-langchain/nodes/llms/LMChatOpenAi/LmChatOpenAi.node.ts)
- [Model loader source, n8n@2.29.10](https://github.com/n8n-io/n8n/blob/n8n%402.29.10/packages/%40n8n/nodes-langchain/nodes/llms/LMChatOpenAi/methods/loadModels.ts)
- [OpenAI Chat Model documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai/)
- [AI Agent documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)
- [Structured Output Parser documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserstructured/)
- [Полное дерево исходников n8n@2.29.10](https://github.com/n8n-io/n8n/tree/n8n%402.29.10/packages)

## Provider capability matrix

| Provider/path | Auth | Chat Completions | `/models` | Manual model | Tools / AI Agent | Structured output | Решение для MVP |
|---|---|---|---|---|---|---|---|
| Generic OpenAI-compatible | Bearer key обязателен для native path | Candidate; проверяется реальным request/response contract | Candidate; обязателен для беспроблемного native credential test | Verified в n8n | Unverified до отдельного tool-call test | Unverified до JSON/Schema test | Native OpenAI Chat Model только после Connection Test; иначе HTTP Request adapter |
| Yandex AI Studio OpenAI-compatible | Verified docs: `Authorization: Api-Key ...`; `OpenAI-Project` for chat and `x-project` for model listing | Verified docs: `POST /v1/chat/completions`; authenticated account smoke pending | Verified docs: `GET /v1/models`; authenticated account smoke pending | Verified: full `gpt://<folder>/<model>/<version>` URI | Official API supports tools; MVP disabled pending authenticated model-specific test | Official API supports `json_schema`; MVP uses local validation pending authenticated model-specific test | Explicit HTTP Request adapter + early `/models` diagnostic; native path is optional only after credential/header smoke |
| GigaChat REST | OAuth exchange Basic authorization key → short-lived Bearer token | Verified provider API, но не OpenAI-identical для всех options | Verified: `GET /v1/models` | Verified: явный GigaChat model ID | Provider использует `functions`/`function_call`; n8n OpenAI tool schema не подтверждена | `json_schema` доступен на business endpoint; не универсален для всех accounts | Provider-specific HTTP Request adapter; native OpenAI Chat Model не является default |
| Bitrix24 REST | Incoming webhook для single-portal или OAuth 2.0 для app | N/A | N/A | IDs через REST (`entityTypeId`, user/task IDs) | N/A | REST JSON | HTTP Request CRM adapter; quick-start webhook с явным secret-handling constraint |

## Generic OpenAI-compatible contract

### Default native path

Native OpenAI Chat Model разрешён только если Connection Test подтверждает одновременно:

1. Base URL использует HTTPS и ожидает `Authorization: Bearer`.
2. `GET /models` проходит credential test и возвращает форму, которую принимает OpenAI client n8n.
3. Ручной Model ID выполняет минимальный `POST /chat/completions`.
4. Ответ содержит ожидаемые `choices[].message` и диагностируемую ошибку при неверной модели.
5. Опция **Use Responses API** выключена; `/responses` не предполагается по названию совместимости.

Tool calling, streaming и JSON Schema — отдельные capability flags. Успешный обычный chat completion не включает их автоматически.

### Fallback без model listing

Если provider не публикует или несовместимо реализует `/models`:

1. использовать manual Model ID;
2. если n8n не позволяет сохранить/использовать credential из-за обязательного credential test, перейти на HTTP Request adapter;
3. проверить один минимальный completion и один намеренно неверный model ID;
4. показывать пользователю статус `model-discovery: unavailable`, а не пустой «успешный» список.

Таким образом, отсутствие `/models` не блокирует LLM Gateway как архитектуру, но блокирует обещание native OpenAI Chat Model до реального теста.

## Yandex AI Studio

Официальные инструкции, повторно проверенные 2026-07-14, фиксируют:

- Base URL `https://ai.api.cloud.yandex.net/v1`;
- service account с ролью `ai.languageModels.user`;
- API key в прямом REST request как `Authorization: Api-Key <API-ключ>`;
- folder ID в `OpenAI-Project` для Chat Completions и `x-project` в documented Models cURL;
- `POST /chat/completions` и `GET /models` как документированные OpenAI-compatible endpoints;
- operation-specific scopes `yc.ai.foundationModels.execute` для Chat Completions и `yc.ai.models.viewer` для model listing;
- полный model URI `gpt://<folder_ID>/<model>/<version>`.

Официальная документация теперь подтверждает transport contract, model listing и native `json_schema`, но без пользовательского credential всё ещё не подтверждает конкретный folder, model, quota или поведение native n8n credential. Поэтому default MVP реализован явным HTTP Request adapter: он точно задаёт документированные auth/project headers и безопасно нормализует errors. Native n8n, tools и provider-native schema остаются выключенными до authenticated model-specific smoke.

Проверка без credentials 2026-07-13 получила `401` от `GET https://ai.api.cloud.yandex.net/v1/models`. Это подтверждает только наличие защищённого route на сетевом уровне и не заменяет официальный contract или authenticated smoke test.

Решение реализации `T-0014`:

- HTTP Header Auth credential с `Authorization: Api-Key ...`;
- non-secret folder profile и endpoint-specific project headers;
- early `/models` diagnostics с точной проверкой configured model URI;
- HTTP Request adapter к `/v1/chat/completions` и generic gateway output;
- prompt + local schema validation для JSON; tools и provider-native structured output выключены до authenticated contract test.

Официальные источники:

- [Базовый Chat Completions request](https://aistudio.yandex.ru/docs/ru/ai-studio/operations/generation/completions-basic.html)
- [Получить список моделей](https://aistudio.yandex.ru/docs/ru/ai-studio/operations/models/get.html)
- [REST List models](https://aistudio.yandex.ru/docs/ru/ai-studio/models/listModels)
- [Авторизация API key в Yandex Cloud](https://yandex.cloud/ru/docs/iam/concepts/authorization/api-key)
- [Structured output в Chat Completions](https://aistudio.yandex.ru/docs/ru/ai-studio/operations/generation/completions-structured.html)

## GigaChat

### Подтверждённый auth lifecycle

Официальный контракт:

1. `POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth`.
2. `Content-Type: application/x-www-form-urlencoded`.
3. `Authorization: Basic <authorization_key>` и уникальный `RqUID` в UUID-формате.
4. Scope выбирается из `GIGACHAT_API_PERS`, `GIGACHAT_API_B2B`, `GIGACHAT_API_CORP` по account contract.
5. В ответе приходит Bearer access token с `expires_at`; документированный срок — 30 минут.
6. API base — `https://gigachat.devices.sberbank.ru/api/` либо `https://api.giga.chat/` для «Салют для Бизнеса».

### Безопасный MVP renewal path

MVP не хранит временный access token как ручной n8n credential и не просит пользователя обновлять его:

1. authorization key и scope хранятся как secret configuration; в workflow JSON их нет;
2. при каждом запуске gateway adapter выполняет OAuth exchange один раз;
3. полученный token передаётся только следующим HTTP Request nodes текущего execution;
4. token не записывается в static data, business log или error message;
5. при `401` adapter выполняет не более одного нового exchange и один retry исходного запроса;
6. повторный `401` возвращается как нормализованная auth error без token body.

Per-execution exchange сознательно выбран вместо общего cache: он исключает race conditions и stale shared token в beginner MVP. Оптимизация cache возможна позже только с concurrency test и ранним refresh по `expires_at`. Ограничение token endpoint `10 rps` означает, что этот простой профиль не предназначен для высокой параллельной нагрузки.

### Почему не default OpenAI Chat Model

- OAuth exchange нельзя выразить постоянным Bearer API key.
- GigaChat function calling использует `functions`, `function_call` и сообщения с ролью `function`; идентичность OpenAI tools schema не подтверждена.
- Structured output `json_schema` документирован только для клиентов «Салют для Бизнеса» на `https://api.giga.chat/`.
- В exact n8n tag нет встроенного GigaChat node.

Поэтому default — HTTP Request adapter с обычным chat completion. Functions и structured output становятся отдельными opt-in flags после contract tests на выбранном account/base URL.

Официальные источники:

- [GigaChat REST API: OAuth, base URLs и models](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api)
- [Chat completions endpoint](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-chat)
- [Работа с функциями](https://developers.sber.ru/docs/ru/gigachat/guides/functions/overview)
- [Генерация структурированных данных](https://developers.sber.ru/docs/ru/gigachat/guides/structured-output)

## CRM example adapter: Bitrix24

### Выбор

Bitrix24 выбран как единственный example adapter MVP, потому что:

- он релевантен русскоязычной аудитории курса;
- официальный REST API предоставляет универсальный контракт `crm.item.*`;
- Lead, Deal, Contact и Company имеют стабильные `entityTypeId` (`1`, `2`, `3`, `4`);
- официальный `tasks.task.add` закрывает создание задачи;
- single-portal сценарий имеет простой incoming webhook, а расширенный сценарий — OAuth 2.0;
- реализация через HTTP Request сохраняет provider-neutral границу CRM sub-workflow.

В n8n 2.29.10 встроенный Bitrix24 node не найден, поэтому наличие native integration не входит в обещания MVP.

### Контракт adapter

`CRM Create or Update Lead` принимает нормализованные поля и выполняет:

1. `crm.item.fields` для setup/diagnostics и проверки portal-specific required/custom fields;
2. поиск через `crm.item.list` по настроенному external ID, а при его отсутствии — по нормализованным phone/email;
3. `crm.item.add` с `entityTypeId: 1` либо `crm.item.update` найденной записи;
4. возврат `{ provider, entityTypeId, id, action, url?, warnings[] }`.

Надёжная идемпотентность требует пользовательского custom field для external ID. Поиск только по phone/email — допустимый quick-start fallback, но не обещает отсутствие дублей при параллельных запросах.

`CRM Create Task` вызывает `tasks.task.add` и требует как минимум `TITLE` и `RESPONSIBLE_ID`; scope `task` запрашивается отдельно от `crm`.

### Auth и secrets

Для внутреннего single-portal MVP используется incoming webhook с минимальными `crm`/`task` permissions и отдельным техническим пользователем. Webhook code — бессрочный секрет внутри URL path. Поэтому:

- полный webhook base URL нельзя помещать в workflow JSON, fixtures, logs или документацию;
- до реализации `T-0020` задача `T-0004` должна выбрать проверяемое secret storage: encrypted n8n credential, если URL path можно безопасно собрать из выбранного credential type, либо закрытый server env (`.env` mode `0600`) как явно документированное исключение;
- exported workflow содержит только ссылку/выражение, но не значение секрета;
- production/multi-user adapter должен использовать OAuth 2.0 и хранить/обновлять token pair, а не распространять webhook URL.

OAuth access token живёт один час; официальный recommended flow обновляет token по auth error, сохраняет новую пару и повторяет REST request один раз. Обновлять token перед каждым request не рекомендуется.

Официальные источники:

- [Universal CRM methods и entityTypeId](https://apidocs.bitrix24.com/api-reference/crm/universal/)
- [Создание CRM item](https://apidocs.bitrix24.com/api-reference/crm/universal/crm-item-add.html)
- [Создание задачи `tasks.task.add`](https://apidocs.bitrix24.com/api-reference/tasks/tasks-task-add.html)
- [Incoming и outgoing webhooks](https://apidocs.bitrix24.com/local-integrations/local-webhooks.html)
- [Bitrix24 OAuth 2.0](https://apidocs.bitrix24.com/settings/oauth/index.html)
- [Рекомендованное обновление OAuth tokens](https://apidocs.bitrix24.com/settings/oauth/auto-renewal.html)

## Нормализованный LLM Gateway contract

Research поддерживает следующий минимальный контракт, который должна утвердить `T-0004`:

```json
{
  "provider": "generic | yandex | gigachat",
  "model": "provider-specific-id",
  "messages": [{ "role": "system | user | assistant", "content": "string" }],
  "temperature": 0.2,
  "maxTokens": 1000,
  "output": { "mode": "text | json", "schema": null }
}
```

Нормализованный ответ:

```json
{
  "ok": true,
  "provider": "generic",
  "model": "resolved-model-id",
  "content": "string",
  "json": null,
  "usage": { "inputTokens": null, "outputTokens": null, "totalTokens": null },
  "requestId": null,
  "warnings": []
}
```

Provider-specific поля, raw token и полный raw response наружу не передаются. JSON mode обязан локально parse/validate результат; если provider-native schema mode не подтверждён, gateway использует prompt contract и возвращает нормализованную validation error без скрытого repair request.

## Итоговая validation checkpoint T-0016

Подтверждено static/mock evidence:

- reusable LLM Gateway без обязательного proxy;
- generic native path только через Connection Test;
- Responses API off по умолчанию для non-OpenAI providers;
- manual model ID + HTTP fallback при проблемах `/models`;
- Yandex через explicit HTTP adapter, не как обещанная native compatibility;
- GigaChat через provider-specific per-execution OAuth adapter;
- Bitrix24 как единственный CRM example adapter MVP.

Не подтверждено без пользовательских credentials:

- authenticated Yandex `/models` и chat smoke tests;
- exact n8n credential-save behavior при неуспехе `/models`;
- provider-native JSON/tool call behavior на конкретных account/model;
- GigaChat TLS/root certificate проверка на Ubuntu container без отключения certificate verification;
- выбор безопасного хранения Bitrix24 webhook path secret;
- portal-specific required fields, custom external ID и responsible user для Bitrix24.

Эти пункты — не скрытые обещания, а `external_unverified` gates последующих controlled smoke. Local JSON Schema contract для всех трёх adapters, включая schema mismatch и malformed JSON, уже проверен единым `./tests/llm_provider_matrix_test.sh`.

LiteLLM исключён из MVP без нового ADR: текущие reusable workflows закрывают три выбранных пути, а измеренного routing, failover или compatibility gap нет. Его добавление требует сначала измеримого evidence, затем отдельного ADR для нового service, secret boundary и operations surface.
