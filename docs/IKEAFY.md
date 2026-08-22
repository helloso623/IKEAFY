# IKEAFY — creative brief

## The idea

Every IKEA manual is a tiny silent film: numbered plates, one move per plate, a stick person who never panics. IKEAFY gives that film to *everything*. Search an official product or drop any guide, and the studio replays it as instructions you can actually follow — one plate at a time, at your pace, with help standing by when a screw strips or a dowel snaps.

It is a full-page product tab, not a side panel. Electronics is a feature of the same app (the Bench), not a separate product.

## The flow

1. **Input.** Search an IKEA product by name — only **LACK** is unlocked; **KALLAX**, **BILLY** and **MALM** sit visibly locked — or drop a building guide (photo, PDF, text) into the field, paste the steps, and optionally note the tools you own.
2. **Progress.** Parsing (Pioneer / GLiNER 2), generating step films (Veed), looking up kit vs extra and retailers (Tavily).
3. **Results — Instructions.** Step boxes with a film each time, a button to see the actual guide, a 3D scheme for the current plate, extra context (text, images, video) to regenerate a clearer explanation, reviews pinned to the hard steps, a broken-part desk that drafts a **free spare-fittings request** (or tells you to go to the store when there is no part number), and a chat for quick questions.
4. **Results — Material.** Everything in the box vs what to purchase, with label badges and a colour swatch for each part. Extra items show several shop propositions (IKEA, Amazon, local).

Official mode never lets you skip ahead; the plates unlock strictly in order.

## Partner stand-ins

The studio runs fully local today. Three partners are named in `/api/health` and stood in for until keys and wiring land:

- **Veed Fabric 1.0 via fal** — the step films. With `FAL_KEY` set, plates become rendered video; without it, a local canvas storyboard plays the same beats. Optional by design.
- **GLiNER (Pioneer / GLiNER 2)** — entity extraction from pasted guides, and the first desk for small chat questions. Harder questions escalate to a larger OpenAI model when a key is set. A local parser stands in.
- **Tavily** — live research for tools and extra parts. With `TAVILY_API_KEY` set, Material looks up IKEA / Amazon / hardware shops for anything not in the box and not already on your bench. Without it, catalog shop URLs stand in.

Each stand-in keeps the same shape as the real integration, so swapping a partner in changes a module, not the flow.
