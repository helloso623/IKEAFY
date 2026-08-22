import { test } from "node:test";
import assert from "node:assert/strict";
import { requestSpare } from "../server/lib/spares.js";

test("builds a free IKEA spare request from a step part", () => {
  const guide = {
    title: "LACK side table",
    steps: [
      {
        number: 4,
        body: "Start the fastener by hand.",
        partsUsed: ["m6-screw"],
      },
    ],
  };

  const result = requestSpare({
    guide,
    stepNumber: 4,
    note: "The fitting is missing.",
    photoName: "missing-fitting.jpg",
  });

  assert.equal(result.ok, true);
  assert.equal(result.storeVisit, false);
  assert.equal(result.article, "SCR-M6-12");
  assert.equal(result.partName, "M6 × 12 machine screw");
  assert.equal(result.where, "ikea.com/customer-service");
  assert.match(result.requestLetter, /free replacement fitting/i);
  assert.match(result.requestLetter, /missing-fitting\.jpg/);
});

test("sends the user to a store when no part number can be inferred", () => {
  const result = requestSpare({
    guide: {
      title: "Unknown shelf",
      steps: [{ number: 2, body: "Inspect the damaged area.", partsUsed: [] }],
    },
    stepNumber: 2,
    photoName: "damage.jpg",
  });

  assert.deepEqual(result, {
    ok: true,
    storeVisit: true,
    article: null,
    message:
      'No part number could be identified. Take the photo "damage.jpg" and the product to the IKEA store so staff can match the fitting.',
  });
});
