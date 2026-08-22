import type { RetailerLink } from "./types";

/**
 * Build retailer search links for a material.
 *
 * This constructs deterministic search URLs so the UI can link users straight
 * to product listings. When a `TAVILY_API_KEY` is configured, this is the
 * integration point to replace these search URLs with scraped, ranked results
 * (see partner resources — Tavily web scraping).
 */
export function retailerLinks(name: string): RetailerLink[] {
  const q = encodeURIComponent(name.replace(/\s+/g, " ").trim());
  return [
    { name: "IKEA", url: `https://www.ikea.com/us/en/search/?q=${q}` },
    { name: "Amazon", url: `https://www.amazon.com/s?k=${q}` },
    { name: "Home Depot", url: `https://www.homedepot.com/s/${q}` },
  ];
}

export function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}
