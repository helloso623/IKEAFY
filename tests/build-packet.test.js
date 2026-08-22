import assert from "node:assert/strict";
import test from "node:test";

import { buildPacketHtml } from "../client/src/build-packet.js";

test("print packet contains furniture pieces and parsed todo steps", () => {
  const html = buildPacketHtml({
    pdf: { filename: "table-piece-plan.pdf" },
    bom: {
      name: "Table <one>",
      scope: "Furniture pieces matched to this model",
      estimatedTotal: 34.5,
      currency: "USD",
      similarityScore: 96,
      similarity: { reason: "rectangular top / four-leg support" },
      ways: [
        {
          title: "Cut top + ready-made legs",
          recommended: true,
          summary: "Make the current shape from a cut panel and four legs.",
          joinery: "Use the attachment system supplied with the legs.",
          additionalPieces: [],
          similarity: { score: 96, dimensions: 100, silhouette: 100, material: 80, pieceBreakdown: 100 },
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
      hardwareLines: [
        {
          qty: 4,
          name: "Table-leg mounting plate",
          why: "Connects each modeled leg.",
          dimensions: "70 × 70 mm",
          material: "zinc-plated steel",
          estimatedCost: 18,
          sources: [{ store: "Hardware search", url: "https://example.com/mounting-plate" }],
        },
      ],
      liveSources: [
        {
          group: "boards-and-stock",
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
  assert.match(html, /IKEAlive DIY plan/);
  assert.match(html, /Build method/);
  assert.match(html, /Cut top \+ ready-made legs/);
  assert.match(html, /96% similar/);
  assert.match(html, /dimensions 100%.*silhouette 100%/);
  assert.match(html, /Shaped pieces to buy or cut/);
  assert.match(html, /birch plywood/);
  assert.match(html, /Connection hardware/);
  assert.match(html, /Table-leg mounting plate/);
  assert.match(html, /Live component sources/);
  assert.match(html, /Cut-to-size table plan/);
  assert.match(html, /Numbered build steps/);
  assert.match(html, /Cut the top to its modeled size/);
  assert.doesNotMatch(html, /McMaster/i);
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
