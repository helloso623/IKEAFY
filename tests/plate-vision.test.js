import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFalVisionGuide } from "../server/lib/plate-vision.js";

test("parseFalVisionGuide reads fal JSON with body fields", () => {
  const guide = parseFalVisionGuide(
    JSON.stringify({
      title: "ALHULT",
      steps: [{ number: 1, body: "Place panel A.", action: "place", partsUsed: ["A"], warnings: [] }],
    }),
  );
  assert.equal(guide.title, "ALHULT");
  assert.equal(guide.steps.length, 1);
  assert.equal(guide.steps[0].body, "Place panel A.");
});

test("parseFalVisionGuide accepts fenced JSON and instruction aliases", () => {
  const guide = parseFalVisionGuide(`Here is the guide:
\`\`\`json
{"title":"Shelf","steps":[{"sequence_number":"2","instruction":"Hang the rail.","action":"place"}]}
\`\`\``);
  assert.equal(guide.title, "Shelf");
  assert.equal(guide.steps[0].number, 2);
  assert.equal(guide.steps[0].body, "Hang the rail.");
});

test("parseFalVisionGuide returns null when steps are empty", () => {
  assert.equal(parseFalVisionGuide('{"title":"x","steps":[]}'), null);
  assert.equal(parseFalVisionGuide("not json at all"), null);
});
