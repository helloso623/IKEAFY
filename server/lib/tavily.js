import { getPart, retailerOffers, searchParts } from "./catalog.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

const SEARCH_URL = "https://api.tavily.com/search";
const MANUAL_SEARCH_TIMEOUT_MS = 8_000;
const MANUAL_PDF_TIMEOUT_MS = 12_000;
const MANUAL_FETCH_RETRIES = 1;
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

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

export async function searchHardwareOffers(build = {}, { fetchFn = fetch } = {}) {
  const key = usableTavilyKey();
  const items = (build.hardwareLines || [])
    .slice(0, 10)
    .map((line) => `${line.qty} ${line.name} ${line.dimensions || ""}`.trim())
    .filter(Boolean);
  if (!key || !items.length) return [];
  const dims = build.modelDimensionsMm || {};
  const query =
    `buy connection hardware for ${build.name || "custom furniture"} ${dims.x || ""} x ${dims.y || ""} x ${dims.z || ""} mm ` +
    `${items.join(" OR ")} furniture mounting plates brackets bolts screws`;
  return searchOfferQuery(query, key, fetchFn);
}

export async function searchDiyOffers(build = {}, options = {}) {
  const [pieces, hardware] = await Promise.all([
    searchFurniturePieceOffers(build, options),
    searchHardwareOffers(build, options),
  ]);
  return [
    ...pieces.map((offer) => ({ ...offer, group: "boards-and-stock" })),
    ...hardware.map((offer) => ({ ...offer, group: "hardware" })),
  ];
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

function ikeaCatalogSearchUrl(name) {
  return `https://www.ikea.com/us/en/search/?q=${encodeURIComponent(String(name || "").trim())}`;
}

export function isOfficialIkeaPdfUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const officialHost = url.hostname === "ikea.com" || url.hostname.endsWith(".ikea.com");
    return url.protocol === "https:" && officialHost && /\.pdf$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function pickManualPdfHit(results = [], productName = "") {
  const productTerms = String(productName || "")
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g) || [];
  const rows = (results || []).filter((hit) => isOfficialIkeaPdfUrl(hit?.url));
  const scored = rows.map((hit) => {
    const url = String(hit.url);
    const blob = `${url} ${hit.title || ""} ${hit.content || ""}`.toLowerCase();
    let score = 0;
    if (/\.pdf(\?|$)/i.test(url)) score += 8;
    if (/assembly_instructions|assembly-instructions/i.test(url)) score += 6;
    if (isOfficialIkeaPdfUrl(url)) score += 5;
    if (/assembly instructions|instruction (pdf|sheet)|building instruction/i.test(blob)) score += 4;
    if (/filetype:pdf|\.pdf/i.test(blob)) score += 2;
    if (productTerms.some((term) => blob.includes(term))) score += 4;
    return { hit, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored.find((row) => row.score >= 13);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchErrorDetail(error, timedOut = false) {
  const causes = [error, error?.cause, ...(Array.isArray(error?.cause?.errors) ? error.cause.errors : [])].filter(Boolean);
  const codes = causes.map((item) => String(item?.code || "")).filter(Boolean);
  const messages = causes.map((item) => String(item?.message || "")).filter(Boolean);
  const haystack = [...codes, ...messages].join(" ").toLowerCase();

  let category = "network";
  let cause = "Network request failed";
  if (timedOut || /abort|timeout|timedout|etimedout|und_err_connect_timeout/.test(haystack)) {
    category = "timeout";
    cause = "Request timed out";
  } else if (/enotfound|eai_again|getaddrinfo|dns/.test(haystack)) {
    category = "dns";
    cause = "DNS lookup failed";
  } else if (/err_invalid_url|invalid url|failed to parse url/.test(haystack)) {
    category = "invalid-url";
    cause = "Invalid request URL";
  } else if (/certificate|cert_|tls|ssl|unable_to_verify|self_signed|depth_zero/.test(haystack)) {
    category = "tls";
    cause = "TLS validation failed";
  } else if (/proxy|tunnel/.test(haystack)) {
    category = "proxy";
    cause = "Proxy connection failed";
  } else if (/econnrefused|econnreset|enetwork|ehostunreach|socket/.test(haystack)) {
    category = "connection";
    cause = "Connection failed";
  }

  return {
    category,
    cause,
    code: codes[0] || null,
    retryable: category !== "invalid-url" && category !== "tls",
  };
}

async function fetchWithRetry(
  url,
  init,
  {
    fetchFn,
    operation,
    timeoutMs,
    retries = MANUAL_FETCH_RETRIES,
    sleepFn = delay,
  },
) {
  const maxAttempts = Math.max(1, retries + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchFn(url, { ...init, signal: controller.signal });
      if (response.ok || !RETRYABLE_HTTP_STATUS.has(response.status) || attempt === maxAttempts) {
        return { response, attempts: attempt, error: null };
      }
      ikealiveWarn("tavily", `${operation} retry`, {
        endpoint: String(url),
        status: response.status,
        attempt,
        maxAttempts,
      });
    } catch (error) {
      const detail = fetchErrorDetail(error, timedOut);
      ikealiveWarn("tavily", `${operation} network error`, {
        endpoint: String(url),
        category: detail.category,
        code: detail.code,
        cause: detail.cause,
        attempt,
        maxAttempts,
      });
      if (!detail.retryable || attempt === maxAttempts) {
        return { response: null, attempts: attempt, error: detail };
      }
    } finally {
      clearTimeout(timer);
    }

    await sleepFn(Math.min(150 * attempt, 300));
  }

  return {
    response: null,
    attempts: maxAttempts,
    error: { category: "network", cause: "Network request failed", code: null, retryable: true },
  };
}

async function httpErrorDetail(response) {
  if (!response) return null;
  try {
    const text = typeof response.text === "function" ? await response.text() : "";
    if (!text) return null;
    const parsed = JSON.parse(text);
    const detail = parsed?.detail?.error || parsed?.detail || parsed?.error || parsed?.message;
    return String(detail || "").replace(/\s+/g, " ").slice(0, 180) || null;
  } catch {
    return null;
  }
}

function fallbackResult(standin, reason, extra = {}) {
  return {
    ...standin,
    ...extra,
    manualSearchUrl: ikeaCatalogSearchUrl(standin.query),
    reason: `${reason} Search IKEA’s official catalog for the manual: ${ikeaCatalogSearchUrl(standin.query)}`,
  };
}

/**
 * Look up an IKEA product's official instructions PDF via Tavily, then fetch
 * the PDF Tavily returned. Without a key, return catalog furniture stand-ins.
 */
export async function findIkeaManual(
  productName,
  {
    fetchFn = fetch,
    searchTimeoutMs = MANUAL_SEARCH_TIMEOUT_MS,
    pdfTimeoutMs = MANUAL_PDF_TIMEOUT_MS,
    retries = MANUAL_FETCH_RETRIES,
    sleepFn = delay,
  } = {},
) {
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
    manualSearchUrl: ikeaCatalogSearchUrl(name),
  };

  if (!hasTavily()) {
    ikealiveLog("tavily", "manual stand-in", { query: name, catalog: catalog.map((c) => c.id) });
    return fallbackResult(
      standin,
      catalog.length
        ? `Tavily is not configured. Local catalog match: “${catalog[0].name}”.`
        : "Tavily is not configured.",
    );
  }

  const query = `IKEA "${name}" assembly_instructions filetype:pdf`;
  ikealiveLog("tavily", "manual search", {
    endpoint: SEARCH_URL,
    query,
    keyed: true,
    timeoutMs: searchTimeoutMs,
    maxAttempts: retries + 1,
  });
  const search = await fetchWithRetry(
    SEARCH_URL,
    {
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
        include_domains: ["ikea.com"],
      }),
    },
    {
      fetchFn,
      operation: "manual search",
      timeoutMs: searchTimeoutMs,
      retries,
      sleepFn,
    },
  );
  if (search.error) {
    return fallbackResult(
      standin,
      `Tavily is unavailable: ${search.error.cause}${search.error.code ? ` (${search.error.code})` : ""} after ${search.attempts} attempts.`,
      { partner: "tavily", live: false, errorCause: search.error.category },
    );
  }

  const res = search.response;
  if (!res.ok) {
    const detail = await httpErrorDetail(res);
    ikealiveWarn("tavily", "manual search HTTP error", {
      endpoint: SEARCH_URL,
      status: res.status,
      statusText: res.statusText || null,
      detail,
      attempts: search.attempts,
    });
    return fallbackResult(
      standin,
      `Tavily search returned HTTP ${res.status}${detail ? `: ${detail}` : ""}.`,
      { partner: "tavily", live: false, httpStatus: res.status },
    );
  }
  const json = await res.json();
  const results = json.results || json.data || [];
  const hit = pickManualPdfHit(results, name);
  if (!hit?.url) {
    ikealiveLog("tavily", "no validated pdf hit", { query: name, results: results.length });
    return fallbackResult(standin, "Tavily found no validated official IKEA PDF for that name.", {
      partner: "tavily",
      live: true,
    });
  }

  ikealiveLog("tavily", "fetch pdf", { url: hit.url, title: hit.title || null });
  const pdfFetch = await fetchWithRetry(
    hit.url,
    { method: "GET", headers: { Accept: "application/pdf" } },
    {
      fetchFn,
      operation: "manual PDF",
      timeoutMs: pdfTimeoutMs,
      retries,
      sleepFn,
    },
  );
  if (pdfFetch.error) {
    return fallbackResult(
      {
        ...standin,
        pdfUrl: hit.url,
        filename: filenameFromUrl(hit.url),
        title: hit.title || name,
      },
      `The official IKEA PDF could not be downloaded: ${pdfFetch.error.cause}${pdfFetch.error.code ? ` (${pdfFetch.error.code})` : ""} after ${pdfFetch.attempts} attempts.`,
      { partner: "tavily", live: false, errorCause: pdfFetch.error.category },
    );
  }

  const pdfRes = pdfFetch.response;
  if (!pdfRes.ok) {
    ikealiveWarn("tavily", "pdf fetch failed", { url: hit.url, status: pdfRes.status });
    return fallbackResult(
      {
        ...standin,
        pdfUrl: hit.url,
        filename: filenameFromUrl(hit.url),
        title: hit.title || name,
      },
      `Found an official IKEA PDF but its server returned HTTP ${pdfRes.status}.`,
      { partner: "tavily", live: true, httpStatus: pdfRes.status },
    );
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

