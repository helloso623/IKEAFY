# IKEAFY

Build anything like it came flat-packed.

IKEAFY is the main idea and it gets its own full-page tab. Search an official IKEA product (LACK is unlocked) or drop any building guide, and the studio turns it into numbered steps with an IKEA-style instruction film: one black-and-white plate per step that waits for you, colorizes on demand, and never lets official mode skip ahead. Results split into **Instructions** (film, 3D scheme, chat, reviews, free spare fittings) and **Material** (included vs to-purchase, with several shop links). Electronics stays a Bench feature of this same app — isolate a board, run cables, flash a Nano — not a separate product.

The Bench and House tabs support it: a bench with real-size parts, cables, tape, and physics tests, and a house view that places the finished piece in your room photo.

## Run

```bash
cp .env.example .env   # optional. Leave keys empty to stay local.
npm install
npm test
npm run dev
```

- UI: `http://localhost:5173`
- API: `http://localhost:8787`

Do not put keys in the repo. `.env` is gitignored. Rotate any key that was pasted in chat. `FAL_KEY` is optional — it enables Veed Fabric 1.0 film renders; without it the studio uses the local canvas storyboard.

## The IKEAFY studio (the main tab)

The studio takes the full page. It does not auto-play a sheet: you start from **input**, watch **progress**, then read **results**.

1. **Input** — search an official IKEA product by name (only **LACK** is unlocked; KALLAX, BILLY, MALM are shown locked) or drop a building guide (photo / PDF / text), paste the steps, add optional notes about the tools you have, and hit **Parse into a film**.
2. **Progress** — parsing (GLiNER 2), generating films (Veed), looking up parts (Tavily).
3. **Results · Instructions** — a film per step, **See actual guide**, a 3D scheme, extra context (text / image / video) to regenerate the plate, reviews of where other builders struggled, a **broken part** photo that either drafts a **free spare-fittings request** or tells you to go to the store when there is no part number, and **Ask the shop** (GLiNER 2 for small questions, larger OpenAI model when it has to escalate).
4. **Results · Material** — kit vs extra with **included** / **to purchase** badges, a colour swatch for each part, and several retailer propositions (IKEA, Amazon, local) on anything you have to buy.

The **Bench** tab is still in the same app. Electronics controls (isolate a cluster as a named board, label functions, cables, Arduino flash) appear there when something electronic is on the bench.

Partner hooks (Veed Fabric 1.0 via fal, Pioneer/GLiNER 2, Tavily) are named in `/api/health` and stand in locally — see `docs/IKEAFY.md`.

## The supporting tabs

- **Bench** — drop furniture (and electronics only when you pick them), rescale, retexture, move, rotate (`G` / `R` / `Shift+S`). The catalog is a scrollable shelf of hardware samples — keep scrolling to add more pieces — with a budget filter and a **Delete** button for mistakes. Extra lab tests, tape, and cables stay tucked away until you open them. Electronics controls appear only when something on the bench actually has ports.
- **House** — photo + room measurements + budget → adaptation plan that places the piece and lists cheaper stand-ins. Overlay is the same render as the bench.

## Ten agents

| Desk | Model seat | Job |
| --- | --- | --- |
| Foreman | Fable | Orchestration |
| Architect | Opus | Keep the build IKEA-simple |
| Stress analyst | GPT 5.6 | Breaking points |
| Circuit lead | GPT 5.6 | Nets, boards, pins |
| Physics lab | GPT 5.6 | Weather / flow / aero |
| Shop grok | Grok | Camera, move, texture |
| Parts scout | Grok | Catalog + cost barrier |
| Assembler | Grok | Ikeafy steps |
| Firmware tech | GPT 5.6 | Arduino abstraction |
| AR stylist | Grok | Room photo plan |

Hosted calls use `OPENAI_API_KEY` when set. Failures fall back to the steward. The steward is the default.

## Later

Anything you want to build, not only IKEA: a photo, a clip, or a description of a broken car part. Same parse → film → spare path.
