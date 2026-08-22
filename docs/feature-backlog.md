# IKEAFY — Feature Backlog

> Prioritized, implementation-ready backlog for the orchestrator to hand to coding agents.
> Stack: Electron shell + Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · `better-sqlite3`.
> Existing surface (do **not** rewrite): `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/chat.ts`, `src/lib/retailers.ts`, `src/lib/samplePlans.ts`, `src/lib/parse.ts`, API routes `/api/parse` · `/api/chat` · `/api/plans` · `/api/plans/[id]`, pages `/` and `/plan/[id]`, components `Tabs` · `Badge` · `MaterialItem` · `StepCard` · `ChatPanel`.

---

## Vision

IKEAFY turns any furniture/DIY building guide — pasted text, a dropped file, or an IKEA product name — into a clean, interactive, step-by-step build plan. Each plan carries per-step tutorial-video and 3D-scheme placeholders, a materials list that separates what's in the box from what you must buy (with retailer links), a difficulties/spare-parts helper, and an AI chat assistant. Everything ships as deterministic local logic first, with clearly marked hooks for partner tools — Veed (video), Pioneer Gliner 2 → OpenAI (parsing + chat), and Tavily (parts scraping) — so the product is fully usable with **no external API keys**, and gets richer when keys are present. The long arc reaches toward 3D assembly preview, electronics/physics simulation, AR room preview, review mining, and automated spare-part requests.

---

## Now (MVP core) — *in-flight this wave*

The end-to-end happy path is already being built and should be treated as the stable foundation every "Next" feature composes against:

1. **Input** — Home (`/`) offers three ways in: paste guide text, drop a `.txt`/`.md` file, or type an IKEA product name. Optional free-text "additional instructions".
2. **Parse** — `POST /api/parse` routes to `parseGuide()` (text) or `findProductPlan()`/`generateGenericPlan()` (product name), producing a `BuildPlan` (`src/lib/types.ts`). Gliner/OpenAI escalation is stubbed with deterministic logic.
3. **Persist** — `savePlan()` writes the plan to SQLite; `/api/plans` and `/api/plans/[id]` read it back. Home shows "Recent plans".
4. **Results** — `/plan/[id]` renders steps (`StepCard` with video + 3D scheme placeholders), a materials tab, tools, difficulties, and the spare-parts hint via `Tabs`/`Badge`/`MaterialItem`.
5. **Materials** — `retailerLinks()` builds deterministic IKEA/Amazon/Home Depot search URLs, split into "included" vs "to purchase" (`MaterialBadge`), with a Tavily hook for real scraped listings.
6. **Chat** — `POST /api/chat` answers plan-scoped questions via `answerQuestion()` (small model), escalating complex questions to a stubbed large model. Rendered by `ChatPanel`.

**Contract that "Next" features rely on:** a persisted `BuildPlan` with `id`, `steps[]`, `materials[]`, `tools[]`, `difficulties[]`, `sparePartsHint`, retrievable at `GET /api/plans/[id]` → `{ plan: BuildPlan }`.

---

## Next — parallelizable features

Each item below is **independent** and touches a **small, disjoint** set of new files, so many agents can build in parallel without merge conflicts. Where a feature needs to appear in an existing page, it exposes a self-contained component/route that the integrator drops in with a **one-line import** (called out as an "Integration seam") — no shared logic edits. All features work with **no API keys**; partner integrations are optional hooks.

Shared conventions every agent must follow: `"use client"` only where interactivity is needed; keep server logic in `src/lib/*`; use existing CSS vars `--ikeafy-blue` / `--ikeafy-yellow`; add `data-testid` on interactive elements; reuse `BuildPlan` types from `@/lib/types`; API routes return `NextResponse.json(...)` and use `export const dynamic = "force-dynamic"` when reading the DB.

---

### 1. Difficulty estimator

Deterministic 1–5 difficulty score + reasons derived from step count, tools, part diversity, and "purchase" materials. No keys.

- **New files:**
  - `src/lib/difficulty.ts`
  - `src/components/DifficultyMeter.tsx`
- **Signatures:**
  - `export type DifficultyResult = { score: 1 | 2 | 3 | 4 | 5; label: "Very easy" | "Easy" | "Moderate" | "Involved" | "Advanced"; minutesEstimate: number; factors: { label: string; weight: number }[] };`
  - `export function estimateDifficulty(plan: BuildPlan): DifficultyResult;`
  - `export function DifficultyMeter({ plan }: { plan: BuildPlan }): JSX.Element;`
- **API route:** none (pure client/server function).
- **Integration seam:** integrator adds `<DifficultyMeter plan={plan} />` to the plan header.

---

### 2. Tool checklist with progress

Interactive checklist of `plan.tools`, persisting checked state per plan in `localStorage`, with a progress bar.

- **New files:**
  - `src/components/ToolChecklist.tsx`
  - `src/lib/localProgress.ts`
- **Signatures:**
  - `export function ToolChecklist({ planId, tools }: { planId: number; tools: string[] }): JSX.Element;`
  - `export function readChecklist(scope: string): Record<string, boolean>;`
  - `export function writeChecklist(scope: string, state: Record<string, boolean>): void;`
  - `export function useChecklist(scope: string, keys: string[]): { state: Record<string, boolean>; toggle: (key: string) => void; completed: number; total: number };`
- **API route:** none (client-side persistence).
- **Integration seam:** `<ToolChecklist planId={plan.id!} tools={plan.tools} />` on the Tools tab. `localProgress.ts` is intentionally generic so features 3 and 8 can reuse it (import-only, no edits).

---

### 3. Per-step progress tracker + build timer

Marks steps done and times the total build. Reuses `useChecklist` from `src/lib/localProgress.ts` (feature 2) for step completion; timer is self-contained.

- **New files:**
  - `src/components/StepProgress.tsx`
  - `src/components/BuildTimer.tsx`
  - `src/lib/useBuildTimer.ts`
- **Signatures:**
  - `export function StepProgress({ planId, steps }: { planId: number; steps: BuildStep[] }): JSX.Element;`
  - `export function BuildTimer({ planId }: { planId: number }): JSX.Element;`
  - `export function useBuildTimer(scope: string): { elapsedMs: number; running: boolean; start: () => void; pause: () => void; reset: () => void };`
- **API route:** none.
- **Integration seam:** `<StepProgress .../>` above the steps list; `<BuildTimer planId={plan.id!} />` in the plan sidebar.

---

### 4. Cost estimator across retailers

Estimates total spend for "purchase" materials using a deterministic local price table (seeded pseudo-prices per retailer), with a Tavily hook to swap in scraped live prices.

- **New files:**
  - `src/lib/costEstimator.ts`
  - `src/components/CostEstimator.tsx`
  - `src/app/api/cost/route.ts`
- **Signatures:**
  - `export type RetailerQuote = { retailer: string; unitPrice: number; currency: "USD"; source: "estimate" | "tavily" };`
  - `export type MaterialCost = { name: string; quantity: number; cheapest: RetailerQuote; quotes: RetailerQuote[] };`
  - `export type CostEstimate = { currency: "USD"; total: number; lines: MaterialCost[]; note: string };`
  - `export function estimateCost(materials: Material[]): CostEstimate;`
  - `export function CostEstimator({ materials }: { materials: Material[] }): JSX.Element;`
- **API route:** `POST /api/cost` — body `{ materials: Material[] }` → `{ estimate: CostEstimate }`. (Server route exists so a future Tavily key upgrades estimates without client changes.)
- **Integration seam:** `<CostEstimator materials={plan.materials} />` on the Materials tab.

---

### 5. Print / export plan to printable page + PDF

A dedicated print-optimized route (`@media print` styles) plus a client button that triggers `window.print()` (works as "Save as PDF" in Electron/Chrome). No server PDF lib needed.

- **New files:**
  - `src/app/plan/[id]/print/page.tsx`
  - `src/components/PrintButton.tsx`
  - `src/lib/planToPrintable.ts`
- **Signatures:**
  - `export function planToPrintable(plan: BuildPlan): { title: string; sections: { heading: string; lines: string[] }[] };`
  - `export function PrintButton({ planId }: { planId: number }): JSX.Element;` (links to `/plan/{id}/print`)
  - Default export server component for the print page that fetches via `getPlan(id)`.
- **API route:** none (reuses `getPlan` server-side).
- **Integration seam:** `<PrintButton planId={plan.id!} />` in the plan header.

---

### 6. Shareable plan link + export bundle

Read-only share view keyed by a short slug, plus JSON export/copy. Slug derives deterministically from plan id (base36 + title hash) so no schema migration is required.

- **New files:**
  - `src/lib/shareSlug.ts`
  - `src/app/share/[slug]/page.tsx`
  - `src/app/api/share/[slug]/route.ts`
  - `src/components/ShareButton.tsx`
- **Signatures:**
  - `export function encodeSlug(planId: number, title: string): string;`
  - `export function decodeSlug(slug: string): { planId: number } | null;`
  - `export function ShareButton({ planId, title }: { planId: number; title: string }): JSX.Element;`
- **API route:** `GET /api/share/[slug]` → `{ plan: BuildPlan }` or `404 { error }`. Read-only.
- **Integration seam:** `<ShareButton planId={plan.id!} title={plan.title} />` in the plan header.

---

### 7. 2D exploded-parts SVG scheme generator

Deterministically lays out a step's parts as a labeled exploded diagram in inline SVG (fills the current 3D-scheme placeholder for zero cost). Layout is a stable function of part names + index.

- **New files:**
  - `src/lib/explodedScheme.ts`
  - `src/components/ExplodedSchemeSvg.tsx`
- **Signatures:**
  - `export type SchemeNode = { id: string; label: string; x: number; y: number; w: number; h: number; shape: "panel" | "dowel" | "screw" | "bracket" | "generic" };`
  - `export type SchemeLayout = { width: number; height: number; nodes: SchemeNode[]; connectors: { from: string; to: string }[] };`
  - `export function buildScheme(step: BuildStep): SchemeLayout;`
  - `export function ExplodedSchemeSvg({ step, className }: { step: BuildStep; className?: string }): JSX.Element;`
- **API route:** none.
- **Integration seam:** `<ExplodedSchemeSvg step={step} />` inside `StepCard`'s scheme placeholder slot.

---

### 8. Report broken / missing part — spare-part request composer

Form that composes an IKEA replacement-parts request (structured message + `mailto:`/copyable text) from a selected part. Fully offline; hook noted for future auto-submit.

- **New files:**
  - `src/lib/spareRequest.ts`
  - `src/components/SparePartForm.tsx`
  - `src/app/api/spare-request/route.ts`
- **Signatures:**
  - `export type SpareRequestInput = { planTitle: string; partName: string; quantity: number; issue: "broken" | "missing" | "wrong"; contactEmail?: string; notes?: string };`
  - `export type SpareRequestDraft = { subject: string; body: string; mailtoUrl: string; ikeaSparePartsUrl: string };`
  - `export function composeSpareRequest(input: SpareRequestInput): SpareRequestDraft;`
  - `export function SparePartForm({ plan }: { plan: BuildPlan }): JSX.Element;`
- **API route:** `POST /api/spare-request` — body `SpareRequestInput` → `{ draft: SpareRequestDraft }`. (Server-side so it can later fan out to a real submission provider.)
- **Integration seam:** `<SparePartForm plan={plan} />` on a "Spare parts" tab/section.

---

### 9. Review-difficulty highlighter from pasted reviews

Paste customer reviews; deterministic keyword/sentiment scan surfaces the trickiest phrases and maps them to likely steps. Escalation hook to Gliner/OpenAI for nuanced extraction.

- **New files:**
  - `src/lib/reviewMiner.ts`
  - `src/components/ReviewHighlighter.tsx`
  - `src/app/api/reviews/analyze/route.ts`
- **Signatures:**
  - `export type ReviewInsight = { phrase: string; severity: "info" | "warn" | "hard"; relatedStep?: number; count: number };`
  - `export type ReviewAnalysis = { insights: ReviewInsight[]; painPoints: string[]; positives: string[]; sampled: number };`
  - `export function analyzeReviews(text: string, plan?: BuildPlan): ReviewAnalysis;`
  - `export function ReviewHighlighter({ plan }: { plan?: BuildPlan }): JSX.Element;`
- **API route:** `POST /api/reviews/analyze` — body `{ text: string; planId?: number }` → `{ analysis: ReviewAnalysis }`.
- **Integration seam:** `<ReviewHighlighter plan={plan} />` on a "Reviews" tab.

---

### 10. Dark mode toggle

Class-based dark theme (`.dark` on `<html>`), persisted to `localStorage`, respecting `prefers-color-scheme`. Adds dark variants only via a self-contained provider/toggle; existing CSS vars gain dark values in a **new** stylesheet imported once.

- **New files:**
  - `src/components/ThemeToggle.tsx`
  - `src/lib/theme.ts`
  - `src/styles/theme-dark.css`
- **Signatures:**
  - `export type Theme = "light" | "dark" | "system";`
  - `export function getInitialTheme(): Theme;`
  - `export function applyTheme(theme: Theme): void;`
  - `export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; resolved: "light" | "dark" };`
  - `export function ThemeToggle(): JSX.Element;`
- **API route:** none.
- **Integration seam:** `<ThemeToggle />` in the app header; `import "@/styles/theme-dark.css"` once in the root layout.

---

### 11. Plan search & filter (library view)

A `/plans` library page with client-side search over title/source and filters by `origin`/`sourceType`, backed by the existing list endpoint.

- **New files:**
  - `src/app/plans/page.tsx`
  - `src/components/PlanSearch.tsx`
  - `src/lib/planFilter.ts`
- **Signatures:**
  - `export type PlanFilter = { query: string; origin?: PlanOrigin | "all"; sourceType?: PlanSourceType | "all" };`
  - `export function filterPlans(plans: PlanSummary[], filter: PlanFilter): PlanSummary[];`
  - `export function PlanSearch({ plans }: { plans: PlanSummary[] }): JSX.Element;`
- **API route:** none new — consumes existing `GET /api/plans` → `{ plans: PlanSummary[] }`.
- **Integration seam:** standalone route; add a nav link to `/plans`.

---

### 12. Keyboard shortcuts + command palette

Global shortcut layer (e.g. `g h` home, `g l` library, `/` focus search, `?` help) with a `⌘K`/`Ctrl+K` command palette. Self-contained provider mounted once.

- **New files:**
  - `src/components/CommandPalette.tsx`
  - `src/components/ShortcutsProvider.tsx`
  - `src/lib/shortcuts.ts`
- **Signatures:**
  - `export type Command = { id: string; label: string; keys?: string[]; run: () => void };`
  - `export function registerCommand(cmd: Command): () => void;` (returns unregister)
  - `export function useShortcuts(commands: Command[]): void;`
  - `export function ShortcutsProvider({ children }: { children: React.ReactNode }): JSX.Element;`
  - `export function CommandPalette(): JSX.Element;`
- **API route:** none.
- **Integration seam:** wrap the root layout body in `<ShortcutsProvider>` and mount `<CommandPalette />` once.

---

### 13. Per-step tutorial-video hook (Veed) with graceful fallback

Turns the video placeholder into a real embed slot: deterministic YouTube search-link fallback now, Veed-generated clip when a key exists. No key required.

- **New files:**
  - `src/lib/videoProvider.ts`
  - `src/components/StepVideo.tsx`
  - `src/app/api/video/route.ts`
- **Signatures:**
  - `export type StepVideo = { status: "placeholder" | "search" | "generated"; title: string; embedUrl?: string; searchUrl: string; provider: "none" | "veed" };`
  - `export function resolveStepVideo(planTitle: string, step: BuildStep): StepVideo;`
  - `export function veedConfigured(): boolean;`
  - `export function StepVideo({ planTitle, step }: { planTitle: string; step: BuildStep }): JSX.Element;`
- **API route:** `POST /api/video` — body `{ planTitle: string; step: BuildStep }` → `{ video: StepVideo }`. Falls back to a deterministic search URL when `VEED_API_KEY` is unset.
- **Integration seam:** `<StepVideo planTitle={plan.title} step={step} />` inside `StepCard`'s video placeholder slot. Mirrors the existing `tavilyConfigured()`/`retailerLinks()` pattern in `src/lib/retailers.ts`.

---

### 14. Plan notes & annotations

Free-form per-plan notes (and optional per-step notes) saved to `localStorage`, with export alongside feature 6's bundle. Fully offline.

- **New files:**
  - `src/components/PlanNotes.tsx`
  - `src/lib/notes.ts`
- **Signatures:**
  - `export type PlanNotes = { planNote: string; stepNotes: Record<number, string>; updatedAt: string };`
  - `export function readNotes(planId: number): PlanNotes;`
  - `export function writeNotes(planId: number, notes: PlanNotes): void;`
  - `export function PlanNotes({ planId, steps }: { planId: number; steps: BuildStep[] }): JSX.Element;`
- **API route:** none.
- **Integration seam:** `<PlanNotes planId={plan.id!} steps={plan.steps} />` in the plan sidebar.

---

### 15. Materials CSV/shopping-list export

One-click export of "to purchase" materials as CSV and a copyable shopping list, deep-linking to each retailer URL from `retailerLinks()`.

- **New files:**
  - `src/lib/shoppingList.ts`
  - `src/components/ShoppingListExport.tsx`
- **Signatures:**
  - `export type ShoppingRow = { name: string; quantity: number; badge: MaterialBadge; ikeaUrl: string; amazonUrl: string };`
  - `export function buildShoppingList(materials: Material[]): ShoppingRow[];`
  - `export function toCsv(rows: ShoppingRow[]): string;`
  - `export function ShoppingListExport({ materials }: { materials: Material[] }): JSX.Element;`
- **API route:** none.
- **Integration seam:** `<ShoppingListExport materials={plan.materials} />` on the Materials tab.

---

## Later (aspirational) — *research-heavy*

Big bets that need dedicated spikes (3D pipelines, physics engines, native/AR integration) before they're backlog-ready. Track as research tasks, not parallel build tickets:

- **3D assembly preview (Blender/Fusion-like):** interactive per-step exploded 3D model with playback of the assembly sequence; needs a 3D asset pipeline (glTF), a WebGL renderer (`three.js`/R3F), and either a parametric part generator or a model library keyed to parsed parts.
- **Electronics / GPIO wiring + schematic capture (KiCad-like):** for DIY/maker builds, a node-graph wiring editor with netlist validation and part-pin libraries.
- **Physics / aerodynamics / structural simulation:** load-bearing, stability/tip-over, and (for maker projects) aerodynamic/thermal sims; requires a solver (WASM FEM/CFD) and meshing from the 3D model.
- **AR room preview:** place the finished build in the user's room via WebXR / native ARKit-ARCore bridge through the Electron shell; needs device camera access and occlusion handling.
- **Review mining at scale:** move feature 9 from pasted text to automated scraping/aggregation across retailers and forums (Tavily + Gliner/OpenAI), with clustering of pain points to steps.
- **Auto spare-part requests:** move feature 8 from a composed draft to authenticated, automated submission to IKEA/retailer spare-parts APIs, with order tracking.
- **Live partner-model integration:** replace the deterministic Gliner→OpenAI escalation stub in `src/lib/chat.ts` and the Veed/Tavily hooks with real, streamed, key-gated calls, including cost/rate governance and caching.
- **OCR / vision guide ingestion:** parse dropped PDFs and photographed instruction sheets (currently noted-only) into structured steps via a vision model.
