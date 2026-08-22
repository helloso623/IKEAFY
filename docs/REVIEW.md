# IKEAFY review

**Shipped.** Full-page studio tab (`client/src/studio.js`) with an input → progress → results flow: search an official product or drop a custom guide, watch parsing/film/parts progress, then switch **Instructions** (step films, 3D scheme, chat, reviews, spare desk) and **Material** (included / to-purchase badges plus multi-store offers). Electronics stays a Bench feature of the same app. Routes for steps, plates, spares, and chat live in `server/index.js`.

**Veed is optional, local fallback by default.** `hasVeed()` is true only when `FAL_KEY` is set. Without it `renderStepVideo` returns the `local-storyboard` provider and the canvas plays the same beats, so the studio runs fully local. The fal call is a strict upgrade path, never a hard dependency.

**Official steps are locked.** Official guides set `locked`, and therefore `editable: false` and `skipAhead: false`; instructions cannot rewrite official steps, and a drift check compares the guide back to the catalog product. Plates unlock strictly in order, and only LACK is unlocked while KALLAX, BILLY and MALM stay visibly locked.

**Gaps.** GLiNER is still a local parser stand-in. Spare requests are filed locally rather than against a real IKEA endpoint, and there is no browser or end-to-end coverage.
