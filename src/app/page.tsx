"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SAMPLE_PRODUCTS } from "@/lib/samplePlans";
import type { PlanSummary } from "@/lib/types";

type Mode = "guide" | "product";
type Phase = "idle" | "parsing" | "generating";

const GUIDE_PLACEHOLDER = `Paste your assembly guide, e.g.

1. Attach the two side panels to the top panel using 4 wooden dowels.
2. Insert the cam locks and turn each a half turn to lock the frame.
3. Slide the back panel into the rear groove and secure with nails.
4. Fit the shelves onto the shelf pins at your preferred heights.`;

function isTextLike(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    file.type.startsWith("text/")
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  parsing: "Parsing your guide…",
  generating: "Generating build plan…",
};

export default function HomePage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("guide");
  const [guideText, setGuideText] = useState("");
  const [title, setTitle] = useState("");
  const [productName, setProductName] = useState("");
  const [instructions, setInstructions] = useState("");

  const [fileNote, setFileNote] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [recentPlans, setRecentPlans] = useState<PlanSummary[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loading = phase !== "idle";

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      try {
        const res = await fetch("/api/plans");
        if (!res.ok) return;
        const data: { plans?: PlanSummary[] } = await res.json();
        if (active) setRecentPlans(data.plans ?? []);
      } catch {
        // ignore — recent plans are non-critical
      } finally {
        if (active) setPlansLoaded(true);
      }
    }
    loadPlans();
    return () => {
      active = false;
    };
  }, []);

  function handleFile(file: File) {
    setError(null);
    if (isTextLike(file)) {
      const reader = new FileReader();
      reader.onload = () => {
        setGuideText(typeof reader.result === "string" ? reader.result : "");
      };
      reader.readAsText(file);
      setFileNote(`Loaded “${file.name}”`);
    } else {
      setFileNote(
        `${file.name} — binary files aren't parsed yet — paste the text or use product search`,
      );
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

  async function generate(overrideProduct?: string) {
    const effectiveProduct = (overrideProduct ?? productName).trim();
    const required = mode === "guide" ? guideText.trim() : effectiveProduct;
    if (required.length === 0 || loading) return;

    setError(null);
    setPhase("parsing");

    const body =
      mode === "guide"
        ? { sourceType: "guide", text: guideText, instructions, title }
        : {
            sourceType: "product",
            productName: effectiveProduct,
            instructions,
          };

    try {
      // Brief "parsing" beat so the phase is visible before the request.
      await new Promise((resolve) => setTimeout(resolve, 350));
      setPhase("generating");

      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: { plan?: { id: number }; error?: string } = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || !data.plan) {
        throw new Error(data.error ?? "Could not generate a build plan.");
      }

      router.push(`/plan/${data.plan.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not generate a build plan.",
      );
      setPhase("idle");
    }
  }

  function selectSuggestion(name: string) {
    setProductName(name);
    void generate(name);
  }

  return (
    <div className="mx-auto max-w-3xl px-1">
      <section className="mb-8 text-center">
        <h1 className="flex items-center justify-center gap-3 text-5xl font-black tracking-tight sm:text-6xl">
          <span
            className="rounded-xl px-4 py-1.5"
            style={{
              background: "var(--ikeafy-yellow)",
              color: "var(--ikeafy-blue)",
            }}
          >
            IKEAFY
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-neutral-600">
          Turn any flat-pack guide into a clear, step-by-step build plan.
        </p>
      </section>

      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
          <button
            type="button"
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
                .txt and .md files are read directly into the guide box below.
              </p>
              {fileNote && (
                <p
                  className="mt-2 text-xs font-medium text-neutral-600"
                  data-testid="file-note"
                >
                  {fileNote}
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onFileSelected}
                data-testid="file-input"
              />
            </div>

            <div>
              <label
                htmlFor="title"
                className="mb-1 block text-xs font-semibold text-neutral-600"
              >
                Title{" "}
                <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bedroom wardrobe build"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                data-testid="title"
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
                rows={9}
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
                Product name
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
                {SAMPLE_PRODUCTS.map((product) => (
                  <button
                    key={product.name}
                    type="button"
                    disabled={loading}
                    onClick={() => selectSuggestion(product.name)}
                    title={product.blurb}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-[color:var(--ikeafy-blue)] hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`chip-${product.name}`}
                  >
                    {product.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label
            htmlFor="instructions"
            className="mb-1 block text-xs font-semibold text-neutral-600"
          >
            Additional instructions / tools you have{" "}
            <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="e.g. I only have a manual screwdriver and an Allen key."
            className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            data-testid="instructions"
          />
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

        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => generate()}
            disabled={!canSubmit}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--ikeafy-blue)" }}
            data-testid="generate"
          >
            {loading ? "Working…" : "Generate build plan"}
          </button>

          {loading && (
            <span
              className="flex items-center gap-2 text-sm text-neutral-600"
              data-testid="progress"
            >
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300"
                style={{ borderTopColor: "var(--ikeafy-blue)" }}
                aria-hidden
              />
              {PHASE_LABEL[phase as Exclude<Phase, "idle">]}
            </span>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">Recent plans</h2>
        {recentPlans.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentPlans.map((plan) => (
              <a
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
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black"
                    style={{ background: "var(--ikeafy-yellow)" }}
                  >
                    {plan.origin}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {plan.sourceType === "product" ? "Product" : "Guide"} ·{" "}
                  {plan.stepCount} {plan.stepCount === 1 ? "step" : "steps"} ·{" "}
                  {formatDate(plan.createdAt)}
                </p>
              </a>
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
    </div>
  );
}
