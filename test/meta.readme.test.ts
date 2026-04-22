import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

test("README.md contains Troubleshooting section and required scenarios", () => {
  const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
  assert.match(readme, /Troubleshooting/, "missing Troubleshooting section");
  assert.match(readme, /Port 1455/, "missing Port 1455 troubleshooting entry");
  assert.match(readme, /gpt-5\.4-codex/, "missing gpt-5.4-codex troubleshooting entry");
});

test("README.ko.md exists and links to README.md", () => {
  const koPath = resolve(repoRoot, "README.ko.md");
  assert.ok(existsSync(koPath), "README.ko.md must exist");
  const ko = readFileSync(koPath, "utf8");
  assert.match(ko, /README\.md/, "README.ko.md must link to README.md");
});

test("English README is substantial (>=200 lines) to avoid shallow translation", () => {
  const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
  const lineCount = readme.split(/\r?\n/).length;
  assert.ok(
    lineCount >= 200,
    `README.md should be >=200 lines, got ${lineCount}`,
  );
});
