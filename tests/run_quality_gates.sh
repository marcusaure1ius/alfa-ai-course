#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROFILE=local
OUTPUT_DIR=""
ONLY=""
LOG_FILE=""
SUMMARY_FILE=""
FAILURES=0
declare -a NAMES=()
declare -a STATUSES=()
declare -a DETAILS=()

usage() {
  cat <<'EOF'
Единый runner локальных и CI quality gates.

Использование:
  ./tests/run_quality_gates.sh [--profile local|ci] [--output-dir DIR]
  ./tests/run_quality_gates.sh --only shellcheck --output-dir DIR

Default local profile пропускает только недоступные optional tools/integration
prerequisites и всегда объясняет SKIP. CI profile считает их отсутствие FAIL.
External DNS/HTTPS/certificate/provider/reboot и destructive rehearsal не
подменяются локальной проверкой: они всегда отражаются как explicit SKIP.
EOF
}

fatal() { printf '[FAIL] quality-runner — %s\n' "$*" >&2; exit 2; }

parse_args() {
  while (($#)); do
    case "$1" in
      --profile) (($# >= 2)) || fatal "Для --profile нужно значение."; PROFILE="$2"; shift ;;
      --output-dir) (($# >= 2)) || fatal "Для --output-dir нужен путь."; OUTPUT_DIR="$2"; shift ;;
      --only) (($# >= 2)) || fatal "Для --only нужно имя gate."; ONLY="$2"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
  [[ "$PROFILE" == local || "$PROFILE" == ci ]] || fatal "Profile должен быть local или ci."
}

selected() { [[ -z "$ONLY" || "$ONLY" == "$1" ]]; }

record() {
  local name="$1" status="$2" detail="$3"
  NAMES+=("$name")
  STATUSES+=("$status")
  DETAILS+=("$detail")
  [[ "$status" != FAIL ]] || FAILURES=$((FAILURES + 1))
  printf '[%s] %s — %s\n' "$status" "$name" "$detail" | tee -a "$LOG_FILE"
}

run_gate() {
  local name="$1"; shift
  local code
  printf '\n[GATE] %s\n' "$name" >> "$LOG_FILE"
  set +e
  "$@" >> "$LOG_FILE" 2>&1
  code=$?
  set -e
  if (( code == 0 )); then
    record "$name" PASS "command completed"
  else
    record "$name" FAIL "exit=$code; see quality-gates.log"
  fi
}

record_unavailable() {
  local name="$1" reason="$2"
  if [[ "$PROFILE" == ci ]]; then record "$name" FAIL "$reason"; else record "$name" SKIP "$reason"; fi
}

write_summary() {
  local index
  {
    printf 'qualityProfile=%s\n' "$PROFILE"
    printf 'gitCommit=%s\n' "$(git -C "$ROOT" rev-parse HEAD)"
    if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then printf 'gitDirty=true\n'; else printf 'gitDirty=false\n'; fi
    printf 'generatedAt=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    printf 'failureCount=%d\n' "$FAILURES"
    printf '\n%-26s %-6s %s\n' GATE STATUS DETAIL
    printf '%-26s %-6s %s\n' '--------------------------' '------' '------'
    for index in "${!NAMES[@]}"; do
      printf '%-26s %-6s %s\n' "${NAMES[$index]}" "${STATUSES[$index]}" "${DETAILS[$index]}"
    done
  } > "$SUMMARY_FILE"
}

shell_syntax_gate() {
  local file
  while IFS= read -r file; do bash -n "$file"; done < <(find "$ROOT/scripts" "$ROOT/tests" -type f -name '*.sh' -print | sort)
}

shellcheck_gate() {
  local -a files=()
  local file
  while IFS= read -r file; do files+=("$file"); done < <(find "$ROOT/scripts" "$ROOT/tests" -type f -name '*.sh' -print | sort)
  shellcheck --severity=warning -x "${files[@]}"
}

secret_gate() {
  "$ROOT/tests/secret_scan.sh"
  "$ROOT/tests/secret_scan_test.sh"
}

integration_prerequisites() {
  local image
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 || return 1
  for image in "$@"; do docker image inspect "$image" >/dev/null 2>&1 || return 1; done
}

prepare_output() {
  local timestamp
  if [[ -z "$OUTPUT_DIR" ]]; then
    timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
    OUTPUT_DIR="$ROOT/test-results/quality/${timestamp}-$$"
  elif [[ "$OUTPUT_DIR" != /* ]]; then
    OUTPUT_DIR="$ROOT/$OUTPUT_DIR"
  fi
  if [[ -e "$OUTPUT_DIR" ]]; then
    case "$OUTPUT_DIR/" in
      "$ROOT/test-results/quality/"*) ;;
      *) fatal "Existing output разрешён только внутри test-results/quality: $OUTPUT_DIR" ;;
    esac
    [[ -f "$OUTPUT_DIR/.quality-gates-artifact" && "$(cat "$OUTPUT_DIR/.quality-gates-artifact")" == alfa-ai-course-quality-artifact-v1 ]] \
      || fatal "Existing output не имеет quality artifact marker: $OUTPUT_DIR"
    rm -rf -- "$OUTPUT_DIR"
  fi
  mkdir -p "$OUTPUT_DIR"
  printf 'alfa-ai-course-quality-artifact-v1\n' > "$OUTPUT_DIR/.quality-gates-artifact"
  LOG_FILE="$OUTPUT_DIR/quality-gates.log"
  SUMMARY_FILE="$OUTPUT_DIR/summary.txt"
  : > "$LOG_FILE"
}

main() {
  local manifest manifest_hash
  parse_args "$@"
  prepare_output

  selected shell-syntax && run_gate shell-syntax shell_syntax_gate

  if selected shellcheck; then
    if command -v shellcheck >/dev/null 2>&1; then
      run_gate shellcheck shellcheck_gate
    else
      record_unavailable shellcheck "shellcheck command unavailable"
    fi
  fi

  selected compose-config && run_gate compose-config "$ROOT/tests/compose_config_test.sh"
  selected secret-scan && run_gate secret-scan secret_gate
  selected static-tests && run_gate static-tests "$ROOT/tests/run_static_tests.sh"

  if selected workflow-import; then
    if integration_prerequisites docker.n8n.io/n8nio/n8n:2.29.10; then
      run_gate workflow-import "$ROOT/tests/workflow_catalog_test.sh"
    else
      record_unavailable workflow-import "Docker daemon or pinned n8n image unavailable"
    fi
  fi

  if selected postgres-health; then
    if integration_prerequisites docker.n8n.io/n8nio/n8n:2.29.10 postgres:17.10-bookworm; then
      run_gate postgres-health "$ROOT/tests/postgres_integration_test.sh"
    else
      record_unavailable postgres-health "Docker daemon or pinned n8n/PostgreSQL images unavailable"
    fi
  fi

  record destructive-lifecycle SKIP "requires explicit disposable marker; see dated T-0012 report"
  record external-smoke SKIP "requires real VPS/DNS/HTTPS/certificate/provider credentials/reboot evidence"

  write_summary
  if "$ROOT/tests/secret_scan.sh" --path "$OUTPUT_DIR" >> "$LOG_FILE" 2>&1; then
    record artifact-secret-scan PASS "redacted artifact scan completed"
  else
    record artifact-secret-scan FAIL "artifact scan found secret-like material; values redacted"
  fi
  write_summary

  manifest="$OUTPUT_DIR/checksums.sha256"
  (cd "$OUTPUT_DIR" && sha256sum .quality-gates-artifact quality-gates.log summary.txt) > "$manifest"
  (cd "$OUTPUT_DIR" && sha256sum -c "$(basename "$manifest")" >/dev/null) \
    || fatal "Artifact checksum verification failed."
  manifest_hash="$(sha256sum "$manifest" | awk '{print $1}')"

  printf 'QUALITY_STATUS=%s\n' "$([[ $FAILURES -eq 0 ]] && printf PASS || printf FAIL)"
  printf 'QUALITY_FAILURES=%d\n' "$FAILURES"
  printf 'QUALITY_ARTIFACT_DIR=%s\n' "$OUTPUT_DIR"
  printf 'QUALITY_MANIFEST_SHA256=%s\n' "$manifest_hash"
  (( FAILURES == 0 ))
}

main "$@"
