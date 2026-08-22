# Partner stand-ins

These names are reserved in the API health payload. Nothing is called yet.

| Partner | Intended job | What runs now |
| --- | --- | --- |
| Veed | Step videos | Local birch-workshop storyboard |
| Pioneer / GLiNER 2 | Guide → JSON steps | Deterministic parser in `server/lib/ikeafy.js` |
| Tavily | Web parts + extra tools | Live shop search when `TAVILY_API_KEY` is set; catalog links otherwise |

Fine-tune target for the parser: `{ number, partsUsed, action, toolRequired }`.
