<h1 align="center">IKEAlive</h1>

<p align="center"><strong>Make the guide fit the build.</strong></p>

<p align="center">Adapt the instructions you have to the room, tools, parts, and questions in front of you.</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-1c1c1e?style=flat-square" alt="Node.js 20+" /></a>
  <a href="https://github.com/helloso623/IKEAFY/actions/workflows/test.yml"><img src="https://github.com/helloso623/IKEAFY/actions/workflows/test.yml/badge.svg" alt="Test workflow status" /></a>
</p>

<br />

IKEAlive starts with existing evidence. Drop in a real IKEA instructions PDF, open the locked official LACK guide, add your notes and owned tools, or search for an official manual by product name with Tavily. It keeps that source material at the center while adapting the next useful view to your build.

It does not invent an assembly from a blank prompt.

## Bring what already exists

- **A real IKEA PDF** — upload the manual you are actually following.
- **Official LACK** — use the built-in, article-stamped guide; its sequence stays locked.
- **Your context** — record what is confusing, what is missing, and which tools you already own.
- **A product name** — with `TAVILY_API_KEY`, retrieve an official IKEA manual instead of composing one.

From there, choose a useful adaptation: a step film, an instruction still, or a spatial 3D view. The source guide remains the authority; the output changes how you inspect it.

| Adaptation | What it preserves |
| --- | --- |
| Step film | The selected instruction and its order |
| Instruction still | The parts, action, and viewpoint for one plate |
| 3D view | The guide's pieces and current assembly context |

The AI orb carries the active guide, selected part, notes, owned tools, and command history into the conversation. Ask about the step in front of you rather than starting over.

## Run

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

App [localhost:5173](http://localhost:5173) · API [localhost:8787](http://localhost:8787)

```bash
npm run electron
```

The Electron command starts the same Vite client and Express API inside the desktop shell.

## Optional services

Copy `.env.example` to `.env` when you want hosted services. Never commit the populated file.

- `FAL_KEY` — Seedance step films, Nano Banana instruction stills, and Tripo meshes
- `OPENAI_API_KEY` — hosted Lab bench assistance
- `OPENAI_MODEL_HARD` — model used for harder hosted requests
- `OPENAI_MODEL_EASY` — model used for lighter hosted requests
- `TAVILY_API_KEY` — official IKEA PDF and missing-tool lookup
- `PORT` — Express API port; defaults to `8787`
- `CLIENT_PORT` — client port recorded in local configuration; Vite runs on `5173`

Without keys, IKEAlive keeps local guide parsing, the official LACK sheet, notes, owned tools, catalog stand-ins, and local reconstruction available. Hosted renders and live searches report that their key is missing; they do not silently pretend to have run.

## Work around the guide

**Watch** keeps the manual primary and reveals official steps in order. Use it to compare the current plate with the parts and trouble notes attached to that step.

**Bench** adapts existing pieces in 3D. **House** places those pieces against room photos and measurements. Camera capture stays inside **Scan**, where it supplies reconstruction views instead of becoming a separate Lab mode. These spaces support the build; they do not replace the instructions.

**Scan** accepts aligned photos, additional stills, a walk-around video, or a video URL. It reconstructs a local visual hull and can use a known object or two measured points for scale. No paid reconstruction model or uploaded weights are required.

When a furniture model is ready, **Finish & build** matches real hardware, prepares a printable PDF bill of materials, and creates an IKEAlive assembly run.

## Structure

| Path | What lives here |
| --- | --- |
| `client/` | Vite, guide ingestion, Watch, Lab Bench/House, and Scan |
| `electron/` | Desktop shell for the client and API |
| `server/` | Express routes and service adapters |
| `guides/` | Existing official building guides |
| `docs/` | Product and implementation notes |
| `tests/` | Node tests for guides, agents, rendering inputs, and reconstruction |

Lab is one workspace with two spaces: **Bench** (3D edit) and **House** (your room photos rebuilt as a real 3D scene). **Scan** opens the object-scan inputs inside the Bench outliner; camera and video are inputs there, not a third Lab mode. Click **Lab** to open it (IKEAlive modes hide); click **Lab** again to return. IKEAlive (upload / watch) stays the default tab.

House uses single-photo and multi-file uploads, or a ~30s walk sent from a phone. Width and depth set metric scale; otherwise the photo aspect and wall/floor horizon estimate the room, or tap two points on the photo that are 1 m apart (or the ends of a known object). No room image leaves the machine.

---

Lab → **Scan** accepts aligned front, side, and top photos, the live browser/Electron camera, extra stills, or a walk-around video. Video and camera stills populate the same three-view inputs and reconstruct into a mesh on the Bench. Scale is cheap and local: a known object (credit card, A4, side table, door), the wall/floor vanishing line, or tap two points on a frame that are 1 m apart. It segments the photos locally, intersects their silhouettes into a binary voxel visual hull, and polygonizes that hull into a real `THREE.BufferGeometry` body (`scan-mesh`).

Polygonization uses Mikola Lysenko's zero-dependency [`isosurface`](https://github.com/mikolalysenko/isosurface) package fetched through npm. It is **MIT licensed**; the copyright and full license text are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The pipeline uses no paid API, uploaded model, or model weights.

### Send from phone

Same Wi-Fi as the Lab computer. Lab → **Scan** → **Send from phone** shows a LAN URL and QR:

`http://<lan-ip>:5173/phone-upload`

(or `http://<lan-ip>:8787/phone-upload` if you open the API directly). On the phone, record or upload a ~30s walk around the room. The page POSTs the clip to `/api/scan/video`. The Lab computer pulls stills in the browser and rebuilds the 3D house. Nothing is uploaded to a paid reconstruction model. `npm run dev` already binds Vite on `0.0.0.0:5173` (and the API on `0.0.0.0:8787`).

---

## Social preview

The repository currently has no committed social-preview image. Add one in the GitHub repository settings when final brand artwork is available; the README intentionally does not reference a placeholder or missing asset.

<p align="center"><sub>IKEAlive is the product. All rights reserved.</sub></p>
