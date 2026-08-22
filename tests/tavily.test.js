import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide, shoppingList, shoppingListAsync } from "../server/lib/ikeafy.js";
import {
  hasTavily,
  missingTools,
  neededTools,
  ownedTools,
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
