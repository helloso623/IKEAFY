# IKEAFY — creative brief

## The idea

Every IKEA manual is a tiny silent film: numbered plates, one move per plate, a stick person who never panics. IKEAFY gives that film to *everything*. Pick an official product or paste any guide, and the studio replays it as instructions you can actually follow — one plate at a time, at your pace, with help standing by when a screw strips or a dowel snaps.

It is a full-page product tab, not a side panel. When you enter the studio, the workshop gets out of the way.

## The flow

1. **Pick or paste.** Choose an official IKEA product — only **LACK** is unlocked; the rest of the catalog sits visibly locked — or paste any custom guide plus optional notes about the tools you own.
2. **Parse.** The guide becomes numbered steps, each with an action, a body, and a tool requirement.
3. **Film.** The center stage plays one plate per step: black and white first, in the manual's own visual language, colorized on demand. The plate *waits for you* — press **I did this — next** to advance, **Back** to review, **Stuck** to expand the step into smaller moves. Official mode never lets you skip ahead; the plates unlock strictly in order.
4. **Around the build.** The right column keeps the mid-build lifelines: **kit vs extra** (what's in the box vs what to buy, IKEA and Amazon links), **reviews and difficulties** from other builders pinned to the steps where they struggled, a **broken-part desk** (attach a photo and note, get the part identified, file a **free spare-fittings request with IKEA**), and a **quick chat** for anything else.

## Partner stand-ins

The studio runs fully local today. Three partners are named in `/api/health` and stood in for until keys and wiring land:

- **Veed Fabric 1.0 via fal** — the step films. With `FAL_KEY` set, plates become rendered video; without it, a local canvas storyboard plays the same beats. Optional by design.
- **GLiNER (Pioneer / GLiNER 2)** — entity extraction from pasted guides: parts, tools, quantities, step boundaries. A local parser stands in.
- **Tavily** — live research for reviews, prices, and spare-part listings. Today the results are a curated list, not a live scrape.

Each stand-in keeps the same shape as the real integration, so swapping a partner in changes a module, not the flow.
