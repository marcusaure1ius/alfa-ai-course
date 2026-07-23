# Quality gates

## Одна локальная команда

```bash
make quality
```

Прямой эквивалент для automation и acceptance checks:

```bash
./tests/run-tests.sh
```

Команда запускает все доступные static и integration gates, возвращает non-zero при любом `FAIL` и печатает путь к redacted evidence artifacts. Если optional prerequisite недоступен локально, соответствующий gate получает `SKIP` с причиной. CI использует строгий профиль:

```bash
make quality-ci
```

В CI отсутствие ShellCheck, Docker daemon или pinned images считается `FAIL`, а artifacts загружаются даже после ошибки.

## Матрица

| Gate | Local/CI command | Что проверяет | Требования | Результат без среды |
|---|---|---|---|---|
| `shell-syntax` | `bash -n` через runner | синтаксис всех shell scripts/tests | Bash | `FAIL` |
| `shellcheck` | `shellcheck --severity=warning -x` | shell errors и warnings | optional локально, обязателен в CI | local `SKIP`, CI `FAIL` |
| `compose-config` | `tests/compose_config_test.sh` | resolved Compose, exact images, amd64 и private topology | Docker Compose CLI, jq | `FAIL` |
| `secret-scan` | `tests/secret_scan.sh` и fixture test | private keys, AWS/GitHub tokens и credential assignments без вывода значений | Node.js | `FAIL` |
| `static-tests` | `tests/run_static_tests.sh` | все существующие contract/unit/doc tests без integration duplication | Bash, Node.js, jq, Compose CLI | `FAIL` |
| `workflow-import` | `tests/workflow_catalog_test.sh` | beginner UX gate и clean import 20 workflow в pinned n8n | Docker daemon, exact n8n image | local `SKIP`, CI `FAIL` |
| `postgres-health` | `tests/postgres_integration_test.sh` | pinned n8n↔PostgreSQL health, schema и persistence после restart | Docker daemon, exact n8n/PostgreSQL images | local `SKIP`, CI `FAIL` |
| `artifact-secret-scan` | runner | итоговые log/summary не содержат secret-like material | Node.js | `FAIL` |
| `destructive-lifecycle` | только marker-команда из [dated report](../docs/reports/2026-07-14-destructive-lifecycle.md) | backup/delete/restore, update/rollback, uninstall/restart | явно disposable Docker target | всегда `SKIP` в общем runner |
| `external-smoke` | отдельный VPS evidence flow | DNS/HTTPS/certificate, provider credentials и reboot | реальный disposable Ubuntu VPS | всегда `SKIP` в local/CI runner |

## Artifacts

По умолчанию local runner создаёт уникальный каталог `test-results/quality/<UTC>-<pid>/`:

- `summary.txt` — PASS/FAIL/SKIP по каждому gate и причины;
- `quality-gates.log` — command output без resolved env/secrets;
- `checksums.sha256` — hashes marker, log и summary;
- `.quality-gates-artifact` — marker управляемого artifact directory.

Перед созданием checksums runner сканирует artifacts тем же secret scanner. Scanner выводит только rule, filename и line; найденное значение никогда не печатается. `test-results/` исключён из Git.

## CI

`.github/workflows/quality-gates.yml` работает на Ubuntu 24.04, устанавливает ShellCheck/jq, заранее загружает exact integration images, выполняет `make quality-ci` и через `if: always()` сохраняет только проверенный artifact directory. Workflow не получает repository secrets и не выполняет DNS, public HTTPS, provider calls, reboot или destructive rehearsal.
