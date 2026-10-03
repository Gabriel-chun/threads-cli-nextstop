import test from "node:test";
import assert from "node:assert/strict";
import {
  WRITE_INTENT_HEADER,
  WRITE_INTENT_VALUE,
  rejectMutationPreflight,
  validateWriteRequest
} from "./writeSecurity";

function req(headers: Record<string, string> = {}) {
  return new Request("https://threads-cli-nextstop.example/api/write", {
    method: "POST",
    headers
  });
}

const validHeaders = {
  Origin: "https://threads-cli-nextstop.example",
  "Content-Type": "application/json",
  "Sec-Fetch-Site": "same-origin",
  [WRITE_INTENT_HEADER]: WRITE_INTENT_VALUE
};

test("same-origin JSON mutation with explicit intent is allowed", () => {
  assert.equal(validateWriteRequest(req(validHeaders)), null);
});

test("missing Origin is rejected", () => {
  assert.equal(validateWriteRequest(req({
    "Content-Type": "application/json",
    [WRITE_INTENT_HEADER]: WRITE_INTENT_VALUE
  }))?.status, 403);
});

test("cross-origin mutation is rejected", () => {
  assert.equal(validateWriteRequest(req({
    ...validHeaders,
    Origin: "https://attacker.example"
  }))?.status, 403);
});

test("cross-site fetch metadata is rejected", () => {
  assert.equal(validateWriteRequest(req({
    ...validHeaders,
    "Sec-Fetch-Site": "cross-site"
  }))?.status, 403);
});

test("missing explicit write-intent header is rejected", () => {
  const { [WRITE_INTENT_HEADER]: _drop, ...headers } = validHeaders;
  assert.equal(validateWriteRequest(req(headers))?.status, 403);
});

test("non-JSON mutation is rejected", () => {
  assert.equal(validateWriteRequest(req({
    ...validHeaders,
    "Content-Type": "text/plain"
  }))?.status, 415);
});

test("mutation preflight is denied and never grants CORS", () => {
  const response = rejectMutationPreflight("POST");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("allow"), "POST");
});
