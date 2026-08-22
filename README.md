# IKEAFY

Build anything like it came flat-packed.

IKEAFY is the main idea and it gets its own full-page tab. Pick an official IKEA product (LACK is unlocked) or paste any building guide, and the studio turns it into numbered steps with an IKEA-style instruction film: one black-and-white plate per step that waits for you, colorizes on demand, and never lets official mode skip ahead. Around the film sit the things you actually need mid-build — what's in the kit vs what to buy, other builders' reviews and difficulty notes, a broken-part photo desk that requests free spare fittings from IKEA, and a quick chat.

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

Open the **IKEAFY** tab and the bench rails disappear — the studio takes the full page in three columns:

1. **Pick or paste** (left) — choose an official IKEA product (only **LACK** is unlocked; KALLAX, BILLY, MALM are shown locked) or paste any custom building guide, add optional notes about the tools you have, and hit **Parse into steps**.
2. **Watch and build** (center) — a large film stage plays one plate per step, black and white first, **Colorize plate** when you want it. The caption tells you exactly what to do. Press **I did this — next** when you're done, **Back** to review, or **Stuck** to expand the step into smaller moves. In official mode the plates unlock strictly in order — no skipping ahead.
3. **Everything around the build** (right) — **Kit vs extra** splits what ships in the box from what you need to buy, with IKEA and Amazon links (catalog list only, no live scrape). **Reviews & difficulties** shows where other builders struggled. **Broken part** attaches a photo and note to the current step, identifies the part, and files a **free spare-fittings request with IKEA** (screws, cam locks, dowels). **Quick chat** answers questions about the step, a tool, or a part.

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
