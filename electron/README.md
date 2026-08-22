# IKEAFY Desktop (Electron)

A thin Electron shell that wraps the IKEAFY Next.js app in a native desktop window.

## Running in development

You need two terminals:

```bash
# Terminal 1 — start the Next.js server
npm run dev

# Terminal 2 — launch the Electron window
npm run electron
```

> The `electron` script and the `electron` devDependency are added by the
> orchestrator; they are not defined in `package.json` here.

## How it works

- `main.js` is the Electron main process. It reads `PORT` (default `3000`) and
  loads `http://localhost:<PORT>` — the local Next.js server. If the dev server
  isn't ready yet, it retries the load a few times.
- External links (`target="_blank"` and `http(s)` URLs) open in your default
  browser instead of inside the app window.
- `preload.js` uses `contextBridge` to expose a tiny, read-only `window.ikeafy`
  API (`platform`, `isElectron`) with `contextIsolation` enabled and Node
  integration disabled.

## Production

After building the web app (`npm run build`), run `npm start` to serve it, then
launch Electron the same way. Set `PORT` if you serve on a non-default port.
