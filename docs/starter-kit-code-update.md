# Обновление кода starter kit на развёрнутом хосте

Проверено: 2026-08-12.

Этот документ описывает, как довезти исправление **кода** starter kit до уже
развёрнутого хоста без потери данных, secrets и Docker volumes. Версию **n8n**
обновляет отдельная процедура `scripts/update.sh`; данные живут в volumes и
кодом не затрагиваются.

## Принцип

Логика обновления едет в **новом релизе**, а не лежит на хосте. Bootstrap
нового релиза при флаге `N8N_BOOTSTRAP_UPDATE_CODE=1` распаковывает свой
проверенный по SHA-256 архив и запускает из него `scripts/update-code.sh`.
Поэтому путь работает и для хостов, развёрнутых до появления этой процедуры:
хосту не нужно ничего, кроме самой установки с `.release-commit`.

Флаг понимает bootstrap релизов, собранных начиная с задачи T-0130 — то есть
первый пригодный релиз следующий после `v0.1.12`. Артефакт `v0.1.12` и старше
обновлять код не умеет: его bootstrap остановится с прежней ошибкой.

Что заменяется и что сохраняется:

- **заменяется** всё, что поставляет релиз: скрипты, конфиги, workflow JSON,
  документация;
- **сохраняется** всё, чего в новом релизном дереве нет: `.env`, `backups/`,
  `.lifecycle/` и любые другие записи установки. Правило намеренно без
  перечня имён: неизвестная запись переносится, а не теряется;
- **не затрагиваются** Docker volumes (`n8n_postgres_data`, `n8n_data`,
  `n8n_caddy_data`, `n8n_caddy_config`): имя Compose-проекта закреплено в
  `docker-compose.yml`, поэтому замена каталога кода на них не влияет.

## Порядок обновления

Перед первым применением новой версии процедуры — репетиция на одноразовой
среде, никогда сразу на боевом хосте:

```bash
work_root="$(mktemp -d "${TMPDIR:-/tmp}/t0130.XXXXXX")"
printf 'T-0130-DISPOSABLE\n' > "$work_root/.t0130-disposable"
./tests/code_update_rehearsal.sh --work-root "$work_root" --confirm-disposable T-0130-DISPOSABLE
```

На хосте (замените версию на актуальный закреплённый релиз из
[docs/release-publication.md](release-publication.md)):

```bash
release_url="https://github.com/marcusaure1ius/alfa-ai-course/releases/download/<VERSION>"
curl -fsSLO "$release_url/install.sh"
curl -fsSLO "$release_url/install.sh.sha256"
sha256sum -c install.sh.sha256
N8N_BOOTSTRAP_VERIFY_ONLY=1 sh install.sh
```

Ожидаемо: `install.sh: OK`, затем `[PASS] Release <commit> проверен по SHA-256`
и `[PASS] Verify-only завершён без изменений системы`.

Само обновление — одно явное действие:

```bash
sudo env N8N_BOOTSTRAP_UPDATE_CODE=1 sh install.sh
```

Ожидаемый ход: `[PASS] Release ... проверен по SHA-256` → `[PASS] Backup кода:
...` → `[PASS] Код обновлён: <старый> -> <новый>` → итоговые строки
`UPDATED_FROM_COMMIT`, `UPDATED_TO_COMMIT`, `CODE_BACKUP_ARCHIVE`,
`PREVIOUS_CODE_TREE` → перезапуск найденных Compose-проектов установки →
`[PASS] doctor.sh --local-only после обновления без FAIL`. Итоговые строки
печатаются до перезапуска намеренно: если перезапуск или doctor упадут, пути
отката уже выведены.

Перезапуск воспроизводит **исходный запуск** проекта: config-файлы и
env-файлы берутся из label работающих контейнеров (боевой платформенный
профиль запускается с двумя env-файлами — `.env` и `.env.platform`), поэтому
скрипту не нужно знать их состав заранее. Сервисы, у которых есть bind-mount
из дерева установки (например Caddy с его конфигом), пересоздаются
принудительно: после замены каталога их контейнеры держат inode прежних
файлов, и без пересоздания новый конфиг не применился бы. Сервисы без таких
mount не пересоздаются.

Перезапуск не ходит в сеть (`--pull never`): стек уже работает на нужных
образах. Если новый релиз меняет закреплённый образ, перезапуск остановится с
понятной ошибкой — скачивание образов выполняется отдельной явной операцией,
как при обновлении версии n8n через `scripts/update.sh`.

Проверка результата:

```bash
cat /opt/n8n-entrepreneur-starter-kit/.release-commit
```

Ожидаемо: commit нового релиза — тот же, что печатал bootstrap. Состояние
контейнеров:

```bash
sudo docker compose --project-directory /opt/n8n-entrepreneur-starter-kit ps
```

## Уборка после проверки

Прежнее дерево кода остаётся рядом с установкой
(`PREVIOUS_CODE_TREE` в выводе, имя вида
`n8n-entrepreneur-starter-kit.pre-update-<ts>`) — это материал для отката.
После того как хост проверен, удалите его вручную:

```bash
sudo rm -rf -- "<PREVIOUS_CODE_TREE из вывода>"
```

Архивы в `backups/pre-code-update/` удаляются по мере ненадобности так же
вручную.

## Откат

Код возвращается заменой каталога на сохранённое дерево; данные и volumes
откат не затрагивает:

```bash
cd "$(dirname /opt/n8n-entrepreneur-starter-kit)"
sudo mv /opt/n8n-entrepreneur-starter-kit n8n-entrepreneur-starter-kit.failed
sudo mv "<PREVIOUS_CODE_TREE из вывода>" /opt/n8n-entrepreneur-starter-kit
sudo mv n8n-entrepreneur-starter-kit.failed/.env /opt/n8n-entrepreneur-starter-kit/.env 2>/dev/null || true
sudo docker compose --project-directory /opt/n8n-entrepreneur-starter-kit up -d --wait
```

Внимание: `.env`, `backups/` и `.lifecycle/` при обновлении переезжают в новое
дерево, поэтому при откате их нужно перенести обратно из неудавшегося дерева —
первая команда `mv` для `.env` в примере выше; для `backups/` и `.lifecycle/`
аналогично, если они там есть.

## Отказы, которые являются нормой

Каждый из этих случаев останавливается **до** каких-либо изменений:

- повреждённый или подменённый артефакт — bootstrap падает на сверке SHA-256;
- запуск без `N8N_BOOTSTRAP_UPDATE_CODE=1` при несовпадении релиза — прежняя
  защита: код поверх данных автоматически не заменяется;
- установка без `.release-commit` — она создана не one-command installer, и
  для неё нужен отдельный migration path, а не обновление кода;
- совпадающий commit — обновлять нечего, скрипт явно сообщает об этом.

Негативные сценарии закреплены проверками: `tests/code_update_test.sh`
(без Docker, входит в static gates) и `tests/code_update_rehearsal.sh`
(живая репетиция на одноразовой среде).
