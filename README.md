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

## Optional services

Copy `.env.example` to `.env` when you want hosted services. Never commit the populated file.

- `FAL_KEY` — drawing-plate interpretation through fal's multimodal vision endpoint, plus Seedance films, Nano Banana stills, and Tripo meshes
- `PIONEER_API_KEY` — preferred Pioneer/Fastino GLiNER 2 cloud API ([gliner.pioneer.ai](https://gliner.pioneer.ai)); avoids local Hugging Face downloads
- `OPENAI_API_KEY` — hosted Lab bench assistance
- `OPENAI_MODEL_HARD` — model used for harder hosted requests
- `OPENAI_MODEL_EASY` — model used for lighter hosted requests
- `TAVILY_API_KEY` — official IKEA PDF and missing-tool lookup
- `PORT` — Express API port; defaults to `8787`
- `CLIENT_PORT` — client port recorded in local configuration; Vite runs on `5173`

PDF text is extracted first and structured with Pioneer/Fastino GLiNER 2 (cloud API when `PIONEER_API_KEY` is set, otherwise optional local `fastino/gliner2-base-v1`). When that text does not contain grounded assembly steps, fal's `openrouter/router/vision` endpoint reads the rasterized plates with `google/gemini-2.5-flash`. GLiNER 2 then normalizes the returned plate description when possible; if normalization yields no steps, the structured fal JSON is used directly. This PDF path does not use `OPENAI_API_KEY`.

Without keys, IKEAlive keeps local guide parsing, the official LACK sheet, notes, owned tools, catalog stand-ins, and local reconstruction available. Drawing-only PDF parsing, hosted renders, and live searches report the specific key they need; they do not silently pretend to have run.

## Work around the guide

**Watch** keeps the manual primary and reveals official steps in order. Use it to compare the current plate with the parts and trouble notes attached to that step.

**Bench** adapts existing pieces in 3D. **House** places those pieces against room photos and measurements. Camera capture stays inside **Scan**, where it supplies reconstruction views instead of becoming a separate Lab mode. These spaces support the build; they do not replace the instructions.

**Scan** accepts aligned photos, additional stills, a walk-around video, or a video URL. It reconstructs a local visual hull and can use a known object or two measured points for scale. No paid reconstruction model or uploaded weights are required.

When a table model is ready, **Finish & find ways** researches construction methods for that final shape, derives its dimensioned tops, legs, rails, boards, and cut list, prepares a printable PDF, and creates an IKEAlive watch / plan / todo.

## Structure

## Connect the optional services

Copy `.env.example` to `.env`, add only the services you need, and keep the populated file out of Git.

- `FAL_KEY` enables Seedance 2.5 films, Nano Banana 2 stills, Tripo H3.1 meshes, and drawing-plate vision.
- `PIONEER_API_KEY` enables Pioneer-hosted GLiNER 2 for PDF text extraction and guide Q&A (preferred over local Hugging Face downloads).
- `TAVILY_API_KEY` enables official-manual lookup and live tool offers.
- `OPENAI_API_KEY` enables hosted Lab bench assistance.
- `OPENAI_MODEL_HARD` and `OPENAI_MODEL_EASY` select the hosted request models.
- `PORT` sets the API port. `CLIENT_PORT` sets the client port used by Electron.

The app and locked LACK flow run without hosted keys. Features that require a missing key report that requirement instead of presenting a generated fallback as a completed render or search.

## Move around the evidence

**Watch** follows the guide one plate at a time.

**Bench** opens existing pieces in a 3D workspace. **House** rebuilds the room from photos and measurements, then checks the current table against the available space.

**Scan** works from aligned views, the browser or Electron camera, a walk-around video, or a same-Wi-Fi phone upload. It reconstructs a local visual hull, scales it from known evidence, and can bake the fitted model and scene into a custom IKEAlive plan.

**Finish & find ways** begins with the table already modeled. It records a revision, proposes construction routes, derives dimensioned tops, legs, rails, boards, and cuts, prepares a printable PDF, and opens the result as an IKEAlive Watch plan. Tavily can research that saved shape with one search; without it, dimension matches and ordinary public search links remain available.

These spaces customise how existing evidence is inspected and carried into the next useful assembly workflow. The guide, model, and room stay visible as the source.

## Phone upload (LAN)

In Lab → Scan, **Send from phone** shows a QR code and a local `http://<lan-ip>:5173/phone-upload` link. A phone on the same Wi-Fi can record or choose a room walk of up to 30 seconds and post it to `/api/scan/video`.

Lab extracts frames, rebuilds room occupancy, and auto-fits the current table. From there, **Finish & find ways** researches ways to make the final table, while **Scan current model + scene** carries the fit into an IKEAlive plan.

See [Furniture-piece sourcing policy](docs/BUILD-WAYS.md) for the build-route and cut-list boundary.

## How it is arranged

1. `client/` ingests PDFs and presents Upload, Watch, Bench, House, and Scan.
2. `server/` owns guide parsing, assembly order, scene context, and service adapters.
3. `guides/` holds the existing official source material.
4. `electron/` runs the same client and API in a desktop shell.
5. `docs/` records product and sourcing boundaries.
6. `tests/` protects guide locks, render inputs, service boundaries, room fitting, and reconstruction behavior.
