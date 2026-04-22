import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const changelogPath = resolve(__dirname, '..', 'CHANGELOG.md');

test('CHANGELOG.md has Unreleased section', () => {
  const content = readFileSync(changelogPath, 'utf8');
  assert.match(content, /^## \[Unreleased\]/m);
});

test('CHANGELOG.md has 0.2.0 section', () => {
  const content = readFileSync(changelogPath, 'utf8');
  assert.match(content, /^## \[0\.2\.0\]/m);
});
