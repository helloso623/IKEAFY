"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/Badge";
import { ChatPanel } from "@/components/ChatPanel";
import { MaterialItem } from "@/components/MaterialItem";
import { StepCard } from "@/components/StepCard";
import { Tabs } from "@/components/Tabs";
import type { BuildPlan, PlanOrigin } from "@/lib/types";

type TabId = "instructions" | "materials" | "reviews";

type PlanResponse = { plan?: BuildPlan; error?: string };

const ORIGIN_META: Record<
  PlanOrigin,
  { label: string; className: string; style?: React.CSSProperties }
> = {
  sample: {
    label: "IKEA guide",
    className: "text-white",
    style: { background: "var(--ikeafy-blue)" },
  },
  parsed: {
    label: "Parsed guide",
    className: "bg-neutral-200 text-neutral-700",
  },
  generated: {
    label: "AI-generated (approximate)",
    className: "bg-amber-100 text-amber-800",
  },
};

function OriginBadge({ origin }: { origin: PlanOrigin }) {
  const meta = ORIGIN_META[origin];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}
      style={meta.style}
    >
      {meta.label}
    </span>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
      {children}
    </span>
  );
}

export default function PlanPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [plan, setPlan] = useState<BuildPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabId>("instructions");

  useEffect(() => {
    let cancelled = false;

    if (!Number.isFinite(id)) {
      setError("This plan link is invalid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(`/api/plans/${id}`);
        const data: PlanResponse = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok || !data.plan) {
          setError(data.error ?? "We couldn't find that build plan.");
          setPlan(null);
        } else {
          setPlan(data.plan);
        }
      } catch {
        if (!cancelled) {
          setError("Something went wrong loading this plan.");
          setPlan(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const materials = plan?.materials ?? [];
  const toBuy = useMemo(
    () => materials.filter((material) => material.badge === "purchase"),
    [materials],
  );
  const included = useMemo(
    () => materials.filter((material) => material.badge === "included"),
    [materials],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-neutral-500">
        <span
          className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-neutral-300"
          style={{ borderTopColor: "var(--ikeafy-blue)" }}
          aria-hidden
        />
        Loading build plan…
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl" aria-hidden>
          🔧
        </p>
        <h1 className="mt-3 text-lg font-bold text-neutral-900">
          Plan not available
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {error ?? "We couldn't find that build plan."}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          ← New build
        </Link>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "instructions", label: "Instructions", badge: plan.steps.length },
    { id: "materials", label: "Materials", badge: materials.length },
    { id: "reviews", label: "Reviews & spare parts" },
  ];

  return (
    <div>
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold transition-colors hover:underline"
          style={{ color: "var(--ikeafy-blue)" }}
        >
          ← New build
        </Link>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
          {plan.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OriginBadge origin={plan.origin} />
          <MetaChip>
            {plan.sourceType === "product" ? "Product" : "Guide"}
          </MetaChip>
          <MetaChip>
            {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}
          </MetaChip>
        </div>
      </header>

      {plan.origin === "generated" ? (
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          role="note"
        >
          <span className="text-base" aria-hidden>
            ⚠️
          </span>
          <p>
            <span className="font-semibold">Heuristically generated</span> —
            steps, quantities, and materials are approximate. Verify against the
            official instructions before buying or building.
          </p>
        </div>
      ) : null}

      {plan.instructions ? (
        <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Your instructions
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
            {plan.instructions}
          </p>
        </div>
      ) : null}

      <Tabs
        tabs={tabs}
        active={active}
        onChange={(next) => setActive(next as TabId)}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {active === "instructions" ? (
            <div className="space-y-4">
              {plan.steps.length ? (
                plan.steps.map((step) => (
                  <StepCard key={step.number} step={step} />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-neutral-300 bg-white/60 p-6 text-center text-sm text-neutral-500">
                  No steps were parsed for this build.
                </p>
              )}
            </div>
          ) : null}

          {active === "materials" ? (
            <div className="space-y-6">
              {toBuy.length ? (
                <section>
                  <h2 className="mb-3 text-sm font-bold text-neutral-900">
                    To purchase{" "}
                    <span className="font-medium text-neutral-500">
                      ({toBuy.length})
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {toBuy.map((material) => (
                      <MaterialItem key={material.name} material={material} />
                    ))}
                  </div>
                </section>
              ) : null}

              {included.length ? (
                <section>
                  <h2 className="mb-3 text-sm font-bold text-neutral-900">
                    Included in the box{" "}
                    <span className="font-medium text-neutral-500">
                      ({included.length})
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {included.map((material) => (
                      <MaterialItem key={material.name} material={material} />
                    ))}
                  </div>
                </section>
              ) : null}

              {!toBuy.length && !included.length ? (
                <p className="rounded-xl border border-dashed border-neutral-300 bg-white/60 p-6 text-center text-sm text-neutral-500">
                  No materials were listed for this build.
                </p>
              ) : null}

              {plan.tools.length ? (
                <section>
                  <h2 className="mb-3 text-sm font-bold text-neutral-900">
                    Tools needed
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {plan.tools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm"
                      >
                        <span aria-hidden>🛠️</span>
                        {tool}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {active === "reviews" ? (
            <div className="space-y-6">
              <section>
                <h2 className="mb-3 text-sm font-bold text-neutral-900">
                  Common difficulties
                </h2>
                {plan.difficulties.length ? (
                  <ul className="space-y-2">
                    {plan.difficulties.map((difficulty) => (
                      <li
                        key={difficulty}
                        className="flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700 shadow-sm"
                      >
                        <span className="text-base" aria-hidden>
                          ⚠️
                        </span>
                        <span>{difficulty}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-neutral-300 bg-white/60 p-4 text-sm text-neutral-500">
                    No common difficulties flagged for this build yet.
                  </p>
                )}
              </section>

              <section
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
                style={{ borderLeftColor: "var(--ikeafy-yellow)", borderLeftWidth: 4 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base" aria-hidden>
                    💡
                  </span>
                  <h2 className="text-sm font-bold text-neutral-900">
                    Spare parts
                  </h2>
                </div>
                <p className="mt-2 text-sm text-neutral-700">
                  {plan.sparePartsHint}
                </p>
                <p className="mt-3 text-xs text-neutral-500">
                  Photo-based part-number detection and automatic spare-part
                  requests are planned.
                </p>
              </section>

              <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
                Review mining (highlighting issues from customer reviews) is a
                planned integration via Tavily web search.
              </p>
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <ChatPanel planId={plan.id!} />
        </aside>
      </div>
    </div>
  );
}
