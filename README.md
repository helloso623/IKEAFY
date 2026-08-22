# IKEAlive

A consumer app for assembling IKEA furniture. Upload an instructions PDF, or type a product name so Tavily can fetch the official IKEA PDF (catalog stand-in without `TAVILY_API_KEY`). The studio turns the plates into a Seedance reel you watch one step at a time. Official LACK is a secondary locked sheet. The right rail holds inventory, troubles, identify, and small parts. Watch chat has a Mic that uses the Web Speech API and `/api/agents/chat` so spoken commands can start the reel, change step, or request a spare.

## Run

```bash
cp .env.example .env   # optional — leave keys empty to stay local
npm install
npm run dev
```

- App: `http://localhost:5173`
- API: `http://localhost:8787`

Desktop (the same Vite client + Express API in an Electron window — IKEAlive upload/watch, Lab Desk, House):

```bash
npm run electron
```

`npm run electron`, `npm run electron:dev`, and `npm run dev:electron` start Express + Vite, then open the local UI. Keep using `npm run dev` for the browser. After `npm run build`, `electron .` (without `ELECTRON_DEV`) starts Express and loads `file://dist` when the build is present, otherwise `http://127.0.0.1:5173` or the Express origin.

`.env` stays out of git. Do not commit keys. `FAL_KEY` is optional (Veed step films); without it the studio uses a local storyboard.

## Folders

| Path | What lives here |
| --- | --- |
| `client/` | Vite + Three UI (studio, bench, house) |
| `electron/` | Desktop shell that loads the Vite client + Express API |
| `server/` | Express API |
| `guides/` | Official building guides |
| `docs/` | Short product notes |

Lab is one workspace with three spaces: **Desk** (3D edit), **House** (photo + measurements in the same rails, not a separate product), and **AR** (the `#ar-photo` room-camera overlay). Click **Lab** to open it (IKEAlive modes hide); click **Lab** again to return. IKEAlive (upload / watch) stays the default tab.

### Object scans

Lab → **Scan** accepts aligned front, side, and top photos plus a circumference or known length. It segments the photos locally, intersects their silhouettes into a binary voxel visual hull, and polygonizes that hull into a real `THREE.BufferGeometry` body (`scan-mesh`). The dependency-free reconstruction code in `client/src/scan-reconstruct.js` is offered under the **MIT License**; it uses no paid API, uploaded model, or model weights.
