#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const requestedPaths = [];

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--path') {
    const value = process.argv[index + 1];
    if (!value) throw new Error('Для --path нужен путь.');
    requestedPaths.push(path.resolve(value));
    index += 1;
  } else if (argument === '-h' || argument === '--help') {
    console.log('Usage: tests/secret_scan.sh [--path FILE_OR_DIRECTORY]...');
    process.exit(0);
  } else {
    throw new Error(`Неизвестный параметр: ${argument}`);
  }
}

function collectRecursively(target, files) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) {
      collectRecursively(path.join(target, entry), files);
    }
  } else if (stat.isFile()) {
    files.add(target);
  }
}

function defaultFiles() {
  const output = execFileSync(
    'git',
    ['-C', ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  return output.split('\0').filter(Boolean).map((file) => path.join(ROOT, file));
}

const files = new Set();
if (requestedPaths.length === 0) {
  for (const file of defaultFiles()) files.add(file);
} else {
  for (const target of requestedPaths) {
    if (!fs.existsSync(target)) throw new Error(`Путь не существует: ${target}`);
    collectRecursively(target, files);
  }
}

const rules = [
  {
    name: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/]{20,}={0,2}\r?\n)+/g,
  },
  { name: 'aws-access-key', pattern: /\bAKIA[A-Z0-9]{16}\b/g },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
];

// Правило credential-assignment устроено fail-closed: границу задаёт ФОРМА
// значения, а не перечень имён переменных. Набор имён задают n8n, провайдеры
// и будущий код, поэтому любой список имён неполон по построению — подложенный
// TIMEWEB_API_TOKEN уже проходил мимо прежнего перечня из пяти имён (T-0132).
// Имя участвует только как усиливающий сигнал для значений, которым не хватает
// энтропийной формы.
//
// Ключ может быть в кавычках: {"NAME": "value"} — форма workflow JSON, то есть
// ровно того, что репозиторий хранит больше всего (T-0134). Закрывающая
// кавычка после имени поэтому допускается шаблоном.
const assignmentPattern = /(?:^|[\s,{("'])([A-Za-z_][A-Za-z0-9_-]{1,63})["']?[ \t]*[:=][ \t]*["']?([^\s"',`}]{12,})/gm;
const safeAssignmentMarkers = [
  'example',
  'fixture',
  'placeholder',
  'not-a-secret',
  'synthetic',
  'redacted',
  'changeme',
  // Собственные конвенции плейсхолдеров репозитория: REPLACE_WITH_* в шаблонах
  // workflow и DRY_RUN_* в scripts/install.sh.
  'replace',
  'dry_run',
  '${',
  '<',
  '%s',
  '$',
  '?',
];

// Пять исторических имён: для них сохраняется прежнее, самое строгое условие —
// любое значение от 12 символов без safe-маркера. Это НЕ граница защиты
// (неизвестное имя ловит форма значения ниже), а дополнительная строгость для
// имён, которыми пользуется сам репозиторий.
const legacyNamePattern = /^(?:POSTGRES_PASSWORD|N8N_ENCRYPTION_KEY|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)$/i;

// Словарь сегментов, после которых присваивание читается как креденшал.
// Голый сегмент key сюда не входит: idempotencyKey/workflowKey/logical_key —
// обычные идентификаторы; key считается секретным только рядом с уточнением.
const secretNameSegments = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'credential',
  'credentials',
  'passphrase',
  'apikey',
]);
const keyAdjacentSegments = new Set([
  'api',
  'access',
  'encryption',
  'private',
  'signing',
  'management',
  'session',
  'auth',
  'deploy',
]);
// Имена, честно называющие hex-значение дайджестом: у них чистый hex не
// считается секретом (чексуммы релизов, git-коммиты). Направление отказа
// безопасное: hex под любым другим именем остаётся находкой.
const hashNameSegments = new Set([
  'sha',
  'sha1',
  'sha256',
  'sha384',
  'sha512',
  'md5',
  'checksum',
  'digest',
  'fingerprint',
  'hash',
  'commit',
  // git tree object hash: embeddedSourceTree в release-manifest.json.
  'tree',
]);

// Явные точечные исключения. Каждое сужено до полного значения; неизвестное
// значение той же формы краснеет.
const exactValueExceptions = new Set([
  // RFC 4648: алфавит base32 — публичная константа в MFA-коде платформы.
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  // Google Docs id и revision источника курса в seed-миграции (T-0108):
  // идентификаторы документа, а не креденшалы.
  '1RGJTeHwZ7RqbdRxxYM8iRZwLXDyWKbUpssmZbKklsdw',
  'AIroW34mh9Nzw76HhX8B2oETxv-lQF7II6puQk-cqjzonEbqej0yfsgkklWg3U_ShvJ4-apT110H2NnYEdTFDthHxGqyS7bS3xOu0PopPxU',
  // Наш собственный id workflow-адаптера: camelCase с тремя цифрами проходит
  // порог формы значения. Состав таких id задаёт этот репозиторий.
  'adapterBitrix24CrmV1',
  // fileToken дизайн-файла Pencil (main_design.pen): идентификатор
  // Figma-импорта, не credential.
  '51287a3f-21c0-41e3-a46b-a4af8e274688',
]);

const opaqueValuePattern = /^[A-Za-z0-9+/=_.~-]+$/;
// Цепочка идентификаторов вида input.idempotencyKey — ссылка в коде, не литерал.
const identifierChainPattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+;?$/;
// Одно слово из букв и цифр: так выглядят имена в коде (createPassword,
// JBSWY3DPEHPK3PXP из RFC 6238). Секреты такой формы достаточной длины ловит
// valueLooksSecret, а более короткие неотличимы от идентификаторов.
const bareAlnumPattern = /^[A-Za-z][A-Za-z0-9]*$/;
const pureHexPattern = /^[0-9a-fA-F]{24,}$/;
// Subresource Integrity: значение само называет себя хэшом.
const sriPrefixPattern = /^sha(?:256|384|512)-/;

function nameSegments(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Секретоподобность значения, независимая от имени. Пороги подобраны так,
// чтобы случайные токены от 20-24 символов ловились, а идентификаторы кода
// (camelCase с одной цифрой, UPPER_SNAKE-константы, URL, пути) — нет.
function valueLooksSecret(value) {
  if (!opaqueValuePattern.test(value)) return false;
  if (value.startsWith('//') || value.startsWith('/')) return false;
  if (sriPrefixPattern.test(value)) return false;
  // base64('{"…') — начало JWT и подобных токенов.
  if (value.startsWith('eyJ')) return true;
  if (identifierChainPattern.test(value)) return false;
  if (pureHexPattern.test(value)) {
    return /[a-fA-F]/.test(value) && /[0-9]/.test(value);
  }
  // Однорегистровые алфавиты (base32, base36) от 24 символов.
  if (/^[A-Z0-9]{24,}$/.test(value) || /^[a-z0-9]{24,}$/.test(value)) {
    return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
  }
  const digits = (value.match(/[0-9]/g) ?? []).length;
  return value.length >= 20 && /[a-z]/.test(value) && /[A-Z]/.test(value) && digits >= 2;
}

function assignmentLooksSecret(name, value) {
  if (legacyNamePattern.test(name)) return true;
  if (valueLooksSecret(value)) return true;
  const segments = nameSegments(name);
  const secretName =
    segments.some((segment) => secretNameSegments.has(segment)) ||
    (segments.includes('key') && segments.some((segment) => keyAdjacentSegments.has(segment)));
  if (!secretName) return false;
  // Для секретного имени значение обязано выглядеть литералом секрета, а не
  // ссылкой кода: без цепочек идентификаторов, не одно голое слово, с цифрой.
  return (
    opaqueValuePattern.test(value) &&
    !value.startsWith('//') &&
    !value.startsWith('/') &&
    !identifierChainPattern.test(value) &&
    !bareAlnumPattern.test(value) &&
    /[0-9]/.test(value)
  );
}

const findings = [];
let scanned = 0;

for (const file of [...files].sort()) {
  if (!fs.existsSync(file)) continue;
  const stat = fs.statSync(file);
  if (stat.size > 2 * 1024 * 1024) continue;
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');
  scanned += 1;

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      findings.push({ rule: rule.name, file, index: match.index ?? 0 });
    }
  }

  assignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(assignmentPattern)) {
    const name = match[1];
    const value = match[2];
    const lowered = value.toLowerCase();
    if (safeAssignmentMarkers.some((marker) => lowered.includes(marker))) continue;
    if (exactValueExceptions.has(value)) continue;
    if (nameSegments(name).some((segment) => hashNameSegments.has(segment)) && pureHexPattern.test(value)) continue;
    if (!assignmentLooksSecret(name, value)) continue;
    // Индекс сдвигается на начало имени: match.index указывает на boundary,
    // которым может быть \n предыдущей строки, и номер строки уезжал бы вверх.
    findings.push({
      rule: 'credential-assignment',
      file,
      index: (match.index ?? 0) + match[0].indexOf(name),
    });
  }
}

for (const finding of findings) {
  const content = fs.readFileSync(finding.file, 'utf8');
  const line = content.slice(0, finding.index).split('\n').length;
  const relative = path.relative(ROOT, finding.file);
  const display = relative.startsWith('..') ? path.basename(finding.file) : relative;
  console.error(`[FAIL] rule=${finding.rule} file=${display} line=${line}`);
}

if (findings.length > 0) {
  console.error(`[FAIL] secret scan: ${findings.length} finding(s); values are redacted`);
  process.exit(1);
}

console.log(`[OK] secret scan: ${scanned} text file(s), 0 findings`);
