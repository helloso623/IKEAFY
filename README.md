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

Lab is one workspace with three spaces: **Bench** (3D edit), **House** (your room photos rebuilt as a real 3D scene), and **AR** (a live `#ar-photo` camera/furniture overlay). Click **Lab** to open it (IKEAlive modes hide); click **Lab** again to return. IKEAlive (upload / watch) stays the default tab.

AR requests the browser/Electron camera and captures a six-frame burst locally; those frames update the textured `#room-scene` house while furniture from the plan, bench, and scans is placed inside. The single-photo and multi-file photo inputs remain available when camera access is unavailable. Width and depth set metric scale; otherwise the photo aspect and wall/floor horizon estimate the room. No room image leaves the machine.

### Object scans

Lab → **Scan** accepts aligned front, side, and top photos plus a circumference or known length. It segments the photos locally, intersects their silhouettes into a binary voxel visual hull, and polygonizes that hull into a real `THREE.BufferGeometry` body (`scan-mesh`). The dependency-free reconstruction code in `client/src/scan-reconstruct.js` is offered under the **MIT License**; it uses no paid API, uploaded model, or model weights.

---

<p align="center"><sub>IKEAFY is the repo. All rights reserved.</sub></p>
