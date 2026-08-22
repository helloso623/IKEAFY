# IKEAlive

A consumer app for assembling IKEA furniture. Upload an instructions PDF (or paste a guide). The studio turns the plates into a Veed reel you watch one step at a time. Official LACK is a secondary locked sheet. The right rail holds inventory, troubles, identify, and small parts.

## Run

```bash
cp .env.example .env   # optional — leave keys empty to stay local
npm install
npm run dev
```

- App: `http://localhost:5173`
- API: `http://localhost:8787`

Desktop (the same Vite client + Express API in an Electron window — IKEAlive upload/watch, Lab Bench, House):

```bash
npm run electron
```

`npm run electron` and `npm run electron:dev` start Express + Vite, then open the local UI. Keep using `npm run dev` for the browser. After `npm run build`, `electron .` (without `ELECTRON_DEV`) starts Express and loads `file://dist` when the build is present, otherwise `http://127.0.0.1:5173`.

`.env` stays out of git. Do not commit keys. `FAL_KEY` is optional (Veed step films); without it the studio uses a local storyboard.

## Folders

| Path | What lives here |
| --- | --- |
| `client/` | Vite + Three UI (studio, bench, house) |
| `electron/` | Desktop shell that loads the Vite client + Express API |
| `server/` | Express API |
| `guides/` | Official building guides |
| `docs/` | Short product notes |

Lab is one workspace with three spaces: **Desk** (3D edit), **House** (photo + measurements in the same rails, not a separate product), and **AR** (the `#ar-photo` room-camera overlay). IKEAlive (upload / watch) stays the default tab.

### Object scans

Lab → **Scan** accepts aligned front, side, and top photos plus a circumference or known length. It segments the photos locally, intersects their silhouettes into a binary voxel visual hull, and polygonizes that hull into a real `THREE.BufferGeometry` body (`scan-mesh`). The dependency-free reconstruction code in `client/src/scan-reconstruct.js` is offered under the **MIT License**; it uses no paid API, uploaded model, or model weights.
