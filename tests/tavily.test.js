import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide, shoppingList, shoppingListAsync } from "../server/lib/ikeafy.js";
import {
  clearOfferCache,
  describeOfferReason,
  enrichShopping,
  hasTavily,
  missingTools,
  neededTools,
  offerCacheSize,
  offersFromResults,
  ownedTools,
  parsePrice,
  pickManualPdfHit,
  findIkeaManual,
  scoreOfferHit,
  searchBuildWayOffers,
  searchToolOffers,
  searchToolOffersDetailed,
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

test("ways-to-make research asks for methods and shaped pieces instead of fasteners", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  let query = "";
  const fetchFn = async (_url, init = {}) => {
    query = JSON.parse(init.body).query;
    return {
      ok: true,
      json: async () => ({
        results: [{ title: "Custom table plan", url: "https://example.com/table-plan", content: "Cut list" }],
      }),
    };
  };
  try {
    const offers = await searchBuildWayOffers(
      {
        modelDimensionsMm: { x: 900, y: 500, z: 740 },
        lines: [
          { qty: 1, name: "table top", dimensions: "900 × 500 × 18 mm" },
          { qty: 4, name: "table leg", dimensions: "50 × 50 × 722 mm" },
        ],
        ways: [],
      },
      { fetchFn },
    );
    assert.match(query, /ways to build custom table/i);
    assert.match(query, /cut list|tabletop|table legs/i);
    assert.match(query, /-screws -bolts -fasteners/);
    assert.equal(offers.length, 1);
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

/* ------------------------------------------------------------------ */
/* Ranking, prices, store spread                                       */
/* ------------------------------------------------------------------ */

test("parsePrice reads symbols, trailing marks, and comma decimals", () => {
  assert.deepEqual(parsePrice("$12.99"), { amount: 12.99, currency: "USD", display: "$12.99" });
  assert.equal(parsePrice("£9.50").amount, 9.5);
  assert.equal(parsePrice("£9.50").currency, "GBP");
  assert.equal(parsePrice("12,99 €").amount, 12.99);
  assert.equal(parsePrice("12,99 €").currency, "EUR");
  assert.equal(parsePrice("US$1,299.00").amount, 1299);
  assert.equal(parsePrice("1.299,00 €").amount, 1299);
  assert.equal(parsePrice("EUR 15.00").amount, 15);
  assert.equal(parsePrice("149 kr").currency, "SEK");
  assert.equal(parsePrice("CA$34,95").amount, 34.95);
});

test("parsePrice refuses counts, ratings, and free items", () => {
  assert.equal(parsePrice("Only 24 left in stock"), null);
  assert.equal(parsePrice("4.5 stars from 1,203 reviews"), null);
  assert.equal(parsePrice("Ships in 2 days"), null);
  assert.equal(parsePrice("$0.00"), null);
  assert.equal(parsePrice("a 2024 buying guide"), null);
  assert.equal(parsePrice(""), null);
});

test("offersFromResults ranks buyable product pages over blogs and video", () => {
  const offers = offersFromResults(
    [
      {
        title: "The 10 Best Hammers of 2024 — Buying Guide",
        url: "https://toolblog.example.com/blog/best-hammers-2024",
        content: "we tested hammers",
      },
      { title: "How to use a claw hammer", url: "https://www.youtube.com/watch?v=abc", content: "video" },
      { title: "Claw Hammer 16oz", url: "https://www.amazon.com/dp/B00ABCDEF", content: "Claw hammer, $14.99, in stock" },
      { title: "Stanley Claw Hammer", url: "https://www.screwfix.com/p/stanley-claw-hammer/1234x", content: "£11.99 each" },
    ],
    { query: "claw hammer" },
  );
  assert.equal(offers[0].url, "https://www.amazon.com/dp/B00ABCDEF");
  assert.equal(offers.some((o) => /youtube/.test(o.url)), false, "video is never a purchase link");
  assert.equal(offers.some((o) => /toolblog/.test(o.url)), false, "a listicle is never a purchase link");
});

test("offers carry the price parsed out of the hit", () => {
  const offers = offersFromResults(
    [{ title: "Claw Hammer 16oz", url: "https://www.amazon.com/dp/B00ABCDEF", content: "Claw hammer, $14.99, in stock" }],
    { query: "claw hammer" },
  );
  assert.equal(offers[0].price, 14.99);
  assert.equal(offers[0].currency, "USD");
  assert.equal(offers[0].priceText, "$14.99");
});

test("offersFromResults spreads picks across distinct stores", () => {
  const hit = (n, host, path) => ({
    title: `Screwdriver ${n}`,
    url: `https://www.${host}${path}${n}`,
    content: "screwdriver $9.99",
  });
  const offers = offersFromResults(
    [
      hit(1, "amazon.com", "/dp/A"),
      hit(2, "amazon.com", "/dp/B"),
      hit(3, "amazon.com", "/dp/C"),
      hit(4, "amazon.com", "/dp/D"),
      hit(5, "screwfix.com", "/p/x"),
      hit(6, "ikea.com", "/gb/en/p/y"),
    ],
    { query: "screwdriver", limit: 4 },
  );
  const stores = new Set(offers.map((o) => o.store));
  assert.equal(offers.length, 4);
  assert.ok(stores.size >= 3, `expected a spread of stores, got ${[...stores]}`);
  assert.equal(offers.filter((o) => o.store === "Amazon").length, 2, "one domain cannot take every slot");
});

test("offersFromResults drops duplicate urls and keeps plan-mode write-ups", () => {
  const deduped = offersFromResults(
    [
      { title: "A", url: "https://www.amazon.com/dp/A", content: "$5.00" },
      { title: "A again", url: "https://amazon.com/dp/A/", content: "$5.00" },
    ],
    { query: "clamp" },
  );
  assert.equal(deduped.length, 1);

  const plans = offersFromResults(
    [{ title: "Farmhouse table plan", url: "https://plans.example.com/blog/table", content: "Full cut list and dimensions" }],
    { query: "table", mode: "plan" },
  );
  assert.equal(plans.length, 1, "plan mode keeps build write-ups that retail mode would reject");
});

test("scoreOfferHit prefers a hit whose title matches what was asked for", () => {
  const terms = ["spirit", "level"];
  const onTopic = scoreOfferHit(
    { title: "Spirit level 600mm", url: "https://www.screwfix.com/p/spirit-level/1", content: "£12.99" },
    { terms },
  );
  const offTopic = scoreOfferHit(
    { title: "Garden hose", url: "https://www.screwfix.com/p/garden-hose/2", content: "£12.99" },
    { terms },
  );
  assert.ok(onTopic > offTopic, `${onTopic} should beat ${offTopic}`);
});

/* ------------------------------------------------------------------ */
/* Transport: timeouts, retry, cache, error modes                      */
/* ------------------------------------------------------------------ */

const KEYED = "tvly-test";

/** Run body with a Tavily key set (or removed) and a clean cache. */
async function withKey(value, body) {
  const previous = process.env.TAVILY_API_KEY;
  if (value === null) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = value;
  clearOfferCache();
  try {
    return await body();
  } finally {
    clearOfferCache();
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
}

const okResults = (results) => async () => ({ ok: true, status: 200, json: async () => ({ results }) });

const PRODUCT_HIT = [{ title: "Hex key set", url: "https://www.amazon.com/dp/B0HEX", content: "hex keys $7.99" }];

test("searchToolOffers passes an abort signal so a request cannot hang", async () => {
  await withKey(KEYED, async () => {
    let seen = null;
    const fetchFn = async (_url, init = {}) => {
      seen = init.signal;
      return { ok: true, status: 200, json: async () => ({ results: PRODUCT_HIT }) };
    };
    await searchToolOffers("hex key", { fetchFn });
    assert.ok(seen, "every Tavily call carries a signal");
    assert.equal(typeof seen.aborted, "boolean");
  });
});

test("a hung request times out instead of waiting forever", async () => {
  await withKey(KEYED, async () => {
    const fetchFn = (_url, init = {}) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    const found = await searchToolOffersDetailed("hex key", {
      fetchFn,
      timeoutMs: 20,
      attempts: 2,
      sleepFn: async () => {},
    });
    assert.equal(found.ok, false);
    assert.equal(found.reason, "timeout");
    assert.deepEqual(found.offers, []);
  });
});

test("transient failures are retried with backoff, then succeed", async () => {
  await withKey(KEYED, async () => {
    const waits = [];
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 429, json: async () => ({}) };
      if (calls === 2) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ results: PRODUCT_HIT }) };
    };
    const found = await searchToolOffersDetailed("hex key", {
      fetchFn,
      sleepFn: async (ms) => waits.push(ms),
      attempts: 3,
    });
    assert.equal(calls, 3);
    assert.equal(found.ok, true);
    assert.equal(found.offers.length, 1);
    assert.deepEqual(waits, [250, 500], "backoff doubles between attempts");
  });
});

test("retries are bounded and end as rate-limited", async () => {
  await withKey(KEYED, async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { ok: false, status: 429, json: async () => ({}) };
    };
    const found = await searchToolOffersDetailed("hex key", { fetchFn, sleepFn: async () => {}, attempts: 3 });
    assert.equal(calls, 3, "retry does not loop forever");
    assert.equal(found.reason, "rate-limited");
    assert.equal(found.status, 429);
    assert.equal(found.ok, false);
  });
});

test("an auth failure is never retried", async () => {
  await withKey(KEYED, async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { ok: false, status: 401, json: async () => ({}) };
    };
    const found = await searchToolOffersDetailed("hex key", { fetchFn, sleepFn: async () => {}, attempts: 3 });
    assert.equal(calls, 1, "a bad key stays bad — do not burn retries on it");
    assert.equal(found.reason, "auth");
    assert.equal(found.status, 401);
  });
});

test("a network error is retried and finally reported as network", async () => {
  await withKey(KEYED, async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    };
    const found = await searchToolOffersDetailed("hex key", { fetchFn, sleepFn: async () => {}, attempts: 2 });
    assert.equal(calls, 2);
    assert.equal(found.reason, "network");
  });
});

test("each failure mode is named and has a sentence for the UI", async () => {
  await withKey(null, async () => {
    const found = await searchToolOffersDetailed("hex key", { fetchFn: okResults(PRODUCT_HIT) });
    assert.equal(found.reason, "no-key");
    assert.deepEqual(found.offers, []);
  });
  await withKey(KEYED, async () => {
    const empty = await searchToolOffersDetailed("", { fetchFn: okResults(PRODUCT_HIT) });
    assert.equal(empty.reason, "empty-query");

    const none = await searchToolOffersDetailed("hex key", { fetchFn: okResults([]) });
    assert.equal(none.ok, false);
    assert.equal(none.reason, "no-results");

    const prose = await searchToolOffersDetailed("hex key", {
      fetchFn: okResults([
        { title: "Top 10 hex keys", url: "https://blog.example.com/blog/top-10", content: "we ranked them" },
      ]),
    });
    assert.equal(prose.reason, "no-results", "prose-only results are no results at all");
  });
  for (const reason of ["no-key", "auth", "rate-limited", "timeout", "network", "http", "no-results"]) {
    assert.equal(typeof describeOfferReason(reason), "string");
    assert.ok(describeOfferReason(reason).length > 10, `${reason} needs a real sentence`);
  }
  assert.equal(describeOfferReason(null), null);
});

test("repeat lookups hit the cache instead of the API, and expire on TTL", async () => {
  await withKey(KEYED, async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ results: PRODUCT_HIT }) };
    };
    let clock = 1000;
    const nowFn = () => clock;
    const deps = { fetchFn, nowFn, ttlMs: 5000 };

    const first = await searchToolOffersDetailed("hex key", deps);
    assert.equal(calls, 1);
    assert.equal(first.cached, false);

    const second = await searchToolOffersDetailed("HEX   Key", deps);
    assert.equal(calls, 1, "the query is normalised before it is keyed");
    assert.equal(second.cached, true);
    assert.deepEqual(second.offers, first.offers);

    clock += 5001;
    const third = await searchToolOffersDetailed("hex key", deps);
    assert.equal(calls, 2, "an expired entry is refetched");
    assert.equal(third.cached, false);
  });
});

test("the cache is bounded and clearable", async () => {
  await withKey(KEYED, async () => {
    assert.equal(offerCacheSize(), 0);
    const fetchFn = okResults(PRODUCT_HIT);
    for (let i = 0; i < 250; i += 1) {
      await searchToolOffersDetailed(`tool number ${i}`, { fetchFn });
    }
    assert.ok(offerCacheSize() <= 200, `cache must stay capped, saw ${offerCacheSize()}`);
    clearOfferCache();
    assert.equal(offerCacheSize(), 0);
  });
});

test("failures are never cached", async () => {
  await withKey(KEYED, async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ results: PRODUCT_HIT }) };
    };
    const first = await searchToolOffersDetailed("hex key", { fetchFn, sleepFn: async () => {}, attempts: 1 });
    assert.equal(first.ok, false);
    const second = await searchToolOffersDetailed("hex key", { fetchFn, sleepFn: async () => {}, attempts: 1 });
    assert.equal(second.ok, true, "a failed lookup must not poison the cache");
  });
});

/* ------------------------------------------------------------------ */
/* Tool vocabulary                                                     */
/* ------------------------------------------------------------------ */

test("the tool vocabulary covers real assembly work", () => {
  const step = (body) => neededTools({ steps: [{ body }] });
  assert.ok(step("Tighten the bolt with a spanner.").includes("spanner"));
  assert.ok(step("Cut the rail with a hand saw.").includes("saw"));
  assert.ok(step("Check it with a spirit level.").includes("spirit-level"));
  assert.ok(step("Mark 400mm with a tape measure.").includes("tape-measure"));
  assert.ok(step("Grip the dowel with pliers.").includes("pliers"));
  assert.ok(step("Apply wood glue to the tenon.").includes("wood-glue"));
  assert.ok(step("Clamp the joint overnight.").includes("clamps"));
  assert.ok(step("Locate the beam with a stud finder.").includes("stud-finder"));
  assert.ok(step("Trim the film with a utility knife.").includes("utility-knife"));
  assert.ok(step("Smooth the edge with sandpaper.").includes("sandpaper"));
  assert.ok(step("Pare the waste with a chisel.").includes("chisel"));
  assert.ok(step("Check the corner with a try square.").includes("try-square"));
  assert.ok(step("Drill a pilot hole first.").includes("drill-bits"));
  assert.ok(step("Push wall plugs into the masonry.").includes("wall-plugs"));
  assert.ok(step("Fit the ratchet and turn.").includes("socket-set"));
  assert.ok(step("Fix the backing with a staple gun.").includes("staple-gun"));
});

test("the new aliases do not fire on ordinary assembly prose", () => {
  const step = (body) => neededTools({ steps: [{ body }] });
  assert.deepEqual(step("I saw the dowel slide into place at eye level."), []);
  assert.deepEqual(step("The opening is 10 square cm."), []);
  assert.deepEqual(step("Set the top down on a level surface."), []);
  assert.deepEqual(step("Tape the cable run under the top."), []);
  assert.deepEqual(step("The veneer is glued at the factory."), []);
  assert.deepEqual(step("Take your own measurements before you start."), []);
});

test("the built-in LACK guide still asks for exactly the allen key", () => {
  const guide = parseGuide(
    `LACK side table\n1. Unpack the table top and four legs. Keep the Allen key from the bag.\n2. Screw each leg in by hand, then snug with the Allen key.`,
  );
  assert.deepEqual(neededTools(guide), ["allen-key"]);
});

test("ownedTools reads the widened vocabulary out of the builder's notes", () => {
  const owned = ownedTools("I have a spirit level, a tape measure and some clamps in the shed.");
  assert.ok(owned.includes("spirit-level"));
  assert.ok(owned.includes("tape-measure"));
  assert.ok(owned.includes("clamps"));
});

/* ------------------------------------------------------------------ */
/* enrichShopping                                                      */
/* ------------------------------------------------------------------ */

test("the no-key stand-in path keeps every catalog link and says why", async () => {
  await withKey(null, async () => {
    const guide = parseGuide(`Box\n1. Tighten the cam lock with an allen key.`);
    const plain = shoppingList(guide);
    const list = await shoppingListAsync(guide, {
      fetchFn: async () => {
        throw new Error("the no-key path must never touch the network");
      },
    });
    assert.equal(list.partner, "tavily-standin");
    assert.equal(list.live, false);
    assert.equal(list.degraded, "no-key");
    assert.match(list.degradedNote, /TAVILY_API_KEY/);
    const line = list.extra.find((row) => row.id === "allen-key");
    assert.ok(line, "the allen key is still on the list");
    assert.ok(line.retailers.length > 0, "catalog shop links survive");
    assert.ok(line.retailers.every((offer) => offer.url));
    assert.equal(list.lines.length, plain.lines.length);
  });
});

test("enrichShopping does not mutate the list it was handed", async () => {
  await withKey(KEYED, async () => {
    const guide = parseGuide(`Box\n1. Tighten the cam lock with an allen key.`);
    const list = shoppingList(guide);
    const before = list.extra.find((row) => row.id === "allen-key");
    const beforeRetailers = before.retailers;
    const enriched = await enrichShopping(list, { fetchFn: okResults(PRODUCT_HIT) });

    assert.equal(before.retailers, beforeRetailers, "the caller's line keeps its own offers");
    assert.equal(before.live, undefined, "the caller's line is untouched");
    const after = enriched.extra.find((row) => row.id === "allen-key");
    assert.notEqual(after, before, "the enriched row is a fresh object");
    assert.equal(after.live, true);
    assert.equal(after.retailers[0].url, "https://www.amazon.com/dp/B0HEX");
    // The same replacement object appears in every array it belongs to.
    assert.equal(enriched.missing.find((row) => row.id === "allen-key"), after);
    assert.equal(enriched.lines.find((row) => row.id === "allen-key"), after);
    assert.equal(enriched.suggestedExtras.find((row) => row.id === "allen-key"), after);
  });
});

test("a failed lookup is named on the line and on the list, not swallowed", async () => {
  await withKey(KEYED, async () => {
    const guide = parseGuide(`Box\n1. Tighten the cam lock with an allen key.`);
    const list = await enrichShopping(shoppingList(guide), {
      fetchFn: async () => ({ ok: false, status: 401, json: async () => ({}) }),
      sleepFn: async () => {},
    });
    assert.equal(list.live, false);
    assert.equal(list.degraded, "auth");
    assert.match(list.degradedNote, /key/i);
    assert.equal(list.offerErrors.length, 1);
    assert.equal(list.offerErrors[0].id, "allen-key");
    assert.equal(list.offerErrors[0].status, 401);
    const line = list.extra.find((row) => row.id === "allen-key");
    assert.equal(line.offerStatus, "standin");
    assert.equal(line.offerReason, "auth");
    assert.ok(line.retailers.length > 0, "catalog links are still there to fall back on");
  });
});

test("a thrown lookup cannot take out the whole shopping list", async () => {
  await withKey(KEYED, async () => {
    const guide = parseGuide(`Box\n1. Tighten the cam lock with an allen key.`);
    const list = await enrichShopping(shoppingList(guide), {
      fetchFn: async () => {
        throw new Error("boom");
      },
      sleepFn: async () => {},
      attempts: 1,
    });
    assert.equal(list.live, false);
    assert.equal(list.degraded, "network");
    assert.ok(list.extra.find((row) => row.id === "allen-key"));
  });
});
