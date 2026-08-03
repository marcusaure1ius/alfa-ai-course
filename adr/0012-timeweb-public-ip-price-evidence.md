# ADR-0012: Датированное provider evidence для цены IPv4 при нулевом baseline

- Статус: Accepted
- Дата: 2026-08-01
- Supersedes: ADR-0008 и ADR-0009 только в части источника preview-цены нового
  floating IPv4 при отсутствии активного IP

## Context

Timeweb Public API endpoint `/api/v1/account/services/cost` документирован как
стоимость всех **активных** сервисов аккаунта. После терминального удаления
последнего floating IPv4 endpoint больше не содержит `floating_ip`, поэтому
безопасный preview следующего нового IP не может получить его цену из этого API.
Создание временного IP для выяснения цены само является платной mutation и
нарушает требование preview-before-mutation.

Официальная документация Timeweb, проверенная 2026-08-01, публикует стоимость
IPv4 180 ₽/месяц и почасовое списание. Цена меняется провайдером независимо от
кода платформы, поэтому бессрочное или зашитое в код значение недопустимо.

## Decision

- Цена активного floating IPv4 из `/api/v1/account/services/cost` имеет
  приоритет.
- Когда active-service API не возвращает цену, production может использовать
  `TIMEWEB_PUBLIC_IPV4_MONTHLY_ROUBLES` только вместе с
  `TIMEWEB_PUBLIC_IPV4_PRICE_VERIFIED_AT`.
- Значение вручную сверяется с официальной страницей
  `https://timeweb.cloud/docs/public-ip`, не является secret и не фиксируется в
  application code.
- Evidence действует семь суток. Некорректная сумма, дата из будущего или
  просроченная проверка дают `PUBLIC_IP_PRICE_NOT_CONFIGURED` до любой paid
  mutation.
- Provider price остаётся telemetry/preview, а окончательное решение о
  достаточности баланса и допустимости заказа принимает Timeweb по ADR-0008.

## Consequences

- Нулевой provider baseline больше не делает корректный create невозможным.
- Оператор должен не реже раза в семь суток повторно сверять официальную цену и
  обновлять timestamp; это осознанный fail-closed operational gate.
- Изменение официальной цены требует обновить production value до следующего
  create, но не требует code release.
- Платформа не скрейпит HTML Timeweb и не создаёт пробный тарифицируемый ресурс.

## Evidence

- [Официальная документация Timeweb по публичным IP](https://timeweb.cloud/docs/public-ip)
- [Официальный TypeScript SDK Timeweb](https://github.com/timeweb-cloud/sdk-typescript/blob/main/src/apis/PaymentsApi.ts)
- [ADR-0008](0008-provider-authoritative-timeweb-billing.md)
- [ADR-0009](0009-timeweb-deploy-configurator.md)
