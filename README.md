<p align="center">
  <img src="docs/social-preview.jpg" alt="IKEAlive — the booklet, as a film." width="1280" />
</p>

<h1 align="center">IKEAlive</h1>

<p align="center"><strong>The booklet, as a film.</strong></p>

<p align="center">Upload an IKEA PDF. Pick a lens. Watch the step.</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-1c1c1e?style=flat-square" alt="Node.js 20+" /></a>
</p>

<br />

| Video | Nano Banana stills | Tripo 3D |
| :---: | :---: | :---: |
| The step, as a film. | Instruction plates, one at a time. | The pieces, in space. |

`FAL_KEY` unlocks all three. Leave keys empty and nothing leaves the machine.

## Run

```bash
npm install
npm run dev
```

App [localhost:5173](http://localhost:5173) · API [localhost:8787](http://localhost:8787)

```bash
npm run electron
```

Node 20+. Copy `.env.example` → `.env` if you want keys. Do not commit `.env`.

## Keys

Names only.

`FAL_KEY` — video, Nano Banana 2 stills, Tripo H3.1 meshes  
`OPENAI_API_KEY` — hosted Lab bench  
`TAVILY_API_KEY` — official IKEA PDF lookup

---

<p align="center"><sub>IKEAFY is the repo. All rights reserved.</sub></p>
