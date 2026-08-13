#!/usr/bin/env bash

set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
RUNNER="$ROOT/tests/run_quality_gates.sh"
COUNT=0
ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail(){ printf 'not ok - %s\n' "$1" >&2; exit 1; }

bash -n "$RUNNER" "$ROOT/tests/run_static_tests.sh" "$ROOT/tests/postgres_integration_test.sh"
[[ "$($RUNNER --help)" == *"explicit SKIP"* ]] || fail "help lacks external boundary"
ok "runner syntax and external boundary help"

grep -q '^quality:' "$ROOT/Makefile" || fail "make quality missing"
grep -q '^quality-ci:' "$ROOT/Makefile" || fail "make quality-ci missing"
ok "Makefile exposes local and CI entrypoints"

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/shellcheck" <<'EOF'
#!/usr/bin/env bash
printf 'synthetic shellcheck failure\n' >&2
exit 7
EOF
chmod +x "$tmp/bin/shellcheck"

set +e
PATH="$tmp/bin:$PATH" "$RUNNER" --profile ci --only shellcheck --output-dir "$tmp/artifacts" > "$tmp/run.out" 2>&1
code=$?
set -e
[[ "$code" -ne 0 ]] || fail "failing gate returned zero"
grep -Eq '^shellcheck[[:space:]]+FAIL[[:space:]]+exit=7' "$tmp/artifacts/summary.txt" \
  || fail "summary does not identify failed gate"
grep -q '^QUALITY_STATUS=FAIL$' "$tmp/run.out" || fail "machine-readable failure missing"
(cd "$tmp/artifacts" && sha256sum -c checksums.sha256 >/dev/null) || fail "artifact checksums failed"
"$ROOT/tests/secret_scan.sh" --path "$tmp/artifacts" >/dev/null || fail "failure artifacts contain secret-like data"
ok "gate failure is non-zero, identified and checksummed"

managed="$ROOT/test-results/quality/contract-rerun-$$"
[[ ! -e "$managed" ]] || fail "unexpected managed test path exists"
set +e
PATH="$tmp/bin:$PATH" "$RUNNER" --profile ci --only shellcheck --output-dir "$managed" >/dev/null 2>&1
first=$?
PATH="$tmp/bin:$PATH" "$RUNNER" --profile ci --only shellcheck --output-dir "$managed" >/dev/null 2>&1
second=$?
set -e
[[ "$first" -ne 0 && "$second" -ne 0 && -f "$managed/checksums.sha256" ]] || fail "managed CI output is not repeatable"
[[ "$(cat "$managed/.quality-gates-artifact")" == alfa-ai-course-quality-artifact-v1 ]] || fail "managed marker missing"
rm -rf -- "$managed"
ok "managed CI artifact directory is repeatable"

grep -Eq '^destructive-lifecycle[[:space:]]+SKIP' "$tmp/artifacts/summary.txt"
grep -Eq '^external-smoke[[:space:]]+SKIP' "$tmp/artifacts/summary.txt" \
  || fail "external skips missing"
ok "unsupported destructive and external checks are explicit SKIP"

workflow="$ROOT/.github/workflows/quality-gates.yml"
grep -Fq 'actions/checkout@v4' "$workflow"
grep -Fq 'actions/upload-artifact@v4' "$workflow"
grep -Fq 'make quality-ci' "$workflow"
grep -Fq 'if: always()' "$workflow" || fail "CI artifact upload is not failure-safe"
ok "CI runs quality-ci and always uploads artifacts"

readme="$ROOT/tests/README.md"
grep -Fq 'make quality' "$readme"
grep -Fq 'PostgreSQL' "$readme"
grep -Fq 'DNS/HTTPS' "$readme" || fail "quality matrix incomplete"
ok "tests README documents the gate matrix"

# T-0133: кейс-фолдинг многобайтных символов зависит от локали, поэтому
# сочетание кейс-фолдингового флага grep с кириллицей в шаблоне запрещено
# целиком — такой тест зеленеет или краснеет в зависимости от LANG/LC_ALL
# сессии. Вместо флага пишутся явные классы символов. Проверка сама не зависит
# от локали: разбор выполняет python3 с явным encoding. Закомментированные
# строки пропускаются — они не исполняются, и правило про них ничего не
# говорит.
#
# T-0136: покрыты все формы запроса кейс-фолдинга, а не только короткая -i:
# длинная --ignore-case вместе с её однозначными GNU-сокращениями (--ig и
# длиннее) и устаревший синоним -y. Формы задаёт grep, поэтому короткие
# кластеры матчятся по наличию буквы i или y, а длинные — по префиксу --ig.
python3 - "$ROOT" <<'PY' || fail "grep with case-folding flag and Cyrillic pattern found; use explicit character classes"
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
fold_flag = re.compile(r"\bgrep\s+(-\S*\s+)*(?:-[A-Za-z]*[iy][A-Za-z]*|--ig\S*)\b")
cyrillic = re.compile("[А-яЁё]")
bad = []
for folder in ("tests", "scripts"):
    for path in sorted((root / folder).glob("*.sh")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            if fold_flag.search(line) and cyrillic.search(line):
                bad.append(f"{path.relative_to(root)}:{number}: {line.strip()[:100]}")
for entry in bad:
    print(entry, file=sys.stderr)
sys.exit(1 if bad else 0)
PY
ok "no gate combines grep case-folding with Cyrillic patterns"

printf '1..%d\n' "$COUNT"
