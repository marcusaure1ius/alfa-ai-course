# Каталог workflow и отчёт contract tests

Проверено: 2026-07-14. Pinned runtime: `docker.n8n.io/n8nio/n8n:2.29.10`. Machine-readable источник каталога: [`tests/fixtures/workflow-catalog.json`](../tests/fixtures/workflow-catalog.json).

## Обязательный порядок импорта

Импортируйте группы последовательно. Все workflow остаются неактивными и без привязанных credentials:

```bash
./scripts/import-workflows.sh --input workflows/core
./scripts/import-workflows.sh --input workflows/adapters
./scripts/import-workflows.sh --input workflows/diagnostics
./scripts/import-workflows.sh --input workflows/business
```

Сначала создаются shared contracts, затем provider adapters, diagnostics и только после них business workflows. Повтор с теми же стабильными IDs обновляет существующие workflow без создания duplicates.

## Каталог

| Группа | ID | Файл | Назначение |
|---|---|---|---|
| core | `coreGenericCrmLeadUpsertV1` | `workflows/core/crm-generic-lead-upsert.json` | provider-neutral lead upsert contract |
| core | `coreGenericCrmTaskCreateV1` | `workflows/core/crm-generic-task-create.json` | provider-neutral CRM task contract |
| core | `coreWorkflowErrorV1` | `workflows/core/handle-workflow-error.json` | redacted shared error result |
| core | `coreGenericLlmGatewayV1` | `workflows/core/llm-gateway.json` | generic LLM gateway |
| core | `coreBusinessEventLogV1` | `workflows/core/log-business-event.json` | minimal business event schema |
| core | `coreMailGatewayV1` | `workflows/core/mail-gateway.json` | normalize, draft и approval-bound SMTP |
| core | `coreNormalizeMessageV1` | `workflows/core/normalize-incoming-message.json` | bounded incoming message |
| core | `coreHumanApprovalV1` | `workflows/core/request-human-approval.json` | fail-closed approval contract |
| core | `coreSendTelegramMessageV1` | `workflows/core/send-telegram-message.json` | allowlisted Telegram sender |
| adapters | `adapterBitrix24CrmV1` | `workflows/adapters/crm-bitrix24.json` | Bitrix24 OAuth2 mapping |
| adapters | `adapterGigaChatLlmV1` | `workflows/adapters/llm-gigachat.json` | GigaChat OAuth lifecycle |
| adapters | `adapterYandexAiStudioLlmV1` | `workflows/adapters/llm-yandex.json` | Yandex AI Studio HTTP adapter |
| diagnostics | `diagnosticGenericLlmConnectionV1` | `workflows/diagnostics/generic-llm-connection-test.json` | generic endpoint/model check |
| diagnostics | `diagnosticYandexAiStudioConnectionV1` | `workflows/diagnostics/yandex-llm-connection-test.json` | Yandex models/minimal completion check |
| business | `businessDailyExecutiveDigestV1` | `workflows/business/daily-executive-digest.json` | daily privacy-minimized digest |
| business | `businessEmailAssistantV1` | `workflows/business/email-assistant.json` | draft-only email assistant |
| business | `businessGuardedLeadHandlerV1` | `workflows/business/lead-handler.json` | approval-bound lead processing |
| business | `businessTelegramAssistantV1` | `workflows/business/telegram-assistant.json` | draft/approval Telegram assistant |

## Связи

Catalog test проверяет 25 статических `Execute Workflow` ссылок. Каждая ссылка указывает на ID из более ранней группы и использует synchronous `waitForSubWorkflow=true`.

Единственная динамическая ссылка — `Load Scheduled Business Events` в Daily Executive Digest. Она получает ID из `profileSourceWorkflowId`. Это внешний source-adapter contract, поэтому перед production его нужно настроить и проверить отдельно; placeholder закрывает scheduled path с `SOURCE_ADAPTER_NOT_CONFIGURED`.

## Fixtures четырёх demo

| Demo | Cases | Что покрыто | Исполнение |
|---|---:|---|---|
| Telegram Assistant | 20 | allowlist, identity, loop, dedupe, structured LLM output, approval mismatch | Code nodes выполняются локально в Node VM; Telegram API не вызывается |
| Email Assistant | 13 | nullable extraction, anti-invention, draft-only, privacy | Code nodes выполняются локально; IMAP/SMTP не вызываются |
| Lead Handler | 21 | webhook schema, contact normalization, replay, approval, CRM preview/errors | Code nodes выполняются локально; CRM/Telegram не вызываются |
| Daily Executive Digest | 14 | time window, coverage, duplicates, partial/missing data, structured summary | Code nodes выполняются локально; source/LLM/Telegram не вызываются |

Каждый case имеет уникальное имя, input и ожидаемый result subset. Контактные значения ограничены объявленными synthetic domains/phone fixtures. Реальные customer data в suite не нужны и запрещены.

## Автоматическая проверка

```bash
./tests/workflow_catalog_test.sh
```

Test выполняет пять gates:

1. каталог точно совпадает со всеми 18 JSON; IDs и node IDs уникальны, workflows inactive, Sticky Notes присутствуют, `pinData` пуст;
2. credential objects содержат только placeholder `id`/`name`, secret/token/private-key patterns и необъявленные contact fixtures отклоняются;
3. четыре demo suites и supporting approval/mail/Telegram/CRM suites исполняют fixtures и dangerous-action contracts;
4. все 18 исходных JSON реально импортируются по группам в пустой Docker volume закреплённого n8n; фактический export содержит только placeholder credential references;
5. второй пустой volume получает очищенные portability staging copies: export содержит ровно 18 inactive workflow без credential references, а повторный business import сохраняет тот же ID set.

Temporary Docker volume удаляется даже при ошибке. Test использует `--pull=never`: другой или автоматически загруженный image не подменяет проверяемый pin.

## Что реально проверено, а что смоделировано

| Проверка | Тип evidence | Статус |
|---|---|---|
| JSON parse/schema, exact catalog, IDs, links, Sticky Notes, placeholders, secret/PII policy | static над реальными repository files | проверено автоматически |
| Миграции SQLite, exact-source import, sanitized import, export ID sets и повторный import | реальный CLI в двух чистых Docker volumes локального pinned n8n container | проверено автоматически |
| Code-node contracts и ожидаемые outputs четырёх demo | mock harness исполняет настоящий `jsCode`, но подменяет n8n context и external results | проверено автоматически как contract simulation |
| Approval gates, draft/test defaults, отсутствие direct outbound nodes в business workflows | static graph + mock contract execution | проверено автоматически |
| PostgreSQL/Compose linked import на production VPS | external integration | не проверено этой задачей; нужен VPS evidence |
| Telegram, IMAP, SMTP, CRM, Generic LLM, Yandex и GigaChat с реальными credentials | external smoke | не проверено; выполняется только с user-provided credentials по соответствующим guides |
| DNS, HTTPS, certificate, reboot persistence и provider availability | external/temporal | не проверено этой задачей |

Успех mock fixture не является заявлением об успешном внешнем API вызове. Для release evidence прикладывайте отдельный redacted smoke result, никогда не credentials, письма, customer payload или tokens.
