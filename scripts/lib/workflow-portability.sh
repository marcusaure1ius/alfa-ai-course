#!/usr/bin/env bash

# Общие fail-closed проверки для import/export workflow JSON.

workflow_require_jq() {
  command -v jq >/dev/null 2>&1 || {
    printf '[FAIL] jq не найден. Установите jq и повторите команду.\n' >&2
    return 1
  }
}

workflow_has_no_embedded_secrets() {
  local source_file="$1"
  jq -e '
    def safe_value:
      type != "string" or
      test("^(REPLACE_WITH_|PLACEHOLDER$|<[^>]+>$|\\{\\{[^}]+\\}\\}$|=\\{\\{)");
    def sensitive_key:
      ascii_downcase |
      test("^(password|passwd|clientsecret|client_secret|access[_-]?token|refresh[_-]?token|api[_-]?key|private[_-]?key|authorization)$");
    def literal_secret:
      type == "string" and (
        test("-----BEGIN [A-Z ]*PRIVATE KEY-----") or
        test("Bearer[[:space:]]+[A-Za-z0-9._~+/-]{16,}") or
        test("(^|[^0-9])[0-9]{6,}:[A-Za-z0-9_-]{20,}([^A-Za-z0-9_-]|$)") or
        test("https://[^/[:space:]]+/rest/[0-9]+/[A-Za-z0-9_-]{8,}(/|$)")
      );
    [
      paths(scalars) as $path |
      getpath($path) as $value |
      select(
        (($path[-1] | tostring | sensitive_key) and ($value | safe_value | not)) or
        ($value | literal_secret)
      )
    ] as $path_hits |
    [
      .. | objects |
      select((.name? | type) == "string") |
      select(.name | ascii_downcase | test("^(authorization|x-api-key|api-key)$")) |
      select((.value? | safe_value | not))
    ] as $header_hits |
    ($path_hits | length) == 0 and ($header_hits | length) == 0
  ' "$source_file" >/dev/null 2>&1
}

workflow_validate_and_sanitize() {
  local source_file="$1" destination_file="$2"
  local temporary_file="${destination_file}.tmp"

  [[ -f "$source_file" ]] || {
    printf '[FAIL] Workflow file отсутствует: %s\n' "$source_file" >&2
    return 1
  }

  jq -e '
    type == "object" and
    (.id | type == "string" and test("^[A-Za-z0-9_-]{1,128}$")) and
    (.name | type == "string" and length > 0 and length <= 128) and
    (.nodes | type == "array") and
    (.connections | type == "object")
  ' "$source_file" >/dev/null 2>&1 || {
    printf '[FAIL] Невалидный workflow JSON/schema: %s\n' "$source_file" >&2
    return 1
  }

  workflow_has_no_embedded_secrets "$source_file" || {
    printf '[FAIL] Обнаружен индикатор embedded secret: %s\n' "$source_file" >&2
    return 1
  }

  jq -S '
    del(.nodes[]?.credentials) |
    del(.credentials) |
    del(.shared) |
    .active = false |
    .pinData = {}
  ' "$source_file" > "$temporary_file" || {
    rm -f -- "$temporary_file"
    printf '[FAIL] Не удалось нормализовать workflow: %s\n' "$source_file" >&2
    return 1
  }

  if ! workflow_has_no_embedded_secrets "$temporary_file"; then
    rm -f -- "$temporary_file"
    printf '[FAIL] Обнаружен индикатор embedded secret: %s\n' "$source_file" >&2
    return 1
  fi

  chmod 0600 "$temporary_file"
  mv -f -- "$temporary_file" "$destination_file"
}

workflow_id() {
  jq -r '.id' "$1"
}
