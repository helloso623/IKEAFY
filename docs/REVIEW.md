# IKEAFY review

**Shipped.** Full-page studio tab (`client/src/studio.js`) in its own three-column layout: pick an official product or paste a custom guide, parse it into numbered steps, play one plate at a time on the center stage, and keep kit-vs-extra, pinned reviews, the broken-part desk with free spare-fittings requests, and quick chat in the right column. Routes for steps, plates, spares, and chat live in `server/index.js`.
65 tests pass, 0 fail; `npm run lint` (`node --check` across server, client, tests) is clean.

**Veed is optional, local fallback by default.** `hasVeed()` is true only when `FAL_KEY` is set. Without it `renderStepVideo` returns the `local-storyboard` provider and the canvas plays the same beats, so the studio runs fully local. The fal call is a strict upgrade path, never a hard dependency.

**Official steps are locked.** Official guides set `locked`, and therefore `editable: false` and `skipAhead: false`; instructions cannot rewrite official steps, and a drift check compares the guide back to the catalog product. Plates unlock strictly in order, and only LACK is unlocked while the rest of the catalog stays visibly locked.

**Gaps.** GLiNER and Tavily are still local stand-ins (local parser plus curated results, no live extraction or scrape), spare requests are filed locally rather than against a real IKEA endpoint, and there is no browser or end-to-end coverage.
