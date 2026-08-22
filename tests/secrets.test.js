import { test } from "node:test";
import assert from "node:assert/strict";
import { usableOpenAiKey } from "../server/lib/secrets.js";

test("rejects blank, spaced, or non-sk values", () => {
  assert.equal(usableOpenAiKey(""), "");
  assert.equal(usableOpenAiKey("I have a key\nsk-proj-abc"), "");
  assert.equal(usableOpenAiKey("not-a-key"), "");
});

test("accepts a raw sk token", () => {
  assert.equal(usableOpenAiKey("sk-proj-test"), "sk-proj-test");
});
