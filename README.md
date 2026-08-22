# IKEAFY

A workshop for building things you can actually put in a room.

The first system is **not** an AI product. It is a bench: parts with real sizes, cables that lock, tape that holds or peels, weather and load tests, Arduino as one abstraction and physics as another, a 3D printer queue, and an IKEA-style film of the plan. Ten shop agents sit on top of that bench. If no hosted key is present they still run, as a local steward.

## Run

```bash
cp .env.example .env   # optional. Leave OPENAI_API_KEY empty to stay local.
npm install
npm test
npm run dev
```

- Bench UI: `http://localhost:5173`
- API: `http://localhost:8787`

Do not put keys in the repo. `.env` is gitignored. Rotate any key that was pasted in chat.

## What the bench does

- **Sandbox** — drop furniture and electronics, rescale, retexture, move, rotate (`G` / `R` / `Shift+S`).
- **Cables** — ports mate or refuse. JST / header / screw lock in. Loose / zip / raceway disposition.
- **Lab** — strength, pressure, wave, flow, aero, speed+force, heat/cold, rain. Tape changes hold and IP. **Reset** after a run.
- **Electronics** — cost barrier, min specs, isolate a cluster as a named board, label functions, flash a Nano sketch and see the LED.
- **Print** — printable bodies become ASCII STL jobs.
- **Ikeafy** — paste a guide + optional tool notes → structured steps → birch-workshop film per step → wait on you → expand if you are stuck → kit vs extra (IKEA / Amazon / hardware links, catalog list only) → reviews and difficulties → attach a broken-part note to a step → spare + fix.
- **House** — photo + room measurements + budget → adaptation plan that places the piece and lists cheaper stand-ins. Overlay is the same render as the bench.

Online research is a **list**, not a live scrape. Partner hooks (Veed, Pioneer/GLiNER 2, Tavily) are named in `/api/health` and left uncalled.

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
