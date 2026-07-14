# Destructive lifecycle rehearsal — 2026-07-14

## Итог

**PASS (9/9)** для локального disposable rehearsal с реальными pinned containers. Подтверждены backup → полное удаление PostgreSQL database → restore, approved update `2.29.9 → 2.29.10`, restore-based rollback `2.29.10 → 2.29.9` и data-preserving uninstall → restart. На каждом этапе совпали exact hashes synthetic workflow, encrypted credential row и контрольное значение database.

Это не VPS evidence. Rehearsal выполнен в Docker Desktop на Darwin arm64; application containers работали как `linux/amd64`. Для host-части post-operation doctor использовались repository fixtures Ubuntu 24.04/x86_64 и ресурсов, поэтому host OS, DNS, public HTTPS, certificate и reboot на реальном VPS остаются непроверенными.

## Команда воспроизведения

Harness намеренно не запускается одной командой без предохранителя:

```bash
work_root="$(mktemp -d "${TMPDIR:-/tmp}/t0012.XXXXXX")"
printf 'T-0012-DISPOSABLE\n' > "$work_root/.t0012-disposable"
./tests/destructive_lifecycle_rehearsal.sh \
  --work-root "$work_root" \
  --confirm-disposable T-0012-DISPOSABLE
```

До первого обращения к Docker harness требует точную confirmation phrase, canonical temporary path и marker. Он отказывается работать при существующих containers Compose-проекта `n8n-starter-kit`, volumes `n8n_*` или networks `n8n_frontend`/`n8n_backend`, а также при отсутствии локальных pinned images. Cleanup разрешён только для containers, чей Compose working directory совпадает с созданной временной копией.

## Среда

| Параметр | Фактически проверено |
|---|---|
| Дата | `2026-07-14` |
| Host | Darwin arm64, Docker Desktop; не Ubuntu VPS |
| Docker | client `29.4.3`, server `29.2.1` |
| Docker Compose | `5.1.3` |
| n8n source | `2.29.9`, digest `sha256:e0d9593724e36d2584a1686148155e881233b38ae1833101c97c6463c0d36711` |
| n8n target | `2.29.10`, digest `sha256:9cb60554716a0ab11a966e79ed65171e1bbf00b6d262ba12aa119bba22eb6000` |
| PostgreSQL | `17.10-bookworm`, digest `sha256:cacdc53e3b6e247307efda28b8bf9d96155249c527544ed8efff7e6427446fdb` |
| Caddy | `2.11.4-alpine`, digest `sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648` |
| Doctor host inputs | repository fixtures Ubuntu 24.04, x86_64, 4 GiB RAM и 40 GiB disk; не реальный host check |

Images использовались по exact tags с `--pull never` при первоначальном старте. `update.sh` выполнил собственный exact target pull согласно production procedure.

## Проверенный сценарий

| № | Действие и assertion | Результат |
|---:|---|---|
| 1 | Exact phrase, marker, temporary root; отсутствие fixed-name Docker resources | PASS до mutation |
| 2 | Старт полного Compose stack на n8n `2.29.9` с `--pull never`; три container health checks | PASS |
| 3 | Создание synthetic owner; import workflow и synthetic HTTP Header Auth credential через pinned n8n CLI | PASS |
| 4 | `backup.sh`; internal payload checksums и outer archive checksum | PASS |
| 5 | Stop n8n/Caddy, `dropdb --force`, создание пустой database, `restore.sh`; повторная проверка exact state | PASS |
| 6 | `update.sh --to 2.29.10`, проверка state; `rollback.sh`, проверка версии `2.29.9` и state | PASS |
| 7 | `uninstall.sh` без `--delete-data`; наличие всех четырёх volumes, повторный Compose start и state assertions | PASS |
| 8 | Порча копии archive после записи ожидаемого sidecar; restore отказал на outer checksum до mutation | PASS |
| 9 | Secret scan redacted artifacts, checksum manifest verification и ownership-safe cleanup | PASS |

В credential fixture использовался только случайный synthetic sentinel. n8n CLI зашифровал object при import; database `data` не содержал sentinel. После restore, update, rollback и restart credential временно расшифровывался **только внутри disposable container**, сравнивался с sentinel и сразу удалялся. Decrypted credential не копировался на host и не попадал в logs/artifacts.

## Exact assertions

| Artifact/state | SHA-256 |
|---|---|
| Workflow row (`id`, `name`, `nodes`, `connections`, `settings`) | `e4f0858e097662eede353fe9641fad6cf85dca158114e255d0b23a561d739470` |
| Encrypted credential row (`id`, `name`, `type`, encrypted `data`) | `10777dcc76b661114efab954ceac8a2b815f55d5680bc95cdb8d4762eedf3077` |
| Initial recovery archive | `4d0d7f092455bbae740cb0e0863533d4436e2114d9cc731269b851ec4e627994` |
| Evidence checksum manifest | `a337d42077fdde3de6c710fd0400cfbf8412f4ab3202871d08aa9f8df7979cf0` |

Контрольная database row `seed → T0012-PROBE-V1` проверялась вместе с двумя hashes. Значения совпали после restore, update, rollback и uninstall/restart.

Sanitized evidence manifest:

```text
ff9a5c10a7fc28fdb4601cb35343921b50046d65eeff3dff293cb961fc95f94b  environment.txt
72559dd9a9e7893af86722bc6e07643992f415e40efe5e662583551044dbd9da  failure-injection.log
ac4e170e37c1ce2201d15630adadc815ce3206faf86c0ab114af109e4fb58817  summary.txt
```

Failure injection log содержал только:

```text
sha256sum: WARNING: 1 computed checksum did NOT match
[FAIL] Outer archive checksum mismatch.
```

Проверка подтвердила отсутствие PostgreSQL password, `N8N_ENCRYPTION_KEY`, owner password и credential sentinel во всех сохраняемых evidence artifacts. Backup archives содержали secrets, оставались mode `0600` внутри временной копии и были удалены cleanup вместе с ней.

## Что не проверено

`vpsDnsHttpsExternal=not-tested`:

- чистый Ubuntu 24.04 LTS x86_64 VPS и systemd/Docker host lifecycle;
- реальный DNS, ACME certificate и public HTTPS;
- reboot persistence на VPS;
- реальные пользовательские credentials или external SaaS API;
- remote backup transport/storage и восстановление после физической потери VPS;
- novice timing и production data volume.

Для этих утверждений нужен отдельный rehearsal на явно disposable VPS с внешним evidence. Локальный PASS нельзя использовать как подтверждение этих пунктов.
