import assert from "node:assert/strict";
import test from "node:test";

import { buildPacketHtml } from "../client/src/build-packet.js";

test("print packet contains BOM sources and parsed custom steps", () => {
  const html = buildPacketHtml({
    pdf: { filename: "table-bom.pdf" },
    bom: {
      name: "Table <one>",
      scope: "Hardware only",
      estimatedTotal: 4.5,
      currency: "USD",
      lines: [
        {
          qty: 4,
          name: "M6 screw",
          why: "Fits the joint",
          dimensions: "M6 × 12 mm",
          shape: "socket head",
          estimatedCost: 0.8,
          sources: [{ store: "McMaster-Carr", url: "https://www.mcmaster.com/products/socket-head-screws/" }],
        },
      ],
      liveSources: [],
      disclaimer: "Verify before drilling.",
    },
    assembly: {
      guide: {
        steps: [{ action: "fasten", body: "Install the screws." }],
      },
    },
  });

  assert.match(html, /Table &lt;one&gt;/);
  assert.match(html, /McMaster-Carr/);
  assert.match(html, /Custom IKEAlive steps/);
  assert.match(html, /Install the screws/);
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
