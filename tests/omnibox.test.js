import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeBenchCommand, looksLikeQuestion } from "../client/src/omnibox.js";

test("omnibox treats bench generation as an ask", () => {
  assert.equal(looksLikeQuestion("add a lack table"), true);
  assert.equal(looksLikeQuestion("put four legs"), true);
  assert.equal(looksLikeQuestion("generate a lamp"), true);
  assert.equal(looksLikeBenchCommand("generate a lamp"), true);
  assert.equal(looksLikeQuestion("lack"), false);
});
