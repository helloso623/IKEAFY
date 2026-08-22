# Hardware sourcing policy

IKEAlive's **Finish & build** action sources connectors and other non-wood components. It does not scrape retailer catalogs or imply that a dimension match is structural approval.

- The existing Tavily Search API is the optional live provider. One `basic` search is made for the entire BOM, so one finish action uses one credit. Tavily documents 1,000 free credits/month and one credit per basic search: <https://docs.tavily.com/documentation/api-credits>.
- Without a key, the local dimension catalog and ordinary retailer/category links are the stand-in. Results remain useful but are clearly marked non-live.
- McMaster-Carr links are public category pages, not a private or reverse-engineered search API. McMaster's official product-information API requires authenticated customer access and known product numbers: <https://www.mcmaster.com/help/api/>.
- IKEA links use official article/search pages only. An article is shown only when the modeled envelope closely matches a known catalog size; the UI still tells the builder to verify hole patterns.
- The PDF is produced with the browser's print-to-PDF path. No model geometry is uploaded to a PDF service.

Wood, sheet goods, and lumber are deliberately omitted from the generated purchase BOM. Dimensions select hardware shape and screw length, but the builder must verify load, wall construction, stock thickness, and local availability.
