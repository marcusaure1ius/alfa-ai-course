#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT_DIR/tests/polza_beginner_workflows_test.mjs"
