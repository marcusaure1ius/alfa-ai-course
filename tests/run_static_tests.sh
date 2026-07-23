#!/usr/bin/env bash

set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
COUNT=0

for test in "$ROOT"/tests/*_test.sh; do
  case "$(basename "$test")" in
    compose_config_test.sh|postgres_integration_test.sh|quality_gates_test.sh|secret_scan_test.sh|workflow_catalog_test.sh|telegram_assistant_test.sh|email_assistant_test.sh|lead_handler_test.sh|executive_digest_test.sh|rf_email_telegram_triage_test.sh)
      continue
      ;;
  esac
  printf '[STATIC] %s\n' "${test#"$ROOT/"}"
  "$test"
  COUNT=$((COUNT + 1))
done

printf '[OK] static contract wrappers: %d\n' "$COUNT"
