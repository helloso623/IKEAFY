import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide, shoppingList, shoppingListAsync } from "../server/lib/ikeafy.js";
import {
  hasTavily,
  missingTools,
  neededTools,
  ownedTools,
  isOfficialIkeaPdfUrl,
  pickManualPdfHit,
  findIkeaManual,
  searchDiyOffers,
  searchFurniturePieceOffers,
  searchHardwareOffers,
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

test("construction search asks for dimensioned ways and excludes fastener catalogs", async () => {
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
    const offers = await searchFurniturePieceOffers(
      {
        modelDimensionsMm: { x: 900, y: 500, z: 740 },
        cutList: [
          { qty: 1, name: "table top", dimensions: "900 × 500 × 18 mm" },
          { qty: 4, name: "table leg", dimensions: "50 × 50 × 722 mm" },
        ],
        ways: [],
      },
      { fetchFn },
    );
    assert.match(query, /ways to physically build custom object 900 x 500 x 740 mm/i);
    assert.match(query, /construction method cut list shaped stock/i);
    assert.match(query, /-screws -bolts -fasteners -McMaster/);
    assert.equal(offers.length, 1);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("construction research includes the analyzed silhouette, support, material, and dimensions", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  let query = "";
  try {
    await searchFurniturePieceOffers(
      {
        name: "Round dining object",
        modelDimensionsMm: { x: 900, y: 900, z: 740 },
        profile: { topShape: "round", supportStyle: "central", materialFamily: "wood" },
        cutList: [{ qty: 1, name: "circular top", dimensions: "900 × 900 × 28 mm" }],
        ways: [],
      },
      {
        fetchFn: async (_url, init) => {
          query = JSON.parse(init.body).query;
          return { ok: true, json: async () => ({ results: [] }) };
        },
      },
    );
    assert.match(query, /900 x 900 x 740 mm/);
    assert.match(query, /round central wood silhouette/);
    assert.match(query, /circular top 900 × 900 × 28 mm/);
    assert.match(query, /-McMaster/);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("DIY research keeps boards and hardware offers in separate current-model groups", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  const queries = [];
  const fetchFn = async (_url, init = {}) => {
    const query = JSON.parse(init.body).query;
    queries.push(query);
    return {
      ok: true,
      json: async () => ({
        results: [
          query.includes("connection hardware")
            ? { title: "Mounting plates", url: "https://hardware.example/plates", content: "70 mm steel plates" }
            : { title: "Birch tabletop", url: "https://lumber.example/top", content: "900 mm cut board" },
        ],
      }),
    };
  };
  const build = {
    name: "Current changed table",
    modelDimensionsMm: { x: 900, y: 500, z: 740 },
    profile: { topShape: "rectangular", supportStyle: "four-leg", materialFamily: "wood" },
    cutList: [{ qty: 1, name: "table top", dimensions: "900 × 500 × 18 mm" }],
    hardwareLines: [{ qty: 4, name: "Table-leg mounting plate", dimensions: "70 × 70 mm" }],
    ways: [],
  };
  try {
    const directHardware = await searchHardwareOffers(build, { fetchFn });
    assert.equal(directHardware.length, 1);
    const offers = await searchDiyOffers(build, { fetchFn });
    assert.deepEqual(new Set(offers.map((offer) => offer.group)), new Set(["boards-and-stock", "hardware"]));
    assert.ok(queries.some((query) => /table top 900 × 500 × 18 mm/.test(query)));
    assert.ok(queries.some((query) => /Table-leg mounting plate 70 × 70 mm/.test(query)));
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

test("pickManualPdfHit accepts only an official IKEA PDF", () => {
  const hit = pickManualPdfHit([
    { title: "BILLY bookcase", url: "https://www.ikea.com/gb/en/p/billy-bookcase/" },
    { title: "BILLY manual mirror", url: "https://manuals.example/billy.pdf" },
    { title: "BILLY assembly instructions", url: "https://www.ikea.com/gb/en/assembly_instructions/billy.pdf" },
  ], "BILLY bookcase");
  assert.match(hit.url, /\.pdf$/);
  assert.equal(isOfficialIkeaPdfUrl(hit.url), true);
  assert.equal(isOfficialIkeaPdfUrl("https://manuals.example/billy.pdf"), false);
  assert.equal(isOfficialIkeaPdfUrl("https://www.ikea.com/gb/en/customer-service/assembly-instructions"), false);
});

test("findIkeaManual returns a visible official-catalog fallback without a Tavily key", async () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  let fetchCalls = 0;
  try {
    const found = await findIkeaManual("lack table", {
      fetchFn: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not run without a key");
      },
    });
    assert.equal(found.ok, false);
    assert.equal(found.partner, "tavily-standin");
    assert.equal(found.pdfBase64, null);
    assert.ok(found.catalog.some((row) => row.id === "lack-table"));
    assert.match(found.reason, /not configured/i);
    assert.match(found.reason, /official catalog/i);
    assert.match(found.manualSearchUrl, /^https:\/\/www\.ikea\.com\/us\/en\/search\//);
    assert.equal(fetchCalls, 0);
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
      assert.equal(init.headers.Authorization, "Bearer tvly-test");
      assert.equal(init.headers["Content-Type"], "application/json");
      const body = JSON.parse(init.body);
      assert.deepEqual(body.include_domains, ["ikea.com"]);
      assert.match(body.query, /assembly_instructions/);
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

test("findIkeaManual reports Tavily HTTP errors and keeps the manual-search fallback", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => JSON.stringify({ detail: { error: "temporarily unavailable" } }),
    };
  };
  try {
    const found = await findIkeaManual("BILLY bookcase", {
      fetchFn,
      retries: 1,
      sleepFn: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(found.ok, false);
    assert.equal(found.httpStatus, 503);
    assert.match(found.reason, /HTTP 503/);
    assert.match(found.reason, /temporarily unavailable/);
    assert.match(found.manualSearchUrl, /ikea\.com/);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("findIkeaManual reports the cause of thrown network errors after bounded retries", async () => {
  const previous = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "tvly-test";
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND api.tavily.com"), {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "api.tavily.com",
    });
    throw new TypeError("fetch failed", { cause });
  };
  try {
    const found = await findIkeaManual("BILLY bookcase", {
      fetchFn,
      retries: 1,
      sleepFn: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(found.ok, false);
    assert.equal(found.errorCause, "dns");
    assert.match(found.reason, /DNS lookup failed/);
    assert.match(found.reason, /ENOTFOUND/);
    assert.match(found.reason, /2 attempts/);
    assert.match(found.manualSearchUrl, /ikea\.com/);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});
