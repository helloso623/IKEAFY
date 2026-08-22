# IKEAFY

A black-and-white consumer app for assembling IKEA furniture. Pick an official product (LACK is unlocked) or paste a guide. The studio plays one instruction plate at a time, shows what is in the box vs what to buy, and can place the finished piece in a room photo.

## Run

```bash
cp .env.example .env   # optional — leave keys empty to stay local
npm install
npm run dev
```

- App: `http://localhost:5173`
- API: `http://localhost:8787`

`.env` stays out of git. Do not commit keys. `FAL_KEY` is optional (Veed step films); without it the studio uses a local storyboard.

## Folders

| Path | What lives here |
| --- | --- |
| `client/` | Vite + Three UI (studio, bench, house) |
| `server/` | Express API |
| `guides/` | Official building guides |
| `docs/` | Short product notes |

Bench and House sit beside the studio: a 3D workbench for the parts, and a house view that drops the piece into your room.
