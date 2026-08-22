import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide, shoppingList, shoppingListAsync } from "../server/lib/ikeafy.js";
import {
  hasTavily,
  missingTools,
  neededTools,
  ownedTools,
  pickManualPdfHit,
  findIkeaManual,
  searchToolOffers,
} from "../server/lib/tavily.js";

test("ownedTools reads the builder's notes", () => {
  assert.deepEqual(ownedTools("I have a screwdriver and a hammer.").sort(), ["hammer", "screwdriver"]);
  assert.ok(ownedTools("hex key in the drawer").includes("allen-key"));
});

test("missing tools are the ones not in the box and not on the bench", () => {
  const guide = parseGuide(
    `Crate\n1. Screw the side onto the base with a screwdriver.\n2. Tap the dowels with a mallet.`,
  );
  assert.ok(neededTools(guide).includes("screwdriver"));
  assert.ok(neededTools(guide).includes("hammer"));
  const missing = missingTools(guide);
  assert.ok(missing.includes("screwdriver"));
  const owned = parseGuide(
    `Crate\n1. Screw the side onto the base with a screwdriver.`,
    { instructions: "I already have a screwdriver." },
  );
  assert.equal(missingTools(owned).includes("screwdriver"), false);
});

test("shopping list marks owned tools and keeps extras to purchase", () => {
  const guide = parseGuide(`Shelf\n1. Screw the rail on with a screwdriver.`, {
    instructions: "I have a screwdriver.",
  });
  const list = shoppingList(guide);
  assert.ok(list.owned.some((line) => line.id === "screwdriver"));
  assert.equal(list.owned[0].badge, "owned");
});

test("hasTavily is false without a key", () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    assert.equal(hasTavily(), false);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("Tavily search maps IKEA and Amazon hits into shop offers", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  const fetchFn = async (url, init = {}) => {
    assert.match(String(url), /api\.tavily\.com\/search/);
    const body = JSON.parse(init.body);
    assert.match(body.query, /screwdriver/i);
    return {
      ok: true,
      json: async () => ({
        results: [
          { title: "IKEA screwdriver", url: "https://www.ikea.com/gb/en/search/?q=screwdriver", content: "IKEA listing" },
          { title: "Amazon screwdriver", url: "https://www.amazon.co.uk/s?k=screwdriver", content: "Buy online" },
        ],
      }),
    };
  };
  try {
    const offers = await searchToolOffers("Phillips screwdriver", { fetchFn });
    assert.ok(offers.some((o) => o.store === "IKEA" && /ikea\.com/.test(o.url)));
    assert.ok(offers.some((o) => o.store === "Amazon" && /amazon/.test(o.url)));
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("shoppingListAsync fills live retailers when Tavily is keyed", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  const fetchFn = async () => ({
    ok: true,
    json: async () => ({
      results: [
        { title: "Amazon hex key", url: "https://www.amazon.com/s?k=allen+key", content: "hex keys" },
        { title: "IKEA allen key", url: "https://www.ikea.com/search?q=allen+key", content: "fittings" },
      ],
    }),
  });
  try {
    const guide = parseGuide(`Box\n1. Tighten the cam lock with an allen key.`);
    const list = await shoppingListAsync(guide, { fetchFn });
    assert.equal(list.partner, "tavily");
    const extra = list.extra.find((line) => line.id === "allen-key") || list.missing.find((line) => line.id === "allen-key");
    assert.ok(extra, "allen-key should be to purchase when it is not in a kit");
    assert.ok(extra.retailers.some((o) => o.live && o.url));
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("pickManualPdfHit prefers an IKEA assembly PDF", () => {
  const hit = pickManualPdfHit([
    { title: "BILLY bookcase", url: "https://www.ikea.com/gb/en/p/billy-bookcase/" },
    { title: "BILLY assembly instructions", url: "https://www.ikea.com/gb/en/assembly_instructions/billy.pdf" },
  ]);
  assert.match(hit.url, /\.pdf$/);
});

test("findIkeaManual uses a catalog stand-in without a Tavily key", async () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const found = await findIkeaManual("lack table");
    assert.equal(found.ok, false);
    assert.equal(found.partner, "tavily-standin");
    assert.equal(found.pdfBase64, null);
    assert.ok(found.catalog.some((row) => row.id === "lack-table"));
    assert.match(found.reason, /TAVILY_API_KEY/);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("findIkeaManual fetches the PDF Tavily returned, not a side scrape", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (String(url).includes("api.tavily.com")) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: "MALM assembly instructions",
              url: "https://www.ikea.com/assembly_instructions/malm.pdf",
              content: "IKEA PDF",
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      arrayBuffer: async () => Buffer.from("%PDF-1.4 fake manual"),
    };
  };
  try {
    const found = await findIkeaManual("MALM dresser", { fetchFn });
    assert.equal(found.ok, true);
    assert.equal(found.partner, "tavily");
    assert.equal(found.pdfUrl, "https://www.ikea.com/assembly_instructions/malm.pdf");
    assert.ok(found.pdfBase64);
    assert.equal(Buffer.from(found.pdfBase64, "base64").subarray(0, 5).toString(), "%PDF-");
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /api\.tavily\.com\/search/);
    assert.equal(calls[1].url, found.pdfUrl);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});
