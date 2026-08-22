"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Mode = "guide" | "product";
type Phase = "idle" | "parsing" | "generating";

type PlanSummary = {
  id: number;
  title: string;
  sourceType: "guide" | "product";
  origin: "sample" | "parsed" | "generated";
  stepCount: number;
  createdAt: string;
};

type PlansResponse = {
  plans?: PlanSummary[];
};

type ParseResponse = {
  plan?: { id: number };
  error?: string;
};

type ParseBody = {
  sourceType: Mode;
  text?: string;
  productName?: string;
  instructions?: string;
  title?: string;
};

const PRODUCT_SUGGESTIONS = [
  "BILLY Bookcase",
  "LACK Side Table",
  "KALLAX Shelf Unit",
  "POÄNG Armchair",
] as const;

const GUIDE_PLACEHOLDER = `Paste your build guide, e.g.

1. Attach the two side panels to the top panel using 4 wooden dowels.
2. Insert the cam locks and turn each a half turn to lock the frame.
3. Slide the back panel into the rear groove and secure with nails.
4. Fit the shelves onto the shelf pins at your preferred heights.`;

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  parsing: "Parsing guide…",
  generating: "Generating steps, materials & video slots…",
};

const TEXT_LIKE_TYPES = [
  "text/plain",
  "text/markdown",
  "text/",
] as const;

function isTextLike(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".text")) {
    return true;
  }
  return TEXT_LIKE_TYPES.some((type) => file.type.startsWith(type));
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HomePage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("guide");
  const [guideText, setGuideText] = useState("");
  const [title, setTitle] = useState("");
  const [productName, setProductName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [recentPlans, setRecentPlans] = useState<PlanSummary[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loading = phase !== "idle";

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      try {
        const res = await fetch("/api/plans");
        if (!res.ok) return;
        const data: PlansResponse = await res.json();
        if (active) setRecentPlans(data.plans ?? []);
      } catch {
        if (active) setRecentPlans([]);
      } finally {
        if (active) setPlansLoaded(true);
      }
    }
    void loadPlans();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (phaseTimer.current) clearTimeout(phaseTimer.current);
    };
  }, []);

  function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    if (isTextLike(file)) {
      const reader = new FileReader();
      reader.onload = () => {
        setGuideText(typeof reader.result === "string" ? reader.result : "");
      };
      reader.readAsText(file);
    } else {
      setGuideText(`[Attached ${file.name} — paste the steps here]`);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const relevantInput = mode === "guide" ? guideText.trim() : productName.trim();
  const canSubmit = relevantInput.length > 0 && !loading;

  async function generate() {
    if (!canSubmit) return;

    setError(null);
    setPhase("parsing");

    phaseTimer.current = setTimeout(() => {
      setPhase("generating");
    }, 700);

    const trimmedInstructions = instructions.trim();
    const body: ParseBody =
      mode === "guide"
        ? {
            sourceType: "guide",
            text: guideText,
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(trimmedInstructions ? { instructions: trimmedInstructions } : {}),
          }
        : {
            sourceType: "product",
            productName: productName.trim(),
            ...(trimmedInstructions ? { instructions: trimmedInstructions } : {}),
          };

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: ParseResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.plan) {
        throw new Error(data.error ?? "Could not generate a build plan.");
      }

      router.push(`/plan/${data.plan.id}`);
    } catch (err) {
      if (phaseTimer.current) clearTimeout(phaseTimer.current);
      setError(
        err instanceof Error ? err.message : "Could not generate a build plan.",
      );
      setPhase("idle");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 text-center">
        <span
          className="inline-block rounded-xl px-3 py-1 text-sm font-black tracking-widest"
          style={{
            background: "var(--ikeafy-yellow)",
            color: "var(--ikeafy-blue)",
          }}
        >
          IKEAFY
        </span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-neutral-900 sm:text-5xl">
          Turn any build guide into a guided plan
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-neutral-600">
          Paste a set of assembly instructions or name an IKEA product and get a
          clear step-by-step plan with per-step video slots, a materials list,
          and a build-time chat helper.
        </p>
      </header>

      <div className="mb-6 flex justify-center">
        <div
          className="inline-flex rounded-full border border-neutral-200 bg-white p-1 shadow-sm"
          role="tablist"
          aria-label="Input mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "guide"}
            onClick={() => setMode("guide")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "guide"
                ? "text-white"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
            style={
              mode === "guide" ? { background: "var(--ikeafy-blue)" } : undefined
            }
            data-testid="mode-guide"
          >
            Paste a guide
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "product"}
            onClick={() => setMode("product")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "product"
                ? "text-white"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
            style={
              mode === "product"
                ? { background: "var(--ikeafy-blue)" }
                : undefined
            }
            data-testid="mode-product"
          >
            Search an IKEA product
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {mode === "guide" ? (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                isDragging
                  ? "border-[color:var(--ikeafy-blue)] bg-blue-50"
                  : "border-neutral-300 bg-neutral-50 hover:border-neutral-400"
              }`}
              data-testid="drop-zone"
            >
              <span className="text-3xl" aria-hidden>
                📄
              </span>
              <p className="mt-2 text-sm font-semibold text-neutral-700">
                Drop a guide file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                .txt and .md files are read straight into the guide box below.
              </p>
              {fileName && (
                <p
                  className="mt-2 text-xs font-medium text-neutral-600"
                  data-testid="file-name"
                >
                  {fileName}
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.text,text/plain,text/markdown"
                className="hidden"
                onChange={onFileSelected}
                data-testid="file-input"
              />
            </div>

            <div>
              <label
                htmlFor="build-title"
                className="mb-1 block text-xs font-semibold text-neutral-600"
              >
                Build title{" "}
                <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <input
                id="build-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bedroom wardrobe build"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                data-testid="build-title"
              />
            </div>

            <div>
              <label
                htmlFor="guide-text"
                className="mb-1 block text-xs font-semibold text-neutral-600"
              >
                Guide text
              </label>
              <textarea
                id="guide-text"
                value={guideText}
                onChange={(e) => setGuideText(e.target.value)}
                rows={10}
                placeholder={GUIDE_PLACEHOLDER}
                className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                data-testid="guide-text"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="product-name"
                className="mb-1 block text-xs font-semibold text-neutral-600"
              >
                IKEA product
              </label>
              <input
                id="product-name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. BILLY Bookcase"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                data-testid="product-name"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-600">
                Try a popular product
              </p>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_SUGGESTIONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setProductName(name)}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-[color:var(--ikeafy-blue)] hover:text-neutral-900"
                    data-testid={`chip-${name}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={() => setInstructionsOpen((open) => !open)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-neutral-600"
            aria-expanded={instructionsOpen}
            data-testid="instructions-toggle"
          >
            <span>Additional instructions (optional)</span>
            <span
              className={`transition-transform ${
                instructionsOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              ▾
            </span>
          </button>
          {instructionsOpen && (
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Tools I have, skill level, constraints"
              className="mt-2 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              data-testid="instructions"
            />
          )}
        </div>

        {error && (
          <p
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            data-testid="error"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!canSubmit}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--ikeafy-blue)" }}
            data-testid="generate"
          >
            {loading ? "Working…" : "Generate plan"}
          </button>

          {loading && (
            <span
              className="flex items-center gap-2 text-sm text-neutral-600"
              data-testid="progress"
              aria-live="polite"
            >
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300"
                style={{ borderTopColor: "var(--ikeafy-blue)" }}
                aria-hidden
              />
              {phase !== "idle" ? PHASE_LABEL[phase] : ""}
            </span>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-neutral-900">Recent plans</h2>
        {recentPlans.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentPlans.map((plan) => (
              <Link
                key={plan.id}
                href={`/plan/${plan.id}`}
                className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                data-testid={`recent-${plan.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-neutral-900">
                    {plan.title}
                  </h3>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--ikeafy-yellow)",
                      color: "var(--ikeafy-blue)",
                    }}
                  >
                    {plan.origin}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {plan.stepCount} {plan.stepCount === 1 ? "step" : "steps"} ·{" "}
                  {plan.origin} · {plan.sourceType}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {formatRelativeDate(plan.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white/60 p-6 text-center">
            <p className="text-sm font-medium text-neutral-600">
              {plansLoaded ? "No plans yet" : "Loading recent plans…"}
            </p>
            {plansLoaded && (
              <p className="mt-1 text-xs text-neutral-500">
                Paste a guide or search a product above to build your first plan.
              </p>
            )}
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-neutral-200 pt-6 text-center text-xs text-neutral-400">
        <p>
          Partner integrations (planned / mock, stubbed with hooks): Video: Veed
          · Parsing/chat: Pioneer Gliner 2 · Web search for parts: Tavily
        </p>
      </footer>
    </div>
  );
}
