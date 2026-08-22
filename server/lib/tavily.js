import { getPart, retailerOffers, searchParts } from "./catalog.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

const SEARCH_URL = "https://api.tavily.com/search";

const SEARCH_TIMEOUT_MS = 8000;
const PDF_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/**
 * Free-text tool detection. These run against user notes (ownedTools) and
 * against step bodies (neededTools), so every pattern has to be specific
 * enough that ordinary assembly prose does not trip it. That is why there is
 * no bare /\bsaw\b/ (past tense of "see"), no bare /\blevel\b/ and no bare
 * /\bsquare\b/ — compound forms only.
 */
const TOOL_ALIASES = [
  ["allen-key", /allen[-\s]?key|hex key|hex wrench|ikea key/],
  ["screwdriver", /screw[-\s]?driver|phillips|pozi(?:driv)?|\btorx\b/],
  ["hammer", /\bhammer\b|\bmallet\b/],
  ["drill", /\bdrill\b|\bdriver[-\s]?drill\b|cordless driver/],
  ["soldering-iron", /solder/],
  ["multimeter", /multimeter|\bvolt\b/],
  ["spanner", /\bspanner\b|\bwrench\b|\bnut\s+spanner\b/],
  ["saw", /hand[-\s]?saw|hack[-\s]?saw|jig[-\s]?saw|circular saw|mitre saw|miter saw|tenon saw|panel saw|coping saw|table saw|saw blade|\bsawing\b/],
  ["spirit-level", /spirit level|bubble level|laser level|\blevelling tool\b|\bleveling tool\b/],
  ["tape-measure", /tape measure|measuring tape|\btape rule\b|\bmeasure twice\b/],
  ["pliers", /\bpliers\b|needle[-\s]?nose|\bpincers\b/],
  ["wood-glue", /wood glue|pva glue|carpenter'?s glue|wood adhesive|\bglue (?:the|it|them|together|up)\b|apply glue/],
  ["clamps", /\bclamps?\b|\bclamping\b|\bsash cramp\b/],
  ["stud-finder", /stud finder|stud detector|joist finder|cable detector/],
  ["utility-knife", /utility knife|box cutter|\bboxcutter\b|craft knife|stanley knife|\bsnap[-\s]?off blade\b/],
  ["sandpaper", /sand ?paper|glass ?paper|abrasive paper|sanding block|\bsanding\b|\bsand (?:the|it|down|smooth|lightly)\b/],
  ["chisel", /\bchisels?\b|\bchiselling\b|\bchiseling\b/],
  ["try-square", /try square|combination square|\bset square\b|speed square|engineer'?s square/],
  ["drill-bits", /drill bits?|\bpilot hole\b|\bcountersink\b|spade bit|\bforstner\b|hole saw|\bmasonry bit\b/],
  ["wall-plugs", /wall plugs?|\brawlplugs?\b|wall anchors?|drywall anchors?|masonry plugs?|toggle bolts?|expansion plugs?/],
  ["socket-set", /socket set|\bratchet\b|nut driver|socket bit/],
  ["staple-gun", /staple gun|\bstapler\b|\bstaple[-\s]?gun\b/],
];

/** Failure modes a caller can act on, plus the sentence the UI shows. */
const OFFER_REASON_NOTES = {
  "no-key": "No TAVILY_API_KEY — these are catalog search links, not live shop results.",
  "empty-query": "Nothing to look up.",
  auth: "Tavily rejected the API key — showing catalog links instead.",
  "rate-limited": "Tavily is rate limiting us — showing catalog links for now.",
  timeout: "Tavily did not answer in time — showing catalog links instead.",
  network: "Could not reach Tavily — showing catalog links instead.",
  http: "Tavily returned an error — showing catalog links instead.",
  "no-results": "Tavily found nothing buyable for that item — showing catalog links instead.",
};

export function describeOfferReason(reason) {
  if (!reason) return null;
  return OFFER_REASON_NOTES[reason] || `Live shop lookup failed (${reason}).`;
}

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

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

/** Hosts that actually sell things. A hit on one of these outranks prose. */
const RETAIL_HOSTS = [
  "ikea",
  "amazon",
  "homedepot",
  "lowes",
  "menards",
  "acehardware",
  "harborfreight",
  "northerntool",
  "grainger",
  "zoro.",
  "walmart",
  "target.com",
  "screwfix",
  "toolstation",
  "wickes",
  "diy.com",
  "homebase",
  "argos",
  "bunnings",
  "bauhaus",
  "hornbach",
  "obi.",
  "leroymerlin",
  "manomano",
  "rona.",
  "canadiantire",
  "axminstertools",
  "toolstop",
  "ebay",
  "etsy",
  "mcmaster",
  "clasohlson",
  "biltema",
  "jula.",
  "castorama",
  "bricodepot",
];

/** Hosts that are almost never a buyable product page. */
const CONTENT_FARM_HOSTS = [
  "youtube",
  "youtu.be",
  "reddit",
  "quora",
  "pinterest",
  "wikipedia",
  "wikihow",
  "medium.com",
  "blogspot",
  "wordpress",
  "stackexchange",
  "stackoverflow",
  "facebook",
  "tiktok",
  "instagram",
  "twitter",
  "x.com",
  "linkedin",
  "tumblr",
  "vimeo",
  "dailymotion",
];

/** Passed to Tavily so the obvious noise never comes back in the first place. */
const EXCLUDED_DOMAINS = [
  "youtube.com",
  "reddit.com",
  "quora.com",
  "pinterest.com",
  "facebook.com",
  "tiktok.com",
  "instagram.com",
];

const PRODUCT_PATH = /\/(?:dp|gp\/product|p|pd|ip|itm|product|products|prod|sku|item|buy)\/|-p-\d|\/p-\d/;
const SEARCH_PATH = /\/(?:search|s|catalogsearch)\b|[?&](?:q|k|query|keyword|searchterm)=/;
const EDITORIAL_PATH = /\/(?:blog|blogs|forum|forums|thread|threads|community|wiki|news|article|articles|advice|inspiration|ideas|magazine|learn|how-to)\//;
const LISTICLE_TITLE = /\b(?:best|top)\s+\d+|\btop\s+(?:ten|10)\b|buying guide|\bvs\.?\b|\bhow to\b|\bwhich\b.*\bshould\b|\b(?:20\d\d)\s+(?:buyer|buying|guide)/;
const VIDEO_URL = /youtube\.com\/watch|youtu\.be\/|\/watch\?v=|vimeo\.com\/\d/;
const PLAN_WORDS = /cut list|cutting list|plan(?:s)?\b|woodworking|build(?:ing)? guide|dimension|cut[-\s]?to[-\s]?size|shop drawing/;

const STOP_TERMS = new Set([
  "buy", "the", "for", "and", "with", "from", "best", "cheap", "online",
  "store", "shop", "price", "near", "set", "kit", "new", "you", "your",
]);

function queryTerms(text) {
  const words = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_TERMS.has(word));
  return [...new Set(words)].slice(0, 8);
}

/**
 * Prices show up in Tavily titles and snippets in a dozen shapes. Handle a
 * leading symbol ($12.99, £9.50, €19,99), a trailing one (12,99 €, 149 kr),
 * and ISO codes (USD 15.00). Returns null rather than guessing.
 */
const PRICE_NUMBER = "(?:\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
const PRICE_LEAD = "US\\$|CA\\$|A\\$|NZ\\$|R\\$|\\$|£|€|¥|₹|USD|EUR|GBP|CAD|AUD|NZD|SEK|NOK|DKK|PLN|CHF|JPY|INR";
const PRICE_TRAIL = "€|£|\\$|¥|kr|zł|USD|EUR|GBP|CAD|AUD|NZD|SEK|NOK|DKK|PLN|CHF";
const PRICE_RE = new RegExp(
  `(?:(${PRICE_LEAD})\\s?(${PRICE_NUMBER}))|(?:(${PRICE_NUMBER})\\s?(${PRICE_TRAIL})(?![a-z]))`,
  "gi",
);

const CURRENCY_BY_SYMBOL = {
  "us$": "USD",
  "ca$": "CAD",
  "a$": "AUD",
  "nz$": "NZD",
  "r$": "BRL",
  $: "USD",
  "£": "GBP",
  "€": "EUR",
  "¥": "JPY",
  "₹": "INR",
  kr: "SEK",
  "zł": "PLN",
};

function currencyCode(token) {
  const key = String(token || "").trim().toLowerCase();
  return CURRENCY_BY_SYMBOL[key] || key.toUpperCase() || null;
}

function toAmount(raw) {
  const text = String(raw).replace(/\s/g, "");
  const sep = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
  if (sep === -1) return Number(text);
  const tail = text.slice(sep + 1);
  const head = text.slice(0, sep).replace(/[.,]/g, "");
  // A three-digit tail is a thousands group (1.299), not cents.
  if (tail.length === 3) return Number(head + tail);
  if (!/^\d{1,2}$/.test(tail)) return NaN;
  return Number(`${head}.${tail}`);
}

export function parsePrice(text) {
  const blob = String(text || "");
  if (!blob) return null;
  PRICE_RE.lastIndex = 0;
  let match = PRICE_RE.exec(blob);
  while (match) {
    const symbol = match[1] || match[4];
    const number = match[2] || match[3];
    const amount = toAmount(number);
    if (Number.isFinite(amount) && amount > 0 && amount <= 100000) {
      return {
        amount: Number(amount.toFixed(2)),
        currency: currencyCode(symbol),
        display: match[0].replace(/\s+/g, " ").trim(),
      };
    }
    match = PRICE_RE.exec(blob);
  }
  return null;
}

const STORE_NAMES = [
  [/(^|\.)ikea\./, "IKEA"],
  [/(^|\.)amazon\./, "Amazon"],
  [/homedepot\./, "The Home Depot"],
  [/lowes\./, "Lowe's"],
  [/screwfix\./, "Screwfix"],
  [/toolstation\./, "Toolstation"],
  [/wickes\./, "Wickes"],
  [/diy\.com/, "B&Q"],
  [/homebase\./, "Homebase"],
  [/argos\./, "Argos"],
  [/bunnings\./, "Bunnings"],
  [/leroymerlin\./, "Leroy Merlin"],
  [/bauhaus\./, "Bauhaus"],
  [/hornbach\./, "Hornbach"],
  [/walmart\./, "Walmart"],
  [/acehardware\./, "Ace Hardware"],
  [/harborfreight\./, "Harbor Freight"],
  [/canadiantire\./, "Canadian Tire"],
  [/manomano\./, "ManoMano"],
  [/ebay\./, "eBay"],
];

function shopFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const [pattern, name] of STORE_NAMES) {
      if (pattern.test(host)) return name;
    }
    const label = host.split(".")[0] || "Web";
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "Web";
  }
}

/**
 * Rank one Tavily hit. "retail" mode wants a buyable product page; "plan" mode
 * wants a cut list or a build write-up, where a blog is the point.
 */
export function scoreOfferHit(hit, { terms = [], mode = "retail" } = {}) {
  const url = String(hit?.url || hit?.link || "");
  if (!url) return -100;
  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return -100;
  }
  const title = String(hit.title || "");
  const content = String(hit.content || "");
  const blob = `${title} ${content}`.toLowerCase();
  const retailer = RETAIL_HOSTS.some((needle) => host.includes(needle));
  const farm = CONTENT_FARM_HOSTS.some((needle) => host.includes(needle));

  let score = 0;
  if (mode === "plan") {
    if (PLAN_WORDS.test(blob)) score += 6;
    if (retailer) score += 3;
    if (farm) score -= 5;
    if (VIDEO_URL.test(url)) score -= 4;
  } else {
    if (retailer) score += 12;
    if (farm) score -= 14;
    if (PRODUCT_PATH.test(path)) score += 8;
    else if (SEARCH_PATH.test(path)) score += 3;
    if (EDITORIAL_PATH.test(path)) score -= 7;
    // Listicles are judged on the title only — real product pages say
    // "1,203 reviews" in their snippet and should not be punished for it.
    if (LISTICLE_TITLE.test(title.toLowerCase())) score -= 6;
    if (VIDEO_URL.test(url)) score -= 9;
  }

  const matched = terms.filter((term) => blob.includes(term) || path.includes(term));
  score += matched.length * 3;
  if (terms.length && matched.length === terms.length) score += 2;
  if (parsePrice(title) || parsePrice(content)) score += 4;
  if (/^https:/i.test(url)) score += 1;
  // Tavily ships its own 0..1 relevance; use it to break ties.
  if (Number.isFinite(hit?.score)) score += Math.max(0, Math.min(1, hit.score)) * 2;
  return Math.round(score * 100) / 100;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
  } catch {
    return String(url);
  }
}

/**
 * Turn raw Tavily hits into ranked offers, then spread the picks across
 * distinct stores so four Amazon links do not crowd out the only IKEA one.
 */
export function offersFromResults(results = [], { query = "", limit = 4, mode = "retail", minScore } = {}) {
  const terms = queryTerms(query);
  // A hit that scores below the floor is prose, not a purchase. Better to show
  // no live offer and fall back to a catalog search link than to send someone
  // to a listicle from a "buy this" button.
  const floor = minScore ?? (mode === "retail" ? 0 : -Infinity);
  const seen = new Set();
  const rows = [];
  for (const hit of results || []) {
    const url = hit?.url || hit?.link;
    if (!url) continue;
    const dedupe = normalizeUrl(url);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const store = shopFromUrl(url);
    const title = hit.title || store;
    const content = String(hit.content || "").replace(/\s+/g, " ").trim();
    const priced = parsePrice(title) || parsePrice(content);
    const score = scoreOfferHit(hit, { terms, mode });
    if (score < floor) continue;
    rows.push({
      store,
      score,
      offer: {
        store,
        url,
        title,
        note: content.slice(0, 120) || null,
        price: priced ? priced.amount : null,
        currency: priced ? priced.currency : null,
        priceText: priced ? priced.display : null,
        score,
        live: true,
      },
    });
  }

  const byRank = (a, b) =>
    b.score - a.score || (a.offer.price ?? Infinity) - (b.offer.price ?? Infinity);
  rows.sort(byRank);

  const picked = [];
  const takenStores = new Set();
  // First pass: the best hit from each distinct store.
  for (const row of rows) {
    if (picked.length >= limit) break;
    if (takenStores.has(row.store)) continue;
    takenStores.add(row.store);
    picked.push(row);
  }
  // Second pass: fill any spare slots with the next best, store be damned.
  for (const row of rows) {
    if (picked.length >= limit) break;
    if (picked.includes(row)) continue;
    picked.push(row);
  }
  picked.sort(byRank);
  return picked.map((row) => row.offer);
}

/* ------------------------------------------------------------------ */
/* Transport: timeouts, bounded retry, TTL cache                       */
/* ------------------------------------------------------------------ */

const searchCache = new Map();

export function clearOfferCache() {
  searchCache.clear();
}

export function offerCacheSize() {
  return searchCache.size;
}

function cacheKeyFor(body) {
  const query = String(body.query || "").trim().toLowerCase().replace(/\s+/g, " ");
  return JSON.stringify([query, body.max_results || 0, body.search_depth || "", body.exclude_domains || []]);
}

function cacheGet(key, now) {
  const row = searchCache.get(key);
  if (!row) return null;
  if (row.expires <= now) {
    searchCache.delete(key);
    return null;
  }
  // Touch so the cap evicts the coldest entry, not the oldest useful one.
  searchCache.delete(key);
  searchCache.set(key, row);
  return row.results;
}

function cacheSet(key, results, ttlMs, now) {
  if (ttlMs <= 0) return;
  searchCache.set(key, { results, expires: now + ttlMs });
  while (searchCache.size > CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reasonForStatus(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "http";
  return "http";
}

function retryable(status) {
  return status === 429 || status === 408 || status >= 500;
}

function reasonForError(err) {
  const name = String(err?.name || "");
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  return "network";
}

/**
 * One Tavily search with a per-request timeout, bounded retry on transient
 * failures, and a short TTL cache. Auth errors are never retried — a bad key
 * will still be bad in 500ms.
 */
async function tavilySearch(body, {
  fetchFn = fetch,
  sleepFn = wait,
  nowFn = Date.now,
  timeoutMs = SEARCH_TIMEOUT_MS,
  attempts = MAX_ATTEMPTS,
  ttlMs = CACHE_TTL_MS,
  cache = true,
} = {}) {
  const key = usableTavilyKey();
  if (!key) return { ok: false, results: [], reason: "no-key", status: null, cached: false };

  const cacheKey = cacheKeyFor(body);
  if (cache) {
    const hit = cacheGet(cacheKey, nowFn());
    if (hit) return { ok: true, results: hit, reason: null, status: 200, cached: true };
  }

  let last = { ok: false, results: [], reason: "network", status: null, cached: false };
  const tries = Math.max(1, attempts);
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    let res;
    try {
      res = await fetchFn(SEARCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = reasonForError(err);
      last = { ok: false, results: [], reason, status: null, cached: false };
      ikealiveWarn("tavily", "search attempt failed", { attempt, reason, error: String(err?.message || err) });
      if (attempt < tries) {
        await sleepFn(RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
      return last;
    }

    if (!res.ok) {
      const status = Number(res.status) || 0;
      const reason = reasonForStatus(status);
      last = { ok: false, results: [], reason, status, cached: false };
      ikealiveWarn("tavily", "search rejected", { attempt, status, reason });
      if (retryable(status) && attempt < tries) {
        await sleepFn(RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
      return last;
    }

    let json;
    try {
      json = await res.json();
    } catch (err) {
      ikealiveWarn("tavily", "search body unreadable", { attempt, error: String(err?.message || err) });
      return { ok: false, results: [], reason: "http", status: Number(res.status) || 200, cached: false };
    }
    const results = json?.results || json?.data || [];
    if (cache && results.length) cacheSet(cacheKey, results, ttlMs, nowFn());
    return { ok: true, results, reason: null, status: Number(res.status) || 200, cached: false };
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* Searches                                                            */
/* ------------------------------------------------------------------ */

/**
 * Look up buyable offers for one tool or component. Returns the full outcome
 * so a caller can tell "nothing matched" from "your key is invalid".
 */
export async function searchToolOffersDetailed(name, deps = {}) {
  const label = String(name || "").trim();
  if (!usableTavilyKey()) {
    return { ok: false, offers: [], reason: "no-key", status: null, cached: false, query: null };
  }
  if (!label) {
    return { ok: false, offers: [], reason: "empty-query", status: null, cached: false, query: null };
  }
  const query = `buy ${label} price in stock — IKEA, Amazon or a hardware store product page`;
  const found = await tavilySearch(
    {
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
      // Excluding the loudest content farms is safer than include_domains,
      // which is a hard filter and would return nothing outside our list.
      exclude_domains: EXCLUDED_DOMAINS,
    },
    deps,
  );
  if (!found.ok) {
    return { ok: false, offers: [], reason: found.reason, status: found.status, cached: false, query };
  }
  const offers = offersFromResults(found.results, { query: label, limit: 4, mode: "retail" });
  return {
    ok: offers.length > 0,
    offers,
    reason: offers.length ? null : "no-results",
    status: found.status,
    cached: found.cached,
    query,
  };
}

export async function searchToolOffers(name, deps = {}) {
  const found = await searchToolOffersDetailed(name, deps);
  return found.offers;
}

/**
 * One legal search for construction methods around the current model. Results
 * may be plans, cut stock, tops, or legs; loose fasteners are excluded.
 */
export async function searchBuildWayOffersDetailed(build = {}, deps = {}) {
  const methodCuts = (build.ways || []).flatMap((way) => way.additionalCuts || []);
  const items = [...(build.lines || []), ...methodCuts]
    .slice(0, 10)
    .map((line) => `${line.qty} ${line.name} ${line.dimensions || ""}`.trim())
    .filter(Boolean);
  if (!usableTavilyKey()) {
    return { ok: false, offers: [], reason: "no-key", status: null, cached: false, query: null };
  }
  if (!items.length) {
    return { ok: false, offers: [], reason: "empty-query", status: null, cached: false, query: null };
  }
  const dims = build.modelDimensionsMm || {};
  const query =
    `ways to build custom table ${dims.x || ""} x ${dims.y || ""} x ${dims.z || ""} mm ` +
    `cut list woodworking plan cut-to-size tabletop table legs ${items.join(" OR ")} -screws -bolts -fasteners`;
  const found = await tavilySearch(
    { query, search_depth: "basic", max_results: 8, include_answer: false },
    deps,
  );
  if (!found.ok) {
    return { ok: false, offers: [], reason: found.reason, status: found.status, cached: false, query };
  }
  const offers = offersFromResults(found.results, {
    query: `table ${items.join(" ")}`,
    limit: 6,
    mode: "plan",
  });
  return {
    ok: offers.length > 0,
    offers,
    reason: offers.length ? null : "no-results",
    status: found.status,
    cached: found.cached,
    query,
  };
}

export async function searchBuildWayOffers(build = {}, deps = {}) {
  const found = await searchBuildWayOffersDetailed(build, deps);
  return found.offers;
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
        // bomFromIds gives kit tools no offers because they came in the box.
        // Once it is on the buy list it needs somewhere to buy it.
        if (!line.retailers?.length) line.retailers = retailerOffers(getPart(line.id) || line).offers;
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

/**
 * Add live shop offers to a shopping list. Nothing here mutates the caller's
 * lines — enriched rows are fresh objects swapped into every array — and every
 * failure is named so the UI can say why a row is a stand-in.
 */
export async function enrichShopping(list, deps = {}) {
  const suggested = list.missing || list.extra?.filter((line) => line.category === "tool") || [];
  const keyed = hasTavily();
  const base = {
    ...list,
    partner: keyed ? "tavily" : "tavily-standin",
    live: false,
    degraded: keyed ? null : "no-key",
    degradedNote: keyed ? null : describeOfferReason("no-key"),
    offerErrors: [],
    suggestedExtras: suggested,
  };
  if (!keyed) {
    ikealiveLog("tavily", "shopping stand-in", { reason: "no-key", lines: suggested.length });
    return base;
  }

  const targets = [...new Map(suggested.map((line) => [line.id, line])).values()].slice(0, 5);
  const outcomes = await Promise.all(
    targets.map(async (line) => {
      try {
        const found = await searchToolOffersDetailed(line.name, deps);
        if (!found.ok) {
          ikealiveWarn("tavily", "no live offers", { id: line.id, reason: found.reason, status: found.status });
        }
        return { line, ...found };
      } catch (err) {
        // Never let one bad lookup take out the whole list — but say so.
        ikealiveWarn("tavily", "offer lookup threw", { id: line.id, error: String(err?.message || err) });
        return { line, ok: false, offers: [], reason: reasonForError(err), status: null };
      }
    }),
  );

  const replacements = new Map();
  for (const row of outcomes) {
    replacements.set(
      row.line.id,
      row.ok && row.offers.length
        ? { ...row.line, retailers: row.offers, live: true, offerStatus: "live", offerReason: null }
        : { ...row.line, live: false, offerStatus: "standin", offerReason: row.reason },
    );
  }
  const swap = (line) => (line && replacements.has(line.id) ? replacements.get(line.id) : line);
  const swapAll = (rows) => (Array.isArray(rows) ? rows.map(swap) : rows);

  const failures = outcomes.filter((row) => !row.ok);
  const live = outcomes.some((row) => row.ok && row.offers.length);
  const degraded = failures.length ? failures[0].reason : null;
  ikealiveLog("tavily", "shopping enriched", {
    looked: targets.length,
    live: outcomes.filter((row) => row.ok).length,
    failed: failures.length,
    degraded,
  });

  return {
    ...base,
    lines: swapAll(list.lines),
    included: swapAll(list.included),
    owned: swapAll(list.owned),
    extra: swapAll(list.extra),
    missing: swapAll(list.missing),
    suggestedExtras: swapAll(suggested),
    live,
    degraded,
    degradedNote: describeOfferReason(degraded),
    offerErrors: failures.map((row) => ({
      id: row.line.id,
      name: row.line.name,
      reason: row.reason,
      status: row.status ?? null,
    })),
  };
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
export async function findIkeaManual(productName, deps = {}) {
  const { fetchFn = fetch, pdfTimeoutMs = PDF_TIMEOUT_MS } = deps;
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
    degraded: null,
  };

  if (!hasTavily()) {
    ikealiveLog("tavily", "manual stand-in", { query: name, catalog: catalog.map((c) => c.id) });
    return {
      ...standin,
      degraded: "no-key",
      reason: catalog.length
        ? `No Tavily key — catalog stand-in for “${catalog[0].name}”. Set TAVILY_API_KEY to fetch the official IKEA PDF.`
        : "Set TAVILY_API_KEY to find the official IKEA instructions PDF.",
    };
  }

  const query = `IKEA ${name} assembly instructions PDF site:ikea.com`;
  ikealiveLog("tavily", "manual search", { query, keyed: true });
  const found = await tavilySearch(
    { query, search_depth: "basic", max_results: 8, include_answer: false },
    deps,
  );
  if (!found.ok) {
    ikealiveWarn("tavily", "manual search failed", { reason: found.reason, status: found.status });
    return {
      ...standin,
      partner: "tavily",
      live: false,
      degraded: found.reason,
      reason: describeOfferReason(found.reason) || `Tavily search failed (${found.status}).`,
    };
  }
  const results = found.results;
  const hit = pickManualPdfHit(results);
  if (!hit?.url) {
    ikealiveLog("tavily", "no pdf hit", { query: name, results: results.length });
    return {
      ...standin,
      partner: "tavily",
      live: true,
      degraded: "no-results",
      reason: "Tavily found no IKEA instructions PDF for that name.",
    };
  }

  ikealiveLog("tavily", "fetch pdf", { url: hit.url, title: hit.title || null });
  const partial = {
    ok: false,
    live: true,
    partner: "tavily",
    query: name,
    catalog,
    pdfUrl: hit.url,
    pdfBase64: null,
    filename: filenameFromUrl(hit.url),
    title: hit.title || name,
  };

  let pdfRes;
  try {
    pdfRes = await fetchFn(hit.url, { signal: AbortSignal.timeout(pdfTimeoutMs) });
  } catch (err) {
    const reason = reasonForError(err);
    ikealiveWarn("tavily", "pdf fetch failed", { url: hit.url, reason, error: String(err?.message || err) });
    return { ...partial, degraded: reason, reason: `Found a PDF but could not download it (${reason}).` };
  }
  if (!pdfRes.ok) {
    ikealiveWarn("tavily", "pdf fetch failed", { url: hit.url, status: pdfRes.status });
    return {
      ...partial,
      degraded: "http",
      reason: `Found a PDF but could not download it (${pdfRes.status}).`,
    };
  }
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  if (buf.byteLength > MAX_MANUAL_BYTES) {
    ikealiveWarn("tavily", "pdf too large", { url: hit.url, bytes: buf.byteLength });
    return {
      ...partial,
      bytes: buf.byteLength,
      degraded: "too-large",
      reason: "That IKEA PDF is too large to ingest here. Drop the file instead.",
    };
  }
  const looksPdf = buf.subarray(0, 5).toString("utf8") === "%PDF-";
  if (!looksPdf) {
    ikealiveWarn("tavily", "not a pdf", { url: hit.url, bytes: buf.byteLength });
    return {
      ...partial,
      degraded: "not-a-pdf",
      reason: "Tavily’s hit was not a PDF. Try a more specific product name.",
    };
  }

  ikealiveLog("tavily", "manual ready", { url: hit.url, bytes: buf.byteLength, filename: filenameFromUrl(hit.url) });
  return {
    ...partial,
    ok: true,
    pdfBase64: buf.toString("base64"),
    bytes: buf.byteLength,
    degraded: null,
    reason: null,
  };
}
