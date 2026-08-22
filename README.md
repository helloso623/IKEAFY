<p align="center">
  <img src="docs/social-preview.jpg" alt="IKEAlive — the booklet, as a film." width="1280" />
</p>

<h1 align="center">IKEAlive</h1>

<p align="center"><strong>The booklet, as a film.</strong></p>

<p align="center">Upload an IKEA PDF. Pick a lens. Watch the step.</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-1c1c1e?style=flat-square" alt="Node.js 20+" /></a>
</p>

<br />

| Video | Nano Banana stills | Tripo 3D |
| :---: | :---: | :---: |
| The step, as a film. | Instruction plates, one at a time. | The pieces, in space. |

`FAL_KEY` unlocks all three. Leave keys empty and nothing leaves the machine.

IKEAlive is the front door for assembling IKEA furniture. Upload an instructions PDF, or type a product name so Tavily can fetch the official IKEA PDF (catalog stand-in without `TAVILY_API_KEY`). The studio turns the plates into a Seedance reel you watch one step at a time. The bottom-right AI orb opens chat, voice, command history, and the scene context.

## Run

```bash
npm install
npm run dev
```

App [localhost:5173](http://localhost:5173) · API [localhost:8787](http://localhost:8787)

```bash
npm run electron
```

Node 20+. Copy `.env.example` → `.env` if you want keys. Do not commit `.env`.

## Keys

Names only.

`FAL_KEY` — video, Nano Banana 2 stills, Tripo H3.1 meshes
`OPENAI_API_KEY` — hosted Lab bench
`TAVILY_API_KEY` — official IKEA PDF lookup

## Structure

| Path | What lives here |
| --- | --- |
| `client/` | Vite + Three UI (studio, bench, house) |
| `electron/` | Desktop shell that loads the Vite client + Express API |
| `server/` | Express API |
| `guides/` | Official building guides |
| `docs/` | Short product notes |

Lab is one workspace with two spaces: **Bench** (3D edit) and **House** (your room photos rebuilt as a real 3D scene). **Scan** opens the object-scan inputs inside the Bench outliner; camera and video are inputs there, not a third Lab mode. Click **Lab** to open it (IKEAlive modes hide); click **Lab** again to return. IKEAlive (upload / watch) stays the default tab.

House uses single-photo and multi-file room inputs. Width and depth set metric scale; otherwise the photo aspect and wall/floor horizon estimate the room, or tap two points on the photo that are 1 m apart (or the ends of a known object). No room image leaves the machine.

### Object scans

Lab → **Scan** accepts aligned front, side, and top photos, the live browser/Electron camera, extra stills, a walk-around video, or a video URL. Video and camera stills populate the same three-view inputs and reconstruct into a mesh on the Bench. Scale is cheap and local: a known object (credit card, A4, side table, door), the wall/floor vanishing line, or tap two points on a frame that are 1 m apart. It segments the photos locally, intersects their silhouettes into a binary voxel visual hull, and polygonizes that hull into a real `THREE.BufferGeometry` body (`scan-mesh`).

Polygonization uses Mikola Lysenko's zero-dependency [`isosurface`](https://github.com/mikolalysenko/isosurface) package fetched through npm. It is **MIT licensed**; the copyright and full license text are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The pipeline uses no paid API, uploaded model, or model weights.

### Tailscale (optional)

`npm run dev` already binds the app on `0.0.0.0:5173`. On a tailnet, open that site from another device, then send a video URL or frames into Lab → **Scan** (paste the URL and **Pull frames**, or upload the clip). Stills are grabbed in the browser; the API only proxies the file so CORS does not block a phone on MagicDNS. Nothing is uploaded to a paid reconstruction model.

---

<p align="center"><sub>IKEAFY is the repo. All rights reserved.</sub></p>
