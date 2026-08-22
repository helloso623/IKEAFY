import assert from "node:assert/strict";
import test from "node:test";

import { buildPacketHtml } from "../client/src/build-packet.js";

test("print packet contains construction ways, cut pieces, and parsed todo steps", () => {
  const html = buildPacketHtml({
    pdf: { filename: "table-ways-to-make.pdf" },
    bom: {
      name: "Table <one>",
      scope: "Construction ways and cut pieces for this model",
      estimatedTotal: 34.5,
      currency: "USD",
      ways: [
        {
          title: "Cut top + ready-made legs",
          recommended: true,
          summary: "Make the current shape from a cut panel and four legs.",
          joinery: "Use the attachment system supplied with the legs.",
          additionalCuts: [],
          sources: [{ store: "Build plan", url: "https://example.com/table-plan" }],
        },
      ],
      cutList: [
        {
          qty: 1,
          name: "Cut-to-size table top",
          why: "Matches the model.",
          dimensions: "900 × 500 × 18 mm",
          shape: "rectangular slab",
          material: "birch plywood",
          estimatedCost: 34.5,
          sources: [{ store: "Cut-to-size search", url: "https://example.com/cut-panel" }],
        },
      ],
      liveSources: [
        {
          group: "method",
          title: "Cut-to-size table plan",
          url: "https://example.com/live-plan",
        },
      ],
      disclaimer: "Verify before cutting.",
    },
    assembly: {
      guide: {
        steps: [{ action: "prepare", body: "Cut the top to its modeled size." }],
      },
    },
  });

  assert.match(html, /Table &lt;one&gt;/);
  assert.match(html, /Candidate piece routes/);
  assert.match(html, /Cut top \+ ready-made legs/);
  assert.match(html, /Pieces for this table/);
  assert.match(html, /birch plywood/);
  assert.match(html, /Live piece matches/);
  assert.match(html, /Cut-to-size table plan/);
  assert.match(html, /IKEAlive watch \/ plan \/ todo/);
  assert.match(html, /Cut the top to its modeled size/);
  assert.doesNotMatch(html, /hardware|McMaster/i);
  assert.match(html, /@page/);
});

test("print packet drops unsafe source URLs", () => {
  const html = buildPacketHtml({
    bom: {
      lines: [
        {
          qty: 1,
          name: "brace",
          sources: [{ store: "bad", url: "javascript:alert(1)" }],
        },
      ],
    },
  });
  assert.doesNotMatch(html, /javascript:/);
});
