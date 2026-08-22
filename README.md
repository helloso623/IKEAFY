# IKEAFY

**Build it right, step by step.**

IKEAFY turns a furniture build guide (or just an IKEA product name) into a
clear, step-by-step assembly plan. Each plan comes with per-step tutorial-video
placeholders, a materials list (what's included vs. what you need to buy, with
retailer links), a quick-questions chat, and spare-parts guidance.

It is built as a [Next.js](https://nextjs.org) (App Router) app and is intended
to ship as an **Electron desktop app** wrapping the web UI.

## What it does

1. **Input** — Paste a build guide or type an IKEA product name.
2. **Parse** — The guide is parsed into a structured plan.
3. **Steps + videos** — Each step gets instructions and a tutorial-video
   placeholder.
4. **Materials** — A materials list separates included parts from items to buy,
   with retailer links.
5. **Chat** — Ask quick questions about your build.
6. **Spare parts** — Guidance for finding and ordering replacement parts.

## Tech stack

- **Next.js 15** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4** (`@import "tailwindcss"`)
- **better-sqlite3** for local persistence
- **Electron** desktop wrapper
- **ESLint** (`next/core-web-vitals`)

## Partner integrations

All partner integrations are **stubbed with hooks**. The app works fully
without any keys; when a key is present, the corresponding hook can call the
real service. Each integration is gated by an environment variable:

| Partner              | Purpose                          | Env var                        |
| -------------------- | -------------------------------- | ------------------------------ |
| Pioneer Gliner 2     | Guide parsing + quick chat       | `GLINER_API_KEY` / `PIONEER_API_KEY` |
| OpenAI               | Escalation for hard questions    | `OPENAI_API_KEY`               |
| Veed                 | Per-step tutorial videos         | `VEED_API_KEY`                 |
| Tavily               | Retailer / web scraping          | `TAVILY_API_KEY`               |

> Without these keys the app falls back to local stubs, so every feature stays
> functional in development and demos.

## Getting started

Requirements: Node.js 22+.

```bash
npm ci            # install dependencies
npm run dev       # start the dev server on http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000).

## Available scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Start the development server (port 3000)     |
| `npm run build`     | Create a production build                    |
| `npm run start`     | Serve the production build                   |
| `npm run lint`      | Run ESLint                                   |
| `npm run typecheck` | Type-check with the TypeScript compiler      |

### Running the Electron shell

The Electron wrapper loads the running Next.js server; start the web app first,
then launch Electron pointed at it.

```bash
# 1. Start the web UI (dev)
npm run dev
#    ...or a production build:
#    npm run build && npm run start

# 2. In another terminal, launch the desktop shell
electron electron/main.js
```

The window loads `IKEAFY_URL` (default `http://localhost:3000`). Override it to
point at a different host or port:

```bash
IKEAFY_URL="http://localhost:4000" electron electron/main.js
```

## API routes

| Method | Route              | Description                                  |
| ------ | ------------------ | -------------------------------------------- |
| `POST` | `/api/parse`       | Parse a guide/product into a structured plan |
| `GET`  | `/api/plans`       | List saved plans                             |
| `GET`  | `/api/plans/[id]`  | Fetch a single plan by id                    |
| `POST` | `/api/chat`        | Ask a quick question about a build           |

## Project layout

```
src/
  app/
    layout.tsx              # global branding/theme (header, nav)
    globals.css             # Tailwind v4 entry + theme vars
    page.tsx                # plan input + results UI
    plans/[id]/page.tsx     # saved plan detail
    api/
      parse/route.ts        # POST parse
      plans/route.ts        # GET plans
      plans/[id]/route.ts   # GET plan by id
      chat/route.ts         # POST chat
  lib/                      # parsing, db, and partner-integration hooks
electron/
  main.js                   # Electron main process (desktop wrapper)
  preload.js                # secure preload bridge
```

## Roadmap / not yet implemented

These are planned ideas and are **not built yet**:

- **3D / physics sandbox** — interactive 3D assembly preview with physics.
- **Electronics / GPIO wiring** — wiring diagrams and guidance for powered
  builds.
- **AR preview** — augmented-reality placement and step overlays.

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment:
`npm ci` installs dependencies and a `dev` terminal runs `npm run dev`.
