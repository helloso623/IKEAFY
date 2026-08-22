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

Desktop (full workshop in an Electron window — IKEAlive upload/watch, Lab Bench, House):

```bash
npm run electron
```

`npm run electron` and `npm run dev:electron` start the same Express + Vite stack as `npm run dev`, then open it in a desktop window. Keep using `npm run dev` if you want the browser instead. After `npm run build`, `electron .` (without `ELECTRON_DEV`) starts Express itself and loads the built client from `http://127.0.0.1:8787`.

`.env` stays out of git. Do not commit keys. `FAL_KEY` is optional (Veed step films); without it the studio uses a local storyboard.

## Folders

| Path | What lives here |
| --- | --- |
| `client/` | Vite + Three UI (studio, bench, house) |
| `server/` | Express API |
| `guides/` | Official building guides |
| `docs/` | Short product notes |

Lab opens Bench and House in one workspace: a 3D workbench for the parts, and a house plate that drops the piece into your room. IKEAlive (upload / watch) stays the default tab.
