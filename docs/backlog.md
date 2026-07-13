# MVP backlog

Статус: **одобрен владельцем 2026-07-13**. Реализация выполняется по dependency-ready задачам после обязательных research и architecture gates.

Projects Control — источник истины для полных Unified Task Packages, статусов и dependencies. Этот документ даёт review-friendly структуру.

## Эпики

| Epic | Назначение | Задачи |
|---|---|---|
| E01 | Product foundation и архитектурная рамка | T-0001 |
| E02 | Official research и финализация решений | research версий/лицензии, LLM/API, финальные ADR |
| E03 | Runtime stack, installer и diagnostics | Compose, install, doctor, security baseline |
| E04 | Operations и lifecycle | backup/restore, update/rollback, import/export/uninstall, lifecycle tests |
| E05 | LLM abstraction | generic gateway, Yandex, GigaChat, capability matrix/tests |
| E06 | Reusable integration workflows | shared core, Telegram, mail, CRM |
| E07 | Демонстрационные business workflows | 4 сценария, fixtures и import/contract tests |
| E08 | Документация участника и преподавателя | cloud/Quick Start, credentials, operations/security, handoff |
| E09 | Verification и MVP release | CI, Ubuntu E2E, usability trial, release evidence |

## Критический путь

```text
T-0001 foundation
  → official research + LLM research
  → final ADR baseline
  → Compose runtime
  → installer + doctor
  → lifecycle and integration layers
  → business workflows + documentation
  → disposable/real Ubuntu E2E
  → novice usability trial
  → release readiness review
```

## Unified Task Packages

Ниже указаны task key, краткое назначение и прямые `depends_on`. Полные поля UTP хранятся в Projects Control.

### E01 — Product foundation и архитектурная рамка

- `T-0001` — каноническая foundation-документация и MVP backlog; dependencies: нет.

### E02 — Official research и финализация решений

- `T-0002` — актуальные версии, deployment requirements и лицензия; depends on `T-0001`.
- `T-0003` — возможности n8n и API LLM/CRM providers; depends on `T-0001`.
- `T-0004` — evidence-backed ADR и contracts MVP; depends on `T-0002`, `T-0003`.

### E03 — Runtime stack, installer и diagnostics

- `T-0005` — pinned Docker Compose runtime; depends on `T-0004`.
- `T-0006` — безопасный `install.sh`; depends on `T-0005`.
- `T-0007` — `doctor.sh` и post-install validation; depends on `T-0006`.
- `T-0008` — security baseline и opt-in firewall; depends on `T-0006`.

### E04 — Operations и lifecycle

- `T-0009` — `backup.sh` и `restore.sh`; depends on `T-0006`.
- `T-0010` — `update.sh` и `rollback.sh`; depends on `T-0002`, `T-0006`, `T-0009`.
- `T-0011` — uninstall и workflow import/export; depends on `T-0006`.
- `T-0012` — destructive lifecycle verification; depends on `T-0007`–`T-0011` в соответствии с board relations.

### E05 — LLM abstraction

- `T-0013` — generic LLM Gateway и Connection Test; depends on `T-0003`, `T-0005`.
- `T-0014` — Yandex AI Studio adapter; depends on `T-0013`.
- `T-0015` — GigaChat adapter и OAuth lifecycle; depends on `T-0013`.
- `T-0016` — provider matrix, contract tests и guide; depends on `T-0014`, `T-0015`.

### E06 — Reusable integration workflows

- `T-0017` — approval, normalization, business log и shared errors; depends on `T-0013`.
- `T-0018` — Send Telegram Message; depends on `T-0017`.
- `T-0019` — provider-neutral mail layer; depends on `T-0017`.
- `T-0020` — generic CRM и example adapter; depends on `T-0003`, `T-0017`.

### E07 — Демонстрационные business workflows

- `T-0021` — Telegram assistant; depends on `T-0018`.
- `T-0022` — email assistant; depends on `T-0013`, `T-0019`.
- `T-0023` — lead handler; depends on `T-0013`, `T-0018`, `T-0020`.
- `T-0024` — daily executive digest; depends on `T-0017`, `T-0018`.
- `T-0025` — fixtures и clean-import contract tests; depends on `T-0011`, `T-0021`–`T-0024`.

### E08 — Документация участника и преподавателя

- `T-0026` — Quick Start, Timeweb, Yandex Cloud и DNS; depends on `T-0007`, `T-0008`.
- `T-0027` — credentials и integrations guides; depends on `T-0016`, `T-0018`–`T-0020`.
- `T-0028` — operations, security и troubleshooting; depends on `T-0012`.
- `T-0029` — handoff, instructor guide и license notes; depends on `T-0002`, `T-0025`–`T-0028`.

### E09 — Verification и MVP release

- `T-0030` — static и integration quality gates; depends on `T-0012`, `T-0025`.
- `T-0031` — Ubuntu 24.04 end-to-end verification; depends on `T-0029`, `T-0030`.
- `T-0032` — novice usability trial 15–30 минут; depends on `T-0031`.
- `T-0033` — release readiness evidence; depends on `T-0031`, `T-0032`.

## Правила декомпозиции

- Каждая task в Projects Control содержит context, expected outcome, scope, out of scope, risks, observable acceptance criteria, documentation outcome и явные dependencies.
- Research отделён от implementation, чтобы изменчивые версии/API/license claims имели dated evidence.
- Destructive проверки backup/restore и update/rollback выделены в отдельную задачу.
- External tests с доменом, VPS и credentials не подменяются mocks; локально возможная работа выполняется раньше.
- Epic progress вычисляется Projects Control; вручную эпики не закрываются.

## Approval decision

Владелец может:

1. одобрить backlog без изменений;
2. запросить изменение scope, порядка или granularity;
3. отложить часть эпиков за пределы MVP.

Решение владельца: backlog одобрен без изменений 2026-07-13. Первые исполняемые задачи — `T-0002` и `T-0003`; runtime implementation начинается после `T-0004`.
