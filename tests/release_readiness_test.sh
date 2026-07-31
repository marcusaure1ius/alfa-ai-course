#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
READINESS="$ROOT/docs/release-readiness.md"
MANIFEST="$ROOT/release-manifest.json"
CHANGELOG="$ROOT/CHANGELOG.md"
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

for file in "$READINESS" "$MANIFEST" "$CHANGELOG"; do
  [[ -s "$file" ]] || fail "required release evidence missing: ${file#"$ROOT/"}"
done
ok 'readiness, manifest and changelog exist'

[[ "$(grep -c '^| MVP-[0-9][0-9] |' "$READINESS")" -eq 13 ]] \
  || fail 'release readiness must contain exactly 13 MVP criteria'
grep -Fq '| MVP-13 |' "$READINESS" || fail 'MVP-13 criterion missing'
grep -Eq '\| MVP-13 \|.*\| BLOCKER \|' "$READINESS" \
  || fail 'novice trial must remain an explicit blocker'
grep -Fq '**NO-GO для заявления «MVP полностью готов»' "$READINESS" \
  || fail 'complete MVP NO-GO is not explicit'
ok '13 criteria and honest novice blocker are explicit'

node - "$MANIFEST" <<'NODE' || fail 'release manifest values are invalid'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = {
  tag: 'v0.1.1',
  installer: '34eae99bfcf17439bb079a9355cd3697aca8a7df306f7095ddda51f9ac52d941',
  archive: '6bd12fd976440eea398196bedc4d1d80d878212026bae02064a2cb562d773701',
  inventory: 'e6109aab10547dfdf1e5b72881e0b3b28329e61aeb9939a1b92cd73e4bb1e048',
  commit: '68063340c8113d98586f71704c30adc6d1f0eb3a',
};
if (manifest.release.tag !== expected.tag) process.exit(1);
if (manifest.assets.installer.sha256 !== expected.installer) process.exit(1);
if (manifest.assets.embeddedArchive.sha256 !== expected.archive) process.exit(1);
if (manifest.assets.embeddedArchive.sortedFileChecksumManifestSha256 !== expected.inventory) process.exit(1);
if (manifest.assets.embeddedArchive.fileCount !== 169) process.exit(1);
if (manifest.release.embeddedSourceCommit !== expected.commit) process.exit(1);
if (manifest.readiness.completeMvpClaim !== 'no-go') process.exit(1);
if (manifest.readiness.blockingCriterion !== 'MVP-13') process.exit(1);
if (manifest.pins.n8n !== 'docker.n8n.io/n8nio/n8n:2.29.10') process.exit(1);
if (manifest.pins.postgresql !== 'postgres:17.10-bookworm') process.exit(1);
if (manifest.pins.caddy !== 'caddy:2.11.4-alpine') process.exit(1);
NODE
ok 'machine-readable release manifest pins immutable evidence'

grep -Fq '## [0.1.1] - 2026-07-31' "$CHANGELOG" \
  || fail 'v0.1.1 changelog entry missing'
grep -Fq 'Полный MVP claim остаётся `NO-GO`' "$CHANGELOG" \
  || fail 'open release gate missing from changelog'
ok 'changelog records release and open gate'

for marker in \
  'N8N_BOOTSTRAP_VERIFY_ONLY=1 sh install.sh' \
  "N8N_KIT_PAYLOAD" \
  'base64 -d > release.tar.gz' \
  'find . -type f -print0 | LC_ALL=C sort -z' \
  'xargs -0 "${checksum[@]}"' \
  'files.sha256' \
  '6bd12fd976440eea398196bedc4d1d80d878212026bae02064a2cb562d773701' \
  'e6109aab10547dfdf1e5b72881e0b3b28329e61aeb9939a1b92cd73e4bb1e048' \
  'tests/secret_scan.sh'; do
  grep -Fq "$marker" "$ROOT/docs/release-publication.md" \
    || fail "reproducible checksum procedure marker missing: $marker"
done
ok 'embedded archive checksum procedure is copy-paste reproducible'

if git -C "$ROOT" grep -nE '201\.34\.130\.27|BEGIN (RSA |OPENSSH )?PRIVATE KEY' -- \
  release-manifest.json docs/release-readiness.md docs/release-publication.md CHANGELOG.md; then
  fail 'release evidence contains a disposable IP or private key material'
fi
ok 'release evidence excludes disposable IP and private key material'

printf '1..%d\n' "$COUNT"
