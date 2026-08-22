# IKEAFY — Product Roadmap

> Turn any furniture/DIY building guide (or a plain IKEA product name) into a guided, step-by-step plan you can actually follow.

## Vision

IKEAFY is the assembly co-pilot for anything you build. Point it at a manual, a photo, or a product name, and it generates a guided plan: a per-step tutorial video, an interactive 3D scheme you can rotate and inspect, a smart materials list (what's in the box vs. what you need to buy, with retailer links), a difficulty digest mined from real reviews, a one-tap spare-parts request flow, and a quick-question chat that knows your specific build. The long-term bet is bigger: a hybrid of Blender + KiCad + Fusion + IKEA-grade guidance — model parts, simulate stress/aerodynamics, wire up electronics, auto-assemble by intent, preview in AR in your room, and reconstruct 3D models and pin layouts straight from photos.

---

## MVP (this build)

The concrete slice we're shipping in this hackathon build.

- **Guide → guided plan** — Paste a building guide or an IKEA product name; get a structured, ordered step list. *(in progress)*
- **Per-step tutorial video** — Each step renders a short how-to clip alongside the instructions. *(in progress)*
- **Interactive 3D scheme** — A rotatable/zoomable 3D view of the assembly per step. *(in progress)*
- **Materials list (included vs. to-purchase)** — Split view of what ships in the box vs. what you must buy, with retailer links. *(in progress)*
- **Review / difficulty digest** — A quick read on how hard the build is, distilled from reviews. *(in progress)*
- **Spare-parts request flow** — Identify a missing/broken part and kick off a replacement request. *(in progress)*
- **Quick-question chat** — Ask questions about your specific build and get context-aware answers. *(in progress)*
- **Electron + Next.js shell** — Desktop app wrapper with the Next.js UI. *(done)*

---

## Next up (high value, low effort)

Concrete, buildable features for the next iterations. Partner tool noted for each.

1. **Real Gliner-2 guide parsing + fine-tune** — Replace heuristic parsing with Pioneer Gliner 2 to extract steps, parts, tools, and warnings as structured entities; fine-tune on a small set of IKEA-style manuals. *(Pioneer Gliner 2)*
2. **Veed per-step video generation** — Auto-generate a narrated short clip per step from the step text + 3D frames, instead of static instructions. *(Veed)*
3. **Tavily retailer price comparison** — For each "to-purchase" item, fetch live prices/availability across retailers and surface the cheapest in-stock option. *(Tavily)*
4. **Photo-of-broken-part → part number + auto spare-parts request** — Snap a photo, identify the part number, and pre-fill the spare-parts request. *(OpenAI vision + Gliner 2)*
5. **Review-mining difficulty highlights** — Pull reviews, cluster the pain points ("step 6 is the tricky one"), and pin them inline on the matching steps. *(Tavily + OpenAI)*
6. **B&W manual image → realistic render** — Turn the flat line-art from the manual into a photorealistic render of the part/step. *(OpenAI images)*
7. **Offline / export to PDF** — One-click export of the full guided plan (steps, materials, notes) to a printable PDF for the workbench. *(local)*
8. **AR room preview via WebXR** — Preview the finished item at true scale in your room before you build/buy. *(WebXR + local 3D)*
9. **Project save / version history** — Persist builds, track progress across sessions, and diff plan versions when a guide updates. *(local + OpenAI for summaries)*
10. **Multi-source ingestion (LEGO / car parts / etc.)** — Generalize the parser beyond IKEA to other manuals and kits. *(Pioneer Gliner 2)*

---

## Ambitious (R&D)

Bigger bets. Each notes the hard problems and a pragmatic first slice.

### 3D modeling engine (Blender-style)
Model parts with vertices/edges/faces and core ops (bevel, extrude, subdivide).
- **Hard problems:** robust mesh topology + non-destructive edits, performant WebGL editing, undo history on geometry.
- **First slice:** parametric primitives (boards, dowels, brackets) with extrude + bevel only, editable dimensions.

### Physics / aerodynamics / stress simulation (Fusion-style)
Check whether a design holds up before it's built.
- **Hard problems:** meshing for FEA, material properties, solver accuracy vs. speed, meaningful UX for non-engineers.
- **First slice:** static load/tip-over check on assembled furniture — "will this shelf sag or tip?" with a red/green verdict.

### Electronics / GPIO wiring sandbox (KiCad-style)
Wire up boards and components with live rule-checking.
- **Hard problems:** component libraries, netlist/DRC correctness, pin-compatibility validation.
- **First slice:** drag-and-drop breadboard for a small set of parts (Pi/Arduino + LED/sensor) with basic short-circuit warnings.

### Auto-assembly by intent
"Build me a 4-drawer dresser" → generated part list + assembly order.
- **Hard problems:** constraint solving for fit/stability, mapping intent to real parts, generating a valid step sequence.
- **First slice:** template-driven assembly for a few furniture archetypes with adjustable dimensions.

### AI photo → 3D + pinout reconstruction
Rebuild a 3D model (and pin layout for electronics) from photos/specs.
- **Hard problems:** single/multi-view reconstruction accuracy, scale recovery, matching to known part catalogs.
- **First slice:** photo → best-match from a known part catalog + approximate dimensions, human-confirmed.

### Lockable fittings / auto-generated 3D-printable connectors
Generate custom connectors/brackets when a part is missing or a custom join is needed.
- **Hard problems:** printable geometry that meets tolerance/strength, joint mechanics, export to slicer-ready formats.
- **First slice:** parametric bracket/peg generator with printability checks and STL export.

---

## Prioritization

Ranking Next-up items by impact vs. effort (H/M/L). Sort: high impact + low effort first.

| Feature | Impact | Effort | Partner tool | Priority |
|---|---|---|---|---|
| Real Gliner-2 guide parsing | High | Med | Pioneer Gliner 2 | 1 |
| Tavily retailer price comparison | High | Low | Tavily | 2 |
| Review-mining difficulty highlights | High | Low | Tavily + OpenAI | 3 |
| Photo-of-broken-part → part # | High | Med | OpenAI + Gliner 2 | 4 |
| Veed per-step video generation | High | Med | Veed | 5 |
| Offline / export to PDF | Med | Low | local | 6 |
| Project save / version history | Med | Low | local | 7 |
| B&W manual → realistic render | Med | Med | OpenAI images | 8 |
| Multi-source ingestion | Med | Med | Pioneer Gliner 2 | 9 |
| AR room preview (WebXR) | High | High | WebXR | 10 |

---

## Integration points already stubbed in code

Env vars are wired to specific surfaces — drop in the keys and the feature lights up.

- **`GLINER_API_KEY`** → **parse**: Pioneer Gliner 2 entity extraction that turns a raw guide into structured steps/parts/tools.
- **`OPENAI_API_KEY`** → **chat**: the quick-question chat, plus review summarization, vision (part ID), and image render features.
- **`TAVILY_API_KEY`** → **retailers**: live retailer lookup for "to-purchase" items, price comparison, and review sourcing.
- **`VEED_API_KEY`** → **video**: per-step tutorial video generation.

> Set these in your environment (or the Secrets panel). Missing keys degrade gracefully to stubbed/mock responses so the app still runs end-to-end.
