import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');

test('package.json version is 0.2.0', () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.version, '0.2.0');
});
