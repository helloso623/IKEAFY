import { test } from "node:test";
import assert from "node:assert/strict";
import { getPart } from "../server/lib/catalog.js";
import { manageBundle, routeCable } from "../server/lib/cables.js";

test("header to LED lead locks", () => {
  const nano = getPart("arduino-nano");
  const led = getPart("led-5mm");
  const route = routeCable(
    nano.ports.find((p) => p.id === "d13"),
    led.ports.find((p) => p.id === "anode"),
  );
  assert.equal(route.ok, true);
  assert.equal(route.locked, true);
});

test("USB mini does not mate a header", () => {
  const nano = getPart("arduino-nano");
  const route = routeCable(
    nano.ports.find((p) => p.id === "usb"),
    nano.ports.find((p) => p.id === "d2"),
  );
  assert.equal(route.ok, false);
});

test("raceway lowers slack vs loose loom", () => {
  const cables = [{ lengthMm: 300 }, { lengthMm: 300 }];
  const loose = manageBundle(cables, { style: "loose" });
  const race = manageBundle(cables, { style: "channeled" });
  assert.ok(race.slackBudgetMm < loose.slackBudgetMm);
});
