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

printf '1..%d\n' "$COUNT"
