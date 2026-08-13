#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
UPDATER="$ROOT/scripts/update-code.sh"
BUILDER="$ROOT/scripts/build-one-command-installer.sh"
REHEARSAL="$ROOT/tests/code_update_rehearsal.sh"
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

fingerprint() {
  (cd "$1" && find . -type f | LC_ALL=C sort | xargs -I{} sha256sum {} | sha256sum | awk '{print $1}')
}

bash -n "$UPDATER"
bash -n "$BUILDER"
bash -n "$REHEARSAL"
[[ -x "$UPDATER" ]] || fail 'update-code.sh is not executable'
help_output="$("$UPDATER" --help)"
[[ "$help_output" == *'docs/starter-kit-code-update.md'* ]] \
  || fail 'updater help does not point to the operational document'
[[ "$help_output" == *'N8N_BOOTSTRAP_UPDATE_CODE=1'* ]] \
  || fail 'updater help does not mention the bootstrap flag'
ok 'scripts syntax and update contract in help'

# Функциональные проверки идут на синтетическом релизном repo, чтобы тест не
# зависел от того, закоммичен ли рабочий каталог: builder собирает артефакт из
# git archive, поэтому ему нужен настоящий commit.
release_repo="$tmp/release-repo"
mkdir -p "$release_repo/scripts"
printf '#!/bin/sh\nprintf "STUB-INSTALLER-RAN\\n"\n' > "$release_repo/scripts/install.sh"
chmod 0755 "$release_repo/scripts/install.sh"
cat > "$release_repo/scripts/doctor.sh" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" > "$(dirname "$0")/../.doctor-invoked"
EOF
chmod 0755 "$release_repo/scripts/doctor.sh"
cp "$UPDATER" "$release_repo/scripts/update-code.sh"
cp "$BUILDER" "$release_repo/scripts/build-one-command-installer.sh"
printf 'name: n8n-starter-kit\nservices: {}\n' > "$release_repo/docker-compose.yml"
printf 'NEW\n' > "$release_repo/VERSION-MARKER"
git -C "$release_repo" init -q
git -C "$release_repo" -c user.email=t0130@example.invalid -c user.name=T0130 add -A
git -C "$release_repo" -c user.email=t0130@example.invalid -c user.name=T0130 commit -qm 'synthetic release'
new_commit="$(git -C "$release_repo" rev-parse HEAD)"

artifact="$tmp/install.sh"
"$release_repo/scripts/build-one-command-installer.sh" --ref HEAD --output "$artifact" >/dev/null
grep -q 'N8N_BOOTSTRAP_UPDATE_CODE' "$artifact" || fail 'artifact has no code-update branch'
grep -q 'scripts/update-code.sh' "$artifact" || fail 'artifact does not delegate to update-code.sh'
grep -q 'docs/starter-kit-code-update.md' "$artifact" || fail 'artifact refusal does not cite the document'
grep -q -- '--release-commit' "$artifact" || fail 'artifact does not pass release commit to updater'
ok 'bootstrap artifact carries the code-update path'

new_tree="$tmp/new-tree"
mkdir -p "$new_tree"
git -C "$release_repo" archive --format=tar HEAD | tar -x -C "$new_tree"

make_install_root() {
  local root="$1" commit="$2"
  rm -rf -- "$root"
  mkdir -p "$root/scripts" "$root/backups" "$root/.lifecycle"
  printf '#!/bin/sh\nprintf "OLD-INSTALLER\\n"\n' > "$root/scripts/install.sh"
  chmod 0755 "$root/scripts/install.sh"
  printf 'OLD\n' > "$root/VERSION-MARKER"
  printf '%s\n' "$commit" > "$root/.release-commit"
  printf 'N8N_HOST=t0130.localhost\nPOSTGRES_PASSWORD=fixture-password-not-a-secret\n' > "$root/.env"
  chmod 0600 "$root/.env"
  printf 'keep\n' > "$root/backups/keep.txt"
  printf 'STATE=1\n' > "$root/.lifecycle/state.env"
  printf 'note\n' > "$root/custom-state.txt"
}

old_commit='1111111111111111111111111111111111111111'
install_root="$tmp/opt/starter-kit"
make_install_root "$install_root" "$old_commit"
env_before="$(sha256sum "$install_root/.env" | awk '{print $1}')"

update_output="$("$UPDATER" --source "$new_tree" --release-commit "$new_commit" \
  --install-root "$install_root" --yes --skip-restart 2>&1)"
[[ "$update_output" == *"UPDATED_TO_COMMIT=$new_commit"* ]] || fail 'update did not report new commit'
[[ "$(cat "$install_root/.release-commit")" == "$new_commit" ]] || fail '.release-commit not updated'
[[ "$(cat "$install_root/VERSION-MARKER")" == NEW ]] || fail 'code files were not replaced'
[[ -x "$install_root/scripts/update-code.sh" ]] || fail 'new tree lost update-code.sh'
[[ "$(sha256sum "$install_root/.env" | awk '{print $1}')" == "$env_before" ]] || fail '.env changed during update'
env_mode="$(stat -c '%a' "$install_root/.env" 2>/dev/null || stat -f '%Lp' "$install_root/.env")"
[[ "$env_mode" == 600 ]] || fail '.env mode is not 0600 after update'
[[ -f "$install_root/backups/keep.txt" ]] || fail 'backups/ was not carried over'
[[ -f "$install_root/.lifecycle/state.env" ]] || fail '.lifecycle was not carried over'
[[ -f "$install_root/custom-state.txt" ]] || fail 'unknown state entry was not carried over'
ok 'code updated in place while every state entry survived'

previous_tree="$(printf '%s\n' "$update_output" | awk -F= '$1 == "PREVIOUS_CODE_TREE" {print $2; exit}')"
[[ -d "$previous_tree" ]] || fail 'previous code tree was not kept'
[[ "$(cat "$previous_tree/VERSION-MARKER")" == OLD ]] || fail 'previous tree does not hold old code'
backup_archive="$(printf '%s\n' "$update_output" | awk -F= '$1 == "CODE_BACKUP_ARCHIVE" {print $2; exit}')"
[[ -f "$backup_archive" && -f "$backup_archive.sha256" ]] || fail 'code backup archive or checksum missing'
(cd "$(dirname "$backup_archive")" && sha256sum -c "$(basename "$backup_archive").sha256" >/dev/null) \
  || fail 'code backup checksum does not verify'
tar -tzf "$backup_archive" | grep -q 'VERSION-MARKER' || fail 'backup misses code files'
! tar -tzf "$backup_archive" | grep -q '/backups/' || fail 'backup recursively includes backups/'
ok 'rollback material exists: previous tree and verified code backup'

noop_output="$("$UPDATER" --source "$new_tree" --release-commit "$new_commit" \
  --install-root "$install_root" --yes --skip-restart 2>&1)"
[[ "$noop_output" == *'обновление не требуется'* ]] || fail 'same-commit update is not a no-op'
ok 'same-commit update is an explicit no-op'

# Негативные сценарии: каждый обязан остановиться ДО каких-либо изменений.
foreign_root="$tmp/opt/foreign"
mkdir -p "$foreign_root/scripts"
printf '#!/bin/sh\n' > "$foreign_root/scripts/install.sh"
chmod 0755 "$foreign_root/scripts/install.sh"
before="$(fingerprint "$foreign_root")"
if "$UPDATER" --source "$new_tree" --release-commit "$new_commit" \
  --install-root "$foreign_root" --yes --skip-restart >"$tmp/no-marker.log" 2>&1; then
  fail 'install without .release-commit was accepted'
fi
grep -q 'migration path' "$tmp/no-marker.log" || fail 'refusal does not explain the migration boundary'
[[ "$(fingerprint "$foreign_root")" == "$before" ]] || fail 'refused update still mutated the tree'
ok 'installation without .release-commit is refused before changes'

dirty_source="$tmp/dirty-source"
cp -R "$new_tree" "$dirty_source"
printf 'X=1\n' > "$dirty_source/.env"
if "$UPDATER" --source "$dirty_source" --release-commit "$new_commit" \
  --install-root "$install_root" --yes --skip-restart >/dev/null 2>&1; then
  fail 'source tree with .env was accepted as a release'
fi
ok 'source tree carrying .env is rejected as not a clean release'

mismatch_root="$tmp/opt/mismatch"
make_install_root "$mismatch_root" "$old_commit"
before="$(fingerprint "$mismatch_root")"
set +e
mismatch_output="$(N8N_KIT_INSTALL_ROOT="$mismatch_root" sh "$artifact" 2>&1)"
mismatch_code=$?
set -e
[[ "$mismatch_code" -ne 0 ]] || fail 'bootstrap accepted mismatched release without the update flag'
[[ "$mismatch_output" == *'N8N_BOOTSTRAP_UPDATE_CODE=1'* ]] \
  || fail 'bootstrap refusal does not name the update flag'
[[ "$mismatch_output" == *'docs/starter-kit-code-update.md'* ]] \
  || fail 'bootstrap refusal does not cite the document'
[[ "$(fingerprint "$mismatch_root")" == "$before" ]] || fail 'bootstrap refusal still mutated the install'
ok 'mismatched release without the flag is refused and points to the guide'

tampered="$tmp/tampered.sh"
cp "$artifact" "$tampered"
python3 - "$tampered" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
data = path.read_text()
marker = "N8N_KIT_PAYLOAD'\n"
start = data.index(marker) + len(marker)
replacement = "A" if data[start] != "A" else "B"
path.write_text(data[:start] + replacement + data[start + 1:])
PY
before="$(fingerprint "$mismatch_root")"
set +e
tampered_output="$(N8N_KIT_INSTALL_ROOT="$mismatch_root" N8N_BOOTSTRAP_UPDATE_CODE=1 sh "$tampered" 2>&1)"
tampered_code=$?
set -e
[[ "$tampered_code" -ne 0 ]] || fail 'tampered artifact was accepted in update mode'
[[ "$tampered_output" == *'Checksum'* || "$tampered_output" == *'invalid input'* ]] \
  || fail 'tampered artifact failure is not explicit'
[[ "$(fingerprint "$mismatch_root")" == "$before" ]] \
  || fail 'tampered artifact still mutated the install'
ok 'corrupted artifact in update mode stops before any changes'

# Same-commit rerun доходит до install.sh через root_run; вне root это sudo,
# поэтому тест подставляет sudo-шим, который просто выполняет команду.
mkdir -p "$tmp/bin"
printf '#!/bin/sh\nexec "$@"\n' > "$tmp/bin/sudo"
chmod 0755 "$tmp/bin/sudo"
rerun_root="$tmp/opt/rerun"
make_install_root "$rerun_root" "$new_commit"
rerun_output="$(PATH="$tmp/bin:$PATH" N8N_KIT_INSTALL_ROOT="$rerun_root" sh "$artifact" 2>&1)"
[[ "$rerun_output" == *'OLD-INSTALLER'* ]] \
  || fail 'same-commit bootstrap rerun no longer reaches the installer'
ok 'same-commit bootstrap rerun still reruns the installer'

# Docker-стаб: контейнеры проекта отдаются через ps/inspect с label, как в
# настоящем Compose (T-0138). Параметры: корень установки, состав env-файлов,
# сервис с bind-mount, код возврата compose up, журнал вызовов.
write_docker_stub() {
  local root="$1" envs="$2" up_exit="$3" call_log="$4"
  cat > "$tmp/bin/docker" <<EOF
#!/bin/sh
case "\$*" in
  "compose version") exit 0 ;;
  "ps -q --filter label=com.docker.compose.project") printf 'stubcontainer1\n' ;;
  "ps -aq --filter label=com.docker.compose.project") printf 'stubcontainer1\nstubcontainer2\n' ;;
  inspect*stubcontainer1*)
    printf '[{"Id":"stubcontainer1","Config":{"Labels":{"com.docker.compose.project":"n8n-starter-kit","com.docker.compose.project.config_files":"%s/docker-compose.yml","com.docker.compose.project.environment_file":"%s","com.docker.compose.service":"n8n"}},"Mounts":[]},{"Id":"stubcontainer2","Config":{"Labels":{"com.docker.compose.project":"n8n-starter-kit","com.docker.compose.project.config_files":"%s/docker-compose.yml","com.docker.compose.project.environment_file":"%s","com.docker.compose.service":"caddy"}},"Mounts":[{"Type":"bind","Source":"%s/config/Caddyfile"}]}]\n' "$root" "$envs" "$root" "$envs" "$root" ;;
  compose*up*)
    printf '%s\n' "\$*" >> "$call_log"
    [ "$up_exit" -eq 0 ] || printf 'stub compose up failure\n' >&2
    exit "$up_exit" ;;
  *) exit 0 ;;
esac
EOF
  chmod 0755 "$tmp/bin/docker"
}

# T-0135: отказ ПОСЛЕ успешной замены кода (упавший перезапуск) обязан оставить
# оператору пути отката в выводе.
restart_root="$tmp/opt/restart-fail"
make_install_root "$restart_root" "$old_commit"
# Путь в стабе обязан быть каноническим: updater резолвит install root через
# pwd -P, и /var/folders без /private не пройдёт сверку префикса.
restart_root="$(cd "$restart_root" && pwd -P)"
write_docker_stub "$restart_root" "$restart_root/.env" 1 "$tmp/restart-fail-calls.log"
set +e
restart_output="$(PATH="$tmp/bin:$PATH" "$UPDATER" --source "$new_tree" \
  --release-commit "$new_commit" --install-root "$restart_root" --yes 2>&1)"
restart_code=$?
set -e
[[ "$restart_code" -ne 0 ]] || fail 'failing restart still exited zero'
[[ "$restart_output" == *"PREVIOUS_CODE_TREE="* ]] \
  || fail 'failing restart output lost the previous tree path'
[[ "$restart_output" == *"CODE_BACKUP_ARCHIVE="* ]] \
  || fail 'failing restart output lost the code backup path'
[[ "$(cat "$restart_root/.release-commit")" == "$new_commit" ]] \
  || fail 'failing restart left an inconsistent .release-commit'
restart_previous="$(printf '%s\n' "$restart_output" | awk -F= '$1 == "PREVIOUS_CODE_TREE" {print $2; exit}')"
[[ -d "$restart_previous" ]] || fail 'previous tree missing after failing restart'
rm -f -- "$tmp/bin/docker"
ok 'failing restart after the swap keeps rollback paths in the output'

# T-0138: перезапуск воспроизводит env-файлы ИСХОДНОГО запуска из label
# контейнеров (боевой платформенный профиль шёл с двумя --env-file и падал на
# интерполяции), а сервисы с bind-mount из дерева установки пересоздаются.
envfiles_root="$tmp/opt/restart-envfiles"
make_install_root "$envfiles_root" "$old_commit"
envfiles_root="$(cd "$envfiles_root" && pwd -P)"
printf 'EXTRA=1\n' > "$envfiles_root/.env.platform"
chmod 0600 "$envfiles_root/.env.platform"
write_docker_stub "$envfiles_root" "$envfiles_root/.env,$envfiles_root/.env.platform" 0 "$tmp/envfiles-calls.log"
: > "$tmp/envfiles-calls.log"
envfiles_output="$(PATH="$tmp/bin:$PATH" "$UPDATER" --source "$new_tree" \
  --release-commit "$new_commit" --install-root "$envfiles_root" --yes 2>&1)" \
  || { printf '%s\n' "$envfiles_output" >&2; fail 'restart with two env files did not succeed'; }
[[ -f "$envfiles_root/.env.platform" ]] || fail 'extra env file was not carried over'
grep -q -- "--env-file $envfiles_root/.env --env-file $envfiles_root/.env.platform" "$tmp/envfiles-calls.log" \
  || fail 'restart did not reproduce both env files from container labels'
grep -q -- "--force-recreate caddy" "$tmp/envfiles-calls.log" \
  || fail 'bind-mounted service was not force-recreated'
[[ "$(grep -c 'up -d' "$tmp/envfiles-calls.log")" == '2' ]] \
  || fail 'expected exactly two compose up invocations (reconcile + recreate)'
[[ "$(grep -c -- '--pull never' "$tmp/envfiles-calls.log")" == '2' ]] \
  || fail 'code update restart must never reach the registry'
[[ ! -f "$envfiles_root/.doctor-invoked" ]] \
  || fail 'doctor ran against a project it cannot interpolate'
[[ "$envfiles_output" == *'doctor.sh пропущен'* ]] \
  || fail 'doctor skip on a non-standard env set is not explained'
rm -f -- "$tmp/bin/docker"
ok 'restart reproduces original env files and recreates bind-mounted services'

# Штатный одиночный .env: doctor обязан прогоняться, как и раньше.
singleenv_root="$tmp/opt/restart-singleenv"
make_install_root "$singleenv_root" "$old_commit"
singleenv_root="$(cd "$singleenv_root" && pwd -P)"
write_docker_stub "$singleenv_root" "$singleenv_root/.env" 0 "$tmp/singleenv-calls.log"
singleenv_output="$(PATH="$tmp/bin:$PATH" "$UPDATER" --source "$new_tree" \
  --release-commit "$new_commit" --install-root "$singleenv_root" --yes 2>&1)" \
  || fail 'single-env restart did not succeed'
[[ -f "$singleenv_root/.doctor-invoked" ]] || fail 'doctor was not run on a standard single-env project'
[[ "$singleenv_output" == *'без FAIL'* ]] || fail 'doctor pass is not reported'
rm -f -- "$tmp/bin/docker"
ok 'standard single-env project still gets a doctor run'

# Отсутствующий env-файл исходного запуска — понятный отказ, а не тихий compose.
missingenv_root="$tmp/opt/restart-missing-env"
make_install_root "$missingenv_root" "$old_commit"
missingenv_root="$(cd "$missingenv_root" && pwd -P)"
write_docker_stub "$missingenv_root" "$missingenv_root/.env,$missingenv_root/.env.gone" 0 "$tmp/missing-calls.log"
set +e
missing_output="$(PATH="$tmp/bin:$PATH" "$UPDATER" --source "$new_tree" \
  --release-commit "$new_commit" --install-root "$missingenv_root" --yes 2>&1)"
missing_code=$?
set -e
[[ "$missing_code" -ne 0 ]] || fail 'missing original env file was accepted'
[[ "$missing_output" == *'Env-файл исходного запуска не найден'* ]] \
  || fail 'missing env file failure is not explained'
[[ "$missing_output" == *"PREVIOUS_CODE_TREE="* ]] \
  || fail 'missing env file failure lost rollback paths'
rm -f -- "$tmp/bin/docker"
ok 'missing original env file fails with rollback paths in the output'

rehearsal_help="$("$REHEARSAL" --help)"
[[ "$rehearsal_help" == *'T-0130-DISPOSABLE'* ]] \
  || fail 'rehearsal help does not state the disposable phrase'
if "$REHEARSAL" --work-root "$tmp" --confirm-disposable WRONG >/dev/null 2>&1; then
  fail 'rehearsal accepted a wrong disposable phrase'
fi
ok 'rehearsal demands the exact disposable confirmation'

printf '1..%d\n' "$COUNT"
