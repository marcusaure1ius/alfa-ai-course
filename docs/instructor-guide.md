# Instructor guide

Проверено: 2026-07-14. Дополнено 2026-07-15. Цель преподавателя — довести участника до самостоятельного владения системой, не становясь хранителем его secrets или постоянным оператором VPS. Отдельный общий стенд преподавателя разворачивается по короткой инструкции [на `neurokurs.ru`](instructor-setup.md); он не заменяет самостоятельный participant flow.

## Две разные среды

| Среда | Назначение | Допустимые данные | Что она доказывает |
|---|---|---|---|
| Local disposable demo | показать install/backup/restore/update mechanics и безопасно повторять ошибки | только synthetic fixtures и временные credentials | scripts, contracts и container lifecycle на указанном host |
| Participant VPS | реальный DNS, HTTPS, owner access и user-provided integrations | secrets вводит только участник | только фактически выполненные проверки этого VPS |

Local demo не доказывает Ubuntu host lifecycle, cloud firewall, public DNS/ACME, reboot persistence или provider API. Participant VPS нельзя объявлять успешным по результатам demo.

## Подготовка до занятия

1. Проверить актуальный dependency-ready backlog и release notes; не менять pins во время урока без отдельной задачи.
2. На local disposable environment выполнить `make quality` и сохранить redacted summary.
3. Проверить наличие exact images и свободных ресурсов; не использовать `latest`.
4. Подготовить synthetic demo accounts/fixtures, которые можно удалить после занятия.
5. Открыть [Quick Start](quick-start.md), [Troubleshooting](troubleshooting.md), [handoff checklist](participant-handoff.md) и [license notes](../LICENSE-NOTES.md).
6. Объяснить участнику до начала, что он вводит credentials сам и не пересылает их преподавателю.

## Рекомендуемый ход интенсива

### 1. Ownership и границы

Участник создаёт provider account, VPS и SSH key под своим контролем. Собственный домен не требуется: стартовый адрес создаёт installer. Преподаватель показывает действия, но не регистрирует ресурсы на свой email, не подключает свой домен и не просит recovery codes.

Checkpoint: participant самостоятельно входит в provider console и открывает новую SSH-сессию.

### 2. Установка

Участник следует Quick Start, читает каждый preflight result и сам подтверждает opt-in firewall. При ошибке используется symptom → check → solution, а не произвольные команды из чата.

Checkpoint: local doctor не имеет `FAIL`; полный doctor отдельно фиксирует фактические DNS/HTTPS/certificate статусы.

### 3. Credentials и workflows

Участник создаёт credentials только в n8n UI. Screen share останавливается на момент показа secret или используется скрытое поле; значения не диктуются и не копируются в chat. Сначала выполняется Connection Test, затем safe/test-mode smoke, и лишь после этого осознанная activation.

Checkpoint: workflow использует participant credential reference, экспорт не содержит credential values, опасные действия остаются approval-bound.

### 4. Operations и recovery

Участник запускает backup, находит archive/checksum и переносит их в собственное off-host storage. Преподаватель объясняет destructive rehearsal на disposable target; production restore без согласованного окна не выполняется ради демонстрации.

Checkpoint: participant может открыть backup/restore и update/rollback procedures и назвать recovery owner.

### 5. Handoff

Участник проходит каждый observable пункт [participant handoff](participant-handoff.md). Временный instructor access удаляется до завершения занятия.

Checkpoint: запись имеет `READY` либо `NOT READY` с конкретным gap; статус без evidence запрещён.

## Безопасная поддержка

- Просите redacted doctor output и точный check key, а не `.env` или полный log.
- Пусть participant сам выполняет команды и подтверждает destructive action.
- Для provider UI используйте screen share без secret fields; не принимайте passwords/API keys в мессенджере.
- Если secret раскрыт, остановите демонстрацию, ротируйте secret, проверьте новый credential и отзовите старый.
- Не оставляйте instructor SSH key, n8n user, provider role, exported workflow data или local backup после handoff.
- Не обещайте vendor support contract: scope курса — документация и проверяемый starter kit.

## Диагностический протокол занятия

1. Зафиксировать симптом и среду: local demo или participant VPS.
2. Запустить read-only doctor и записать exit code/check keys.
3. Выбрать ровно один сценарий Troubleshooting.
4. Перед mutation назвать backup/rollback path и получить participant confirmation.
5. Повторить исходную проверку и записать observable result.
6. Если external condition недоступен, отметить `not-tested`, а не симулировать PASS.

## Release и следующий поток

Перед каждым public release или новым cohort instructor/release owner обязан:

1. заново проверить official n8n license/FAQ, security notices и exact component releases;
2. выполнить quality gates на чистом commit и отдельно перечислить внешние проверки;
3. обновить `CHANGELOG.md` или release notes: exact pins, user-visible changes, migration/recovery steps, checks performed и known gaps;
4. проверить, что starter kit имеет явный `LICENSE`, notices/attribution и не включает vendor binaries или participant data;
5. выполнить novice trial без устных подсказок и зафиксировать время/блокеры отдельным evidence;
6. не переносить реальные credentials, backups или screenshots из предыдущего cohort.

Пока отдельный `LICENSE` для оригинальных файлов starter kit не выбран, публичное распространение и заявления о праве на redistribution блокируются согласно [LICENSE-NOTES](../LICENSE-NOTES.md).

## Завершение занятия

- [ ] Participant checklist заполнен observable results.
- [ ] Instructor access и временные invitations удалены.
- [ ] Local synthetic environment и временные artifacts очищены ownership-safe способом.
- [ ] Никакие secrets/PII не остались в recordings, chat, terminal history или support notes.
- [ ] Open gaps имеют владельца, следующее действие и критерий завершения.
