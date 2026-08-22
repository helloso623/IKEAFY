import { getPart, retailerOffers, searchParts } from "./catalog.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

const SEARCH_URL = "https://api.tavily.com/search";

const TOOL_ALIASES = [
  ["allen-key", /allen[-\s]?key|hex key|ikea key/],
  ["screwdriver", /screw[-\s]?driver|phillips|pozi/],
  ["hammer", /\bhammer\b|\bmallet\b/],
  ["drill", /\bdrill\b/],
  ["soldering-iron", /solder/],
  ["multimeter", /multimeter|\bvolt\b/],
];

export function usableTavilyKey(value = process.env.TAVILY_API_KEY) {
  const key = String(value || "").trim();
  if (!key || /\s/.test(key)) return "";
  return key;
}

export function hasTavily() {
  return Boolean(usableTavilyKey());
}

export function ownedTools(text = "", extra = []) {
  const blob = String(text || "").toLowerCase();
  const owned = new Set(extra.map(String).filter(Boolean));
  for (const [id, pattern] of TOOL_ALIASES) {
    if (pattern.test(blob)) owned.add(id);
  }
  return [...owned];
}

export function neededTools(guide) {
  const needed = new Set();
  for (const step of guide?.steps || []) {
    if (step.toolRequired) needed.add(step.toolRequired);
    const blob = String(step.body || "");
    for (const [id, pattern] of TOOL_ALIASES) {
      if (pattern.test(blob.toLowerCase())) needed.add(id);
    }
    if (/\bscrew/i.test(blob) && !/allen|hex/i.test(blob)) needed.add("screwdriver");
  }
  return [...needed];
}

export function missingTools(guide) {
  const owned = new Set(ownedTools(guide?.instructions || ""));
  const kit = new Set(
    (guide?.bom?.included || []).filter((line) => line.category === "tool").map((line) => line.id),
  );
  return neededTools(guide).filter((id) => !owned.has(id) && !kit.has(id));
}

function shopFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("ikea.")) return "IKEA";
    if (host.includes("amazon.")) return "Amazon";
    if (/homebase|diy\.com|wickes|bauhaus|leroy/.test(host)) return "Hardware / local";
    return host.split(".")[0] || "Web";
  } catch {
    return "Web";
  }
}

function offersFromResults(results = []) {
  const offers = [];
  const seen = new Set();
  for (const hit of results) {
    const url = hit.url || hit.link;
    if (!url) continue;
    const store = shopFromUrl(url);
    const key = `${store}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push({
      store,
      url,
      title: hit.title || store,
      note: String(hit.content || "").replace(/\s+/g, " ").slice(0, 120) || null,
      price: null,
      live: true,
    });
    if (offers.length >= 4) break;
  }
  const stores = new Set(offers.map((o) => o.store));
  if (stores.size >= 2 || offers.length >= 2) return offers;
  return offers;
}

export async function searchToolOffers(name, { fetchFn = fetch } = {}) {
  const key = usableTavilyKey();
  if (!key || !name) return [];
  const query = `buy ${name} IKEA OR Amazon hardware store`;
  const res = await fetchFn(SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 6,
      include_answer: false,
    }),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return offersFromResults(json.results || json.data || []);
}

async function searchOfferQuery(query, key, fetchFn) {
  const res = await fetchFn(SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return offersFromResults(json.results || json.data || []);
}

/** One dimensions-bearing search for pieces that can make the current table. */
export async function searchFurniturePieceOffers(build = {}, { fetchFn = fetch } = {}) {
  const key = usableTavilyKey();
  const routePieces = (build.ways || []).flatMap((way) => way.additionalPieces || []);
  const items = [...(build.cutList || []), ...routePieces]
    .slice(0, 10)
    .map((line) => `${line.qty} ${line.name} ${line.dimensions || ""}`.trim())
    .filter(Boolean);
  if (!key || !items.length) return [];
  const dims = build.modelDimensionsMm || {};
  const profile = build.profile || {};
  const query =
    `ways to physically build ${build.name || "custom object"} ${dims.x || ""} x ${dims.y || ""} x ${dims.z || ""} mm ` +
    `${profile.topShape || ""} ${profile.supportStyle || ""} ${profile.materialFamily || ""} silhouette ` +
    `construction method cut list shaped stock ${items.join(" OR ")} -screws -bolts -fasteners -McMaster`;
  return searchOfferQuery(query, key, fetchFn);
}

function extraLineFromId(id) {
  const part = getPart(id);
  if (part) {
    return {
      id: part.id,
      name: part.name,
      qty: 1,
      cost: part.cost,
      store: part.store,
      storeUrl: part.storeUrl,
      ikeaArticle: part.ikeaArticle ?? null,
      included: false,
      extra: true,
      owned: false,
      category: part.category,
      color: part.color,
      texture: part.texture,
      badge: "to purchase",
      picture: { color: part.color, texture: part.texture },
      retailers: retailerOffers(part).offers,
      why: "Needed for this build and not in the box.",
    };
  }
  const label = id.replace(/-/g, " ");
  return {
    id,
    name: label,
    qty: 1,
    cost: null,
    store: null,
    storeUrl: null,
    ikeaArticle: null,
    included: false,
    extra: true,
    owned: false,
    category: "tool",
    color: "#c45c26",
    texture: "tool",
    badge: "to purchase",
    picture: { color: "#c45c26", texture: "tool" },
    retailers: retailerOffers({ name: label, cost: null, store: "Amazon" }).offers,
    why: "Needed for this build and not in the box.",
  };
}

export function classifyTools(bom, guide) {
  const locked = Boolean(guide?.locked || guide?.official);
  const owned = new Set(ownedTools(guide?.instructions || ""));
  const lines = [...(bom.lines || [])];
  if (!locked) {
    for (const line of lines) {
      if (line.category === "tool" && line.included) {
        line.included = false;
        line.extra = true;
        line.badge = "to purchase";
      }
    }
  }
  const present = new Set(lines.map((line) => line.id));
  for (const id of missingTools({ ...guide, bom: { ...bom, lines, included: lines.filter((l) => l.included) } })) {
    if (present.has(id)) continue;
    lines.push(extraLineFromId(id));
    present.add(id);
  }
  for (const line of lines) {
    if (line.category !== "tool") continue;
    if (owned.has(line.id) && !line.included) {
      line.owned = true;
      line.extra = false;
      line.badge = "owned";
      line.retailers = [];
      line.why = "You said you already have this.";
    }
  }
  const included = lines.filter((line) => line.badge === "included");
  const ownedLines = lines.filter((line) => line.badge === "owned");
  const extra = lines.filter((line) => line.badge === "to purchase");
  return {
    ...bom,
    lines,
    included,
    owned: ownedLines,
    extra,
    missing: extra.filter((line) => line.category === "tool"),
  };
}

export async function enrichShopping(list, { fetchFn = fetch } = {}) {
  const local = {
    ...list,
    partner: hasTavily() ? "tavily" : "tavily-standin",
    live: false,
    suggestedExtras: list.missing || list.extra?.filter((line) => line.category === "tool") || [],
  };
  if (!hasTavily()) return local;

  const targets = [...new Map((local.suggestedExtras || []).map((line) => [line.id, line])).values()].slice(0, 5);
  await Promise.all(
    targets.map(async (line) => {
      try {
        const live = await searchToolOffers(line.name, { fetchFn });
        if (live.length) {
          line.retailers = live;
          line.live = true;
        }
      } catch {
        // Keep catalog shop links if Tavily is down.
      }
    }),
  );
  return { ...local, live: targets.some((line) => line.live) };
}

const MAX_MANUAL_BYTES = 10 * 1024 * 1024;

function catalogHitsForProduct(name) {
  return searchParts({ query: name, category: "furniture" })
    .slice(0, 5)
    .map((part) => ({
      id: part.id,
      name: part.name,
      ikeaArticle: part.ikeaArticle || null,
      storeUrl: part.storeUrl || null,
    }));
}

export function pickManualPdfHit(results = []) {
  const rows = (results || []).filter((hit) => hit?.url);
  const scored = rows.map((hit) => {
    const url = String(hit.url);
    const blob = `${url} ${hit.title || ""} ${hit.content || ""}`.toLowerCase();
    let score = 0;
    if (/\.pdf(\?|$)/i.test(url)) score += 8;
    if (/assembly_instructions|assembly-instructions/i.test(url)) score += 6;
    if (/ikea\./i.test(url)) score += 3;
    if (/assembly instructions|instruction (pdf|sheet)|building instruction/i.test(blob)) score += 4;
    if (/filetype:pdf|\.pdf/i.test(blob)) score += 2;
    return { hit, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored.find((row) => row.score >= 6);
  return best?.hit || null;
}

function filenameFromUrl(url, fallback = "ikea-manual.pdf") {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    if (/\.pdf$/i.test(base)) return base;
  } catch {
    // Keep the fallback name.
  }
  return fallback;
}

/**
 * Look up an IKEA product's official instructions PDF via Tavily, then fetch
 * the PDF Tavily returned. Without a key, return catalog furniture stand-ins.
 */
export async function findIkeaManual(productName, { fetchFn = fetch } = {}) {
  const name = String(productName || "").trim();
  if (!name) {
    return { ok: false, reason: "Type an IKEA product name." };
  }

  const catalog = catalogHitsForProduct(name);
  const standin = {
    ok: false,
    live: false,
    partner: "tavily-standin",
    query: name,
    catalog,
    pdfUrl: null,
    pdfBase64: null,
    filename: null,
    title: catalog[0]?.name || name,
  };

  if (!hasTavily()) {
    ikealiveLog("tavily", "manual stand-in", { query: name, catalog: catalog.map((c) => c.id) });
    return {
      ...standin,
      reason: catalog.length
        ? `No Tavily key — catalog stand-in for “${catalog[0].name}”. Set TAVILY_API_KEY to fetch the official IKEA PDF.`
        : "Set TAVILY_API_KEY to find the official IKEA instructions PDF.",
    };
  }

  const query = `IKEA ${name} assembly instructions PDF site:ikea.com`;
  ikealiveLog("tavily", "manual search", { query, keyed: true });
  const res = await fetchFn(SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${usableTavilyKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    ikealiveWarn("tavily", "search failed", { status: res.status });
    return { ...standin, partner: "tavily", live: false, reason: `Tavily search failed (${res.status}).` };
  }
  const json = await res.json();
  const results = json.results || json.data || [];
  const hit = pickManualPdfHit(results);
  if (!hit?.url) {
    ikealiveLog("tavily", "no pdf hit", { query: name, results: results.length });
    return {
      ...standin,
      partner: "tavily",
      live: true,
      reason: "Tavily found no IKEA instructions PDF for that name.",
    };
  }

  ikealiveLog("tavily", "fetch pdf", { url: hit.url, title: hit.title || null });
  const pdfRes = await fetchFn(hit.url);
  if (!pdfRes.ok) {
    ikealiveWarn("tavily", "pdf fetch failed", { url: hit.url, status: pdfRes.status });
    return {
      ok: false,
      live: true,
      partner: "tavily",
      query: name,
      catalog,
      pdfUrl: hit.url,
      pdfBase64: null,
      filename: filenameFromUrl(hit.url),
      title: hit.title || name,
      reason: `Found a PDF but could not download it (${pdfRes.status}).`,
    };
  }
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  if (buf.byteLength > MAX_MANUAL_BYTES) {
    ikealiveWarn("tavily", "pdf too large", { url: hit.url, bytes: buf.byteLength });
    return {
      ok: false,
      live: true,
      partner: "tavily",
      query: name,
      catalog,
      pdfUrl: hit.url,
      pdfBase64: null,
      filename: filenameFromUrl(hit.url),
      title: hit.title || name,
      bytes: buf.byteLength,
      reason: "That IKEA PDF is too large to ingest here. Drop the file instead.",
    };
  }
  const looksPdf = buf.subarray(0, 5).toString("utf8") === "%PDF-";
  if (!looksPdf) {
    ikealiveWarn("tavily", "not a pdf", { url: hit.url, bytes: buf.byteLength });
    return {
      ok: false,
      live: true,
      partner: "tavily",
      query: name,
      catalog,
      pdfUrl: hit.url,
      pdfBase64: null,
      filename: filenameFromUrl(hit.url),
      title: hit.title || name,
      reason: "Tavily’s hit was not a PDF. Try a more specific product name.",
    };
  }

  ikealiveLog("tavily", "manual ready", { url: hit.url, bytes: buf.byteLength, filename: filenameFromUrl(hit.url) });
  return {
    ok: true,
    live: true,
    partner: "tavily",
    query: name,
    catalog,
    pdfUrl: hit.url,
    pdfBase64: buf.toString("base64"),
    filename: filenameFromUrl(hit.url),
    title: hit.title || name,
    bytes: buf.byteLength,
    reason: null,
  };
}

