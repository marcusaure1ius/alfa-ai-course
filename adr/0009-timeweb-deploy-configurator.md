# ADR-0009: Live Timeweb deploy configurator и граница Ubuntu 26.04

- Статус: Accepted
- Дата: 2026-07-30
- Supersedes: ADR-0005 и ADR-0006 только в части фиксированного Ubuntu 24.04
  provisioning preview первого provider-среза

## Context

Фиксированный smoke-план выбирал самый дешёвый объект публичного preset catalog.
В catalog остаются legacy presets без отдельного `orderable` flag, поэтому такой
алгоритм мог выбрать тариф, которого уже нет в панели. Владелец запросил простой
deploy service с теми же Premium NVMe конфигурациями, что показаны в Timeweb:
Москва, Амстердам или Франкфурт, live OS catalog, автобэкап и публичный IPv4.

Одновременно root starter kit проверен только на Ubuntu 24.04. Его installer,
Docker pins и n8n readiness нельзя автоматически считать совместимыми с Ubuntu
26.04.

## Decision

Первый provider-срез платформы создаёт **чистый VPS**, а установку starter kit
оставляет отдельным следующим этапом.

- UI получает нормализованный catalog только через server-side adapter.
- Поддерживаются зоны `msk-1`, `ams-1`, `fra-1`.
- Premium NVMe определяется allowlist сочетанием region, текущего product tag
  (`msk_nvme`, `nl_base`, `fra_nvme`), `site`/`cp` и пяти утверждённых resource
  shapes. Provider IDs и цены не закрепляются.
- Образы Ubuntu читаются из `/api/v1/os/servers`; Ubuntu 26.04 x86_64 является
  default, но ID не закрепляется.
- IPv4 всегда включён в первом релизе: он резервируется до VPS, входит в preview
  цены и удаляется ownership-guarded cleanup.
- Автобэкап — явный переключатель. После готовности сервера adapter находит
  единственный системный диск и отправляет allowlisted `PATCH` настроек:
  еженедельно, одна сохраняемая копия. Выключенное состояние также применяется
  явно.
- Выбор сохраняется в `timeweb-provisioning-v3` durable snapshot. Перед каждой
  платной mutation catalog и цена проверяются повторно.
- Balance не является client-side gate согласно ADR-0008.

## Compatibility boundary

Ubuntu 26.04 в deploy configurator означает только поддержанный Timeweb image для
чистого VPS. Это не расширяет support matrix root starter kit. Платформа не
передаёт старый `cloud-init`, не создаёт DNS и не заявляет готовность n8n в этом
deploy flow. Автоматическая установка starter kit на Ubuntu 26.04 требует
отдельной задачи с version pins и реальным end-to-end evidence.

Ubuntu 24.04 root installer, Compose runtime и все существующие проверки вне
`platform/` остаются без изменений.

## Consequences

- Сервер становится `active`, когда Timeweb подтвердил VPS, привязанный IPv4 и
  выбранные настройки автобэкапа; это не означает, что n8n установлен.
- Region capacity и provider price могут измениться между UI preview и create.
  В этом случае operation останавливается как stale plan и требует нового
  preview.
- Product-tag allowlist необходимо обновить отдельным изменением, если Timeweb
  переименует линейку.
- Стоимость автобэкапа показывается как provider unit price `6 ₽/ГБ за
  существующую копию`, а не прибавляется к фиксированной месячной цене VPS.

## Evidence

- [Timeweb API](https://timeweb.cloud/api-docs)
- [Timeweb backups](https://timeweb.cloud/docs/cloud-servers/manage-servers/backup)
- [Требования платформы](../docs/course-platform-requirements.md)
- [Архитектура](../docs/architecture.md)
- [ADR-0008](0008-provider-authoritative-timeweb-billing.md)
