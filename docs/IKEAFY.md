# IKEAlive

Consumer assembly studio: upload an IKEA PDF, get a reel of steps, then watch one plate at a time.

1. Upload an instructions PDF or paste a guide. Official **LACK** is a secondary locked sheet.
2. Parse + `runStart` + Veed Fabric (`/api/ikeafy/video/reel`) build the reel. No `FAL_KEY` → local storyboard.
3. `#app` switches to `data-interface="watch"`. Official mode unlocks plates in order.
4. The right rail is the IKEAlive watch: four same-style cards for kit vs extra, where people had troubles, part ID, and small-parts requests.

Partners named in `/api/health` stand in locally:

- **Veed Fabric 1.0 via fal** (`FAL_KEY`) — step films. Without a key, a local storyboard plays the same beats.
- **GLiNER** — part/tool extraction from pasted guides. Local parser today.
- **Tavily** — live shop search for tools not in the box (`TAVILY_API_KEY`). Catalog links stand in without a key.

See the repo [README](../README.md) for how to run.
