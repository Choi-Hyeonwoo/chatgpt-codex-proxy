import test from "node:test";
import assert from "node:assert/strict";

import {
  setRuntimeModelAvailability,
  firstRuntimeAvailable,
  runtimeDefaultOpus,
  FAMILY_PRIORITIES,
} from "../src/codex/models.js";

test("setRuntimeModelAvailability narrows family selection to runtime-available models", () => {
  // Simulate a probe result where only gpt-5.3-codex is available (the
  // first-preferred gpt-5.3-codex-xhigh for opus is NOT available).
  setRuntimeModelAvailability(["gpt-5.3-codex"]);

  // Confirm the gating works: opus's first-choice xhigh should be skipped,
  // and the runtime-available gpt-5.3-codex should be selected.
  const picked = firstRuntimeAvailable(FAMILY_PRIORITIES.opus);
  assert.equal(picked, "gpt-5.3-codex");

  // Same through the public helper — opus default should fall through to the
  // first runtime-available option in its priority list.
  assert.equal(runtimeDefaultOpus(), "gpt-5.3-codex");

  // Reset gating so other tests are not affected.
  setRuntimeModelAvailability([]);
});
