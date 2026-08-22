import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getPart } from "../server/lib/catalog.js";
import { officialGuide } from "../server/lib/ikeafy.js";
import {
  SPARES_POLICY,
  classifySpare,
  fittingsForStep,
  freeFittingsRequest,
  getFitting,
  listFreeFittings,
  listRequests,
  resetRequests,
} from "../server/lib/fittings.js";

beforeEach(() => {
  resetRequests();
});

test("every listed fitting is free and carries an article number", () => {
  const fittings = listFreeFittings();
  assert.ok(fittings.length >= 6);
  assert.ok(fittings.every((f) => f.free === true));
  assert.ok(fittings.every((f) => /\d{6}/.test(f.articleNumber)));
  assert.equal(getFitting("100347").name, "Screw");
  assert.equal(getFitting("999999"), null);
});

test("a stripped screw is a free fitting, a table top is not", () => {
  const screw = classifySpare({ note: "the screw stripped in the insert" });
  assert.equal(screw.free, true);
  assert.equal(screw.fitting.articleNumber, "100347");
  assert.equal(screw.reason, SPARES_POLICY.free);

  const top = classifySpare({ note: "the top is cracked", part: getPart("lack-top") });
  assert.equal(top.free, false);
  assert.equal(top.reason, SPARES_POLICY.paid);
  assert.equal(top.cost, getPart("lack-top").cost);

  const numbered = classifySpare({ articleNumber: "121714" });
  assert.equal(numbered.free, true);
  assert.equal(numbered.fitting.name, "Allen key");
});

test("no identifiable part number sends the user to the store", () => {
  const unknown = classifySpare({ note: "this mystery blob arrived smashed", photoName: "blob.jpg" });
  assert.equal(unknown.storeVisit, true);
  assert.equal(unknown.fitting, null);
  assert.match(unknown.reason, /store|spare parts desk/i);
});

test("the tightening step suggests the screw and the Allen key", () => {
  const guide = officialGuide();
  const fasten = guide.steps.find((s) => s.action === "fasten");
  const fittings = fittingsForStep(fasten);
  const numbers = fittings.map((f) => f.articleNumber);
  assert.ok(numbers.includes("100347"));
  assert.ok(numbers.includes("121714"));
  assert.deepEqual(fittingsForStep(null), []);
});

test("a free-fittings request costs nothing and says where to send it", () => {
  const request = freeFittingsRequest({
    productName: "LACK side table 55×55",
    productArticle: "304.499.08",
    fittings: [{ articleNumber: "100347", qty: 2 }, "121714"],
    stepNumber: 4,
    note: "one screw was missing from the bag",
    contact: { name: "Sam", email: "sam@example.com" },
  });

  assert.equal(request.cost, 0);
  assert.equal(request.free, true);
  assert.equal(request.status, "drafted");
  assert.equal(request.sent, false);
  assert.equal(request.fittings[0].qty, 2);
  assert.equal(request.fittings[1].name, "Allen key");
  assert.equal(request.channel.id, "web");
  assert.match(request.message, /free of charge/i);
  assert.match(request.message, /article 100347/);
  assert.match(request.message, /304\.499\.08/);
  assert.equal(listRequests().length, 1);
});

test("a photo sends you to the spare parts desk instead of the web form", () => {
  const request = freeFittingsRequest({
    productName: "LACK side table 55×55",
    fittings: ["118331"],
    photoName: "stripped-insert.jpg",
  });
  assert.equal(request.channel.id, "store");
  assert.match(request.message, /stripped-insert\.jpg/);
});

test("a chargeable component is kept out of the free list", () => {
  const request = freeFittingsRequest({
    productName: "LACK side table 55×55",
    fittings: [
      { articleNumber: "100347", qty: 1 },
      { articleNumber: "LACK-TOP", name: "LACK table top", free: false },
    ],
  });
  assert.equal(request.fittings.length, 1);
  assert.equal(request.chargeable.length, 1);
  assert.match(request.message, /chargeable component/i);
});
