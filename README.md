# DEMO: https://drive.google.com/drive/folders/1kMPxqRavRnxyOqp5RjL-auIRFQDq78Bc?usp=sharing

<h1 align="center">IKEAlive</h1>

<p align="center"><strong>Turn the manual you have into the view you need.</strong></p>

<p align="center">Real IKEA instructions in. Step films, instruction stills, and spatial 3D views out—without losing the product, parts, or order of the guide.</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-1c1c1e?style=flat-square" alt="Node.js 20+" /></a>
  <a href="https://github.com/helloso623/IKEAFY/actions/workflows/test.yml"><img src="https://github.com/helloso623/IKEAFY/actions/workflows/test.yml/badge.svg" alt="Test workflow status" /></a>
</p>

IKEAlive is an adaptation workspace for an assembly that already exists. Start with the IKEA PDF in front of you, find an official PDF by product name with Tavily, or follow the built-in LACK transcription. Add the notes that matter and the tools you already own.

Then choose how to inspect the next step:

- **Seedance film** — a playable clip for each tutorial plate.
- **Nano Banana still** — one focused instruction image at a time.
- **Tripo 3D** — a mesh you can inspect in the workshop.

Each renderer receives the same guide step and locked scene context. It changes the view, not the source assembly.

## Follow the plate

The official LACK side table flow is transcribed against article `304.499.08`. Its five steps are locked, ordered, and revealed through the server-owned assembly cursor.

Custom manuals stay editable. IKEAlive reads PDF text and page images, extracts an ordered guide, and folds in notes and owned tools. Drawing-only plates use the configured vision path. Tavily only searches for an official IKEA PDF; it does not compose a replacement manual.

Once a guide is active, Watch keeps the current plate beside its inventory, common trouble spots, part identification, and small-parts request. The chat context follows the active guide, selected part, notes, and tools, so questions stay grounded in the build.

## Start locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the app at [localhost:5173](http://localhost:5173). The Express API runs at [localhost:8787](http://localhost:8787).

For the desktop shell:

```bash
npm run electron
```

Both commands start the Vite client and Express API; `npm run electron` also opens the Electron window.
The Electron command starts the same Vite client and Express API inside the desktop shell.

## Partners in the app

Where each hosted partner runs in IKEAlive:

| Surface | Partner | Role |
| --- | --- | --- |
| **Upload / parse** | Pioneer GLiNER 2 | Structures extracted PDF text into ordered assembly steps; normalizes fal plate-vision output when drawings need a second pass. Uses the Pioneer API (`PIONEER_API_KEY` → [gliner.pioneer.ai](https://gliner.pioneer.ai)); local Hugging Face weights are optional fallback only. |
| **Upload / parse** | fal plate vision | When PDF text has no grounded steps, reads rasterized drawing plates via `openrouter/router/vision` (`FAL_KEY`). |
| **Search** | Tavily | **Find PDF** looks up an official IKEA instruction PDF by product name; also live shop links for missing tools, and optional Finish / Find a way board and hardware research (`TAVILY_API_KEY`). Does not write manuals. |
| **Video instructions** | fal → Seedance 2.5 | Watch reel: one Seedance MP4 per tutorial plate (`FAL_KEY`). |
| **Image instructions** | fal → Nano Banana 2 | Watch stills: one Nano Banana 2 plate image per step (`FAL_KEY`). |
| **3D instructions** | fal → Tripo H3.1 | Watch / workshop: one Tripo H3.1 GLB mesh per step (`FAL_KEY`). |
| **Chat** | Pioneer GLiNER 2 | Guide Q&A grounded in the active assembly (`PIONEER_API_KEY`). |

Without keys, IKEAlive keeps local guide parsing, the official LACK sheet, notes, owned tools, catalog stand-ins, and local reconstruction. Missing keys report what they need; they do not silently pretend a render or search completed.

## Optional keys

Copy `.env.example` to `.env` when you want hosted services. Never commit the populated file.

- `PIONEER_API_KEY` — Pioneer GLiNER 2 (parse + guide chat); preferred over Hugging Face downloads
- `FAL_KEY` — plate vision, Seedance 2.5, Nano Banana 2, Tripo H3.1
- `TAVILY_API_KEY` — official PDF lookup, missing-tool shops, Finish / Find a way research
- `OPENAI_API_KEY` — hosted Lab bench assistance
- `OPENAI_MODEL_HARD` / `OPENAI_MODEL_EASY` — hosted request models
- `PORT` — Express API (default `8787`); `CLIENT_PORT` — client port recorded for Electron (Vite serves `5173`)

## Work around the guide

**Watch** keeps the manual primary and reveals official steps in order. Use it to compare the current plate with the parts and trouble notes attached to that step.

**Bench** adapts existing pieces in 3D. **House** places those pieces against room photos and measurements. Camera capture stays inside **Scan**, where it supplies reconstruction views instead of becoming a separate Lab mode. These spaces support the build; they do not replace the instructions.

**Scan** accepts aligned photos, additional stills, a walk-around video, or a video URL. It reconstructs a local visual hull and can use a known object or two measured points for scale. No paid reconstruction model or uploaded weights are required.

When a furniture model is ready, **Finish / Find a way** analyzes its geometry and finish, ranks construction methods, derives dimensioned tops, legs, aprons, stretchers, boards, and shaped cuts, prepares a printable ways-to-make PDF, and creates an IKEAlive watch / plan / todo. Each changed model gets a new saved revision. Tavily can optionally research boards, stock, and hardware for that revision; without it, shape and dimension matches plus ordinary public sourcing links remain. See [`docs/BUILD-WAYS.md`](docs/BUILD-WAYS.md).

## Move around the evidence

**Watch** follows the guide one plate at a time.

**Bench** opens existing pieces in a 3D workspace. **House** rebuilds the room from photos and measurements, then checks the current table against the available space.

**Scan** works from aligned views, the browser or Electron camera, a walk-around video, or a same-Wi-Fi phone upload. It reconstructs a local visual hull, scales it from known evidence, and can bake the fitted model and scene into a custom IKEAlive plan.

**Finish & find ways** begins with the table already modeled. It records a revision, proposes construction routes, derives dimensioned tops, legs, rails, boards, and cuts, prepares a printable PDF, and opens the result as an IKEAlive Watch plan. Tavily can research that saved shape with one search; without it, dimension matches and ordinary public search links remain available.

These spaces customise how existing evidence is inspected and carried into the next useful assembly workflow. The guide, model, and room stay visible as the source.

## Phone upload (Tailscale or LAN)

Lab → **Scan** → **Send from phone** shows a selectable URL, **Copy** button, and QR. When the app is opened through Tailscale HTTPS, that secure phone-ready address is primary:

`https://<machine>.<tailnet>.ts.net/phone-upload`

The panel also keeps `http://<lan-ip>:5173/phone-upload` (or API port `8787`) as a same-Wi-Fi fallback.

Open either link in the phone browser, then use its single **Record / Send ~30s video** button. The page posts the clip to `/api/scan/video`; `.ts.net`, localhost, and private-LAN browser origins are accepted by the API. Lab extracts frames, rebuilds room occupancy, cuts the old table footprint, and auto-fits the current table. From there, **Finish / Find a way** researches ways to make the final table, while **Scan current model + scene** carries the fit into an IKEAlive plan.

See [Furniture-piece sourcing policy](docs/BUILD-WAYS.md) for the build-route and cut-list boundary.

## How it is arranged

1. `client/` ingests PDFs and presents Upload, Watch, Bench, House, and Scan.
2. `server/` owns guide parsing, assembly order, scene context, and service adapters.
3. `guides/` holds the existing official source material.
4. `electron/` runs the same client and API in a desktop shell.
5. `docs/` records product and sourcing boundaries.
6. `tests/` protects guide locks, render inputs, service boundaries, room fitting, and reconstruction behavior.
