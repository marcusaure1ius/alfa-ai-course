#!/usr/bin/env bash

set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node "$ROOT/tests/secret_scan.mjs" "$@"
