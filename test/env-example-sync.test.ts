import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function collectSrcEnvKeys(): Set<string> {
  // grep -rhoE 'process\.env\.[A-Z_]+' src | sort -u
  const raw = execSync(`grep -rhoE 'process\\.env\\.[A-Z_]+' src`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const keys = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^process\.env\.([A-Z_][A-Z0-9_]*)$/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function collectEnvExampleKeys(): Set<string> {
  const text = readFileSync(resolve(repoRoot, ".env.example"), "utf8");
  const keys = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

test(".env.example contains every process.env.* key used in src/", () => {
  const srcKeys = collectSrcEnvKeys();
  const envKeys = collectEnvExampleKeys();

  const missing = [...srcKeys].filter((k) => !envKeys.has(k)).sort();

  assert.equal(
    missing.length,
    0,
    `Missing keys in .env.example: ${missing.join(", ")}`,
  );
});

test(".env.example does not define keys that are unused in src/", () => {
  const srcKeys = collectSrcEnvKeys();
  const envKeys = collectEnvExampleKeys();

  const stale = [...envKeys].filter((k) => !srcKeys.has(k)).sort();

  assert.equal(
    stale.length,
    0,
    `Stale keys in .env.example (not referenced in src/): ${stale.join(", ")}`,
  );
});

test("src references at least one env var (sanity check)", () => {
  const srcKeys = collectSrcEnvKeys();
  assert.ok(srcKeys.size > 0, "expected to find at least one process.env.* reference in src/");
});
