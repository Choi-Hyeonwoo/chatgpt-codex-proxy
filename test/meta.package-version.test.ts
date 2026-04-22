import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
const changelogPath = resolve(__dirname, '..', 'CHANGELOG.md');

test('package.json version matches the latest CHANGELOG release section', () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const changelog = readFileSync(changelogPath, 'utf8');

  // First "## [x.y.z]" heading after [Unreleased] is the latest release.
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(match, 'CHANGELOG.md must contain at least one "## [x.y.z]" release heading');

  const latestReleased = match[1];
  assert.equal(
    pkg.version,
    latestReleased,
    `package.json version (${pkg.version}) must match the latest CHANGELOG release (${latestReleased})`,
  );
});

test('package.json version is a valid semver core', () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'version must be MAJOR.MINOR.PATCH');
});
