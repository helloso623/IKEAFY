# IKEAlive

Consumer assembly studio: upload an IKEA PDF, get a reel of steps, then watch one plate at a time.

1. Upload an instructions PDF or paste a guide. Official **LACK** is a secondary locked sheet.
2. Parse + `runStart` + Veed Fabric (`/api/ikeafy/video/reel`) build the reel. No `FAL_KEY` → local storyboard.
3. `#app` switches to `data-interface="watch"`. Official mode unlocks plates in order.
4. The right rail is the IKEAlive watch: four same-style cards for kit vs extra, where people had troubles, part ID, and small-parts requests.

## Technology partners

- **[fal](https://fal.ai)** — generative media for Seedance video, Nano Banana 2 stills, Tripo H3.1 3D, and plate vision. Set `FAL_KEY`; never commit its value. Claim the **event offer** code `techeuropexfal-london` for **$25 in credits** on the official [fal billing page](https://fal.ai/dashboard/usage-billing/credits). Event offers may expire. See [fal pricing and billing documentation](https://fal.ai/docs/documentation/model-apis/pricing).
- **[Pioneer by Fastino](https://fastino.ai)** — GLiNER 2 normalization over extracted PDF text and grounded current-guide Q&A. Set `PIONEER_API_KEY` from [gliner.pioneer.ai](https://gliner.pioneer.ai) to use the hosted Pioneer API (preferred; no Hugging Face download). Optional local fallback uses `GLINER2_MODE=local` with `GLINER2_MODEL` / `GLINER2_PYTHON`. See Fastino's official [GLiNER 2 overview](https://fastino.ai/models/gliner2) and [API tutorial](https://github.com/fastino-ai/GLiNER2/blob/main/tutorial/7-api.md).
- **[Tavily](https://www.tavily.com)** — official product-manual lookup, shop discovery, and web extraction, research, and crawling. Set `TAVILY_API_KEY`; never commit its value. Signup includes **1,000 credits**, and the **event offer** code `AugustLondon` adds **8,000 credits**. Event offers may expire. See the [Tavily documentation](https://docs.tavily.com/welcome).

See the repo [README](../README.md) for how to run.
