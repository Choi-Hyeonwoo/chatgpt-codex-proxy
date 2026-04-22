import test from "node:test";
import assert from "node:assert/strict";

import { ProxyError, formatErrorResponse, errorHandler } from "../src/utils/errors.js";

function makeRes() {
  const captured: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  return { res, captured };
}

test("ProxyError round-trips statusCode and errorType via formatErrorResponse", () => {
  const err = new ProxyError("boom", 418, "teapot_error", { hint: "brew" });
  assert.equal(err.statusCode, 418);
  assert.equal(err.errorType, "teapot_error");
  assert.deepEqual(err.details, { hint: "brew" });

  const body = formatErrorResponse(err);
  assert.equal(body.type, "error");
  assert.equal(body.error.type, "teapot_error");
  assert.equal(body.error.message, "boom");
});

test("errorHandler maps entity.too.large to 413 request_too_large", () => {
  const { res, captured } = makeRes();
  const err = { type: "entity.too.large" } as unknown;
  errorHandler(err, {} as any, res as any, (() => {}) as any);

  assert.equal(captured.statusCode, 413);
  const body = captured.body as { type: string; error: { type: string; message: string } };
  assert.equal(body.type, "error");
  assert.equal(body.error.type, "request_too_large");
  assert.ok(body.error.message.toLowerCase().includes("too large"));
});

test("errorHandler maps SyntaxError with body prop to 400 invalid_request_error", () => {
  const { res, captured } = makeRes();
  const err = new SyntaxError("Unexpected token");
  (err as unknown as { body: string }).body = "{bad";
  errorHandler(err, {} as any, res as any, (() => {}) as any);

  assert.equal(captured.statusCode, 400);
  const body = captured.body as { type: string; error: { type: string; message: string } };
  assert.equal(body.error.type, "invalid_request_error");
  assert.equal(body.error.message, "Invalid JSON body");
});
