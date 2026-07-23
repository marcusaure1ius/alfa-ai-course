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

const assignmentPattern = /(?:^|[\s,{])(POSTGRES_PASSWORD|N8N_ENCRYPTION_KEY|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)[ \t]*[:=][ \t]*["']?([^\s"',`}]{12,})/gim;
const safeAssignmentMarkers = [
  'example',
  'fixture',
  'placeholder',
  'not-a-secret',
  'synthetic',
  'redacted',
  'changeme',
  '${',
  '<',
  '%s',
  '$',
  '?',
];

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
    const value = match[2].toLowerCase();
    if (safeAssignmentMarkers.some((marker) => value.includes(marker))) continue;
    findings.push({ rule: 'credential-assignment', file, index: match.index ?? 0 });
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
