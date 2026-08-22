<p align="center">
  <img src="docs/social-preview.jpg" alt="IKEAlive — upload an IKEA PDF, watch a reel of steps" width="1280" />
</p>

# IKEAlive

**Upload an IKEA PDF. Watch a reel of the steps.**

IKEAFY is the repo; IKEAlive is the product — a consumer assembly studio that turns official IKEA plates into a film you follow one step at a time.

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/helloso623/IKEAlive)](https://github.com/helloso623/IKEAlive/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/helloso623/IKEAlive)](https://github.com/helloso623/IKEAlive/issues)

## What it is

Drop an instructions PDF, or type a product name so Tavily can fetch the official IKEA PDF (catalog stand-in without `TAVILY_API_KEY`). The studio turns the plates into a reel you watch one step at a time. Official LACK is a secondary locked sheet. The right rail holds inventory, troubles, identify, and small parts. Watch chat has a Mic that uses the Web Speech API and `/api/agents/chat` so spoken commands can start the reel, change step, or request a spare.

Lab is one workspace with three spaces: **Bench** (3D edit), **House** (photo + measurements in the same rails, not a separate product), and **AR** (the `#ar-photo` room-camera overlay). Click **Lab** to open it (IKEAlive modes hide); click **Lab** again to return. IKEAlive (upload / watch) stays the default tab.

## Run

Requires [Node.js](https://nodejs.org) 20 or newer.

**Browser**

```bash
cp .env.example .env   # optional — leave keys empty to stay local
npm install
npm run dev
```

- App: `http://localhost:5173`
- API: `http://localhost:8787`

**Electron** (full workshop in a desktop window — IKEAlive upload/watch, Lab Bench, House):

```bash
npm run electron
```

`npm run electron` and `npm run dev:electron` start the same Express + Vite stack as `npm run dev`, then open it in a desktop window. Keep using `npm run dev` if you want the browser instead. After `npm run build`, `electron .` (without `ELECTRON_DEV`) starts Express itself and loads the built client from `http://127.0.0.1:8787`.

## Environment

Copy `.env.example` to `.env`. Leave values empty to stay fully local. **Never commit `.env` or paste real keys.**

| Variable | What it enables | Without it |
| --- | --- | --- |
| `FAL_KEY` | Step films via fal.ai | Local storyboard |
| `OPENAI_API_KEY` | Lab bench generation (hosted steward) | Built-in local steward |
| `TAVILY_API_KEY` | Official IKEA PDF lookup and live shop links | Catalog stand-ins |

Optional also: `PORT` (API, default `8787`) and `CLIENT_PORT` (Vite, default `5173`). Model names such as `OPENAI_MODEL_HARD` live in `.env.example`.

`.env` stays out of git. Do not commit keys.

## Folders

| Path | What lives here |
| --- | --- |
| `client/` | Vite + Three UI (studio, bench, house) |
| `server/` | Express API |
| `electron/` | Desktop wrapper |
| `guides/` | Official building guides |
| `docs/` | Product notes and the GitHub social preview |
| `tests/` | Node test suite |

## License

No license file is published yet. All rights reserved until one is added.
