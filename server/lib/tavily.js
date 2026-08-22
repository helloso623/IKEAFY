import { getPart, retailerOffers } from "./catalog.js";

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
