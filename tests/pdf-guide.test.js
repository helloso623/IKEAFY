import { test } from "node:test";
import assert from "node:assert/strict";
import { isPdfFile, PDF_PAGE_LIMIT } from "../client/src/pdf-guide.js";

test("isPdfFile accepts IKEA manuals by type or .pdf name", () => {
  assert.equal(isPdfFile({ name: "billy-bookcase-white__AA-2069584-3-1.pdf", type: "application/pdf" }), true);
  assert.equal(isPdfFile({ name: "guide.PDF", type: "" }), true);
  assert.equal(isPdfFile({ name: "plate.png", type: "image/png" }), false);
  assert.equal(isPdfFile(null), false);
  assert.equal(PDF_PAGE_LIMIT >= 6, true);
});
