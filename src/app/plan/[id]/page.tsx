"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { BuildPlan } from "@/lib/types";
import { Tabs } from "@/components/Tabs";
import { StepCard } from "@/components/StepCard";
import { MaterialItem } from "@/components/MaterialItem";
import { Badge } from "@/components/Badge";
import { ChatPanel } from "@/components/ChatPanel";

type Status =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; plan: BuildPlan };

type TabId = "steps" | "materials" | "help";

export default function PlanPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [active, setActive] = useState<TabId>("steps");

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setStatus({ kind: "not-found" });
      return;
    }

    let cancelled = false;
    setStatus({ kind: "loading" });

    async function load() {
      try {
        const res = await fetch(`/api/plans/${id}`);
        if (res.status === 404) {
          if (!cancelled) setStatus({ kind: "not-found" });
          return;
        }
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const data: { plan: BuildPlan } = await res.json();
        if (!cancelled) setStatus({ kind: "ready", plan: data.plan });
      } catch (err) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: err instanceof Error ? err.message : "Could not load this plan.",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status.kind === "loading") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200"
          style={{ borderTopColor: "var(--ikeafy-blue)" }}
        />
        <p className="text-sm font-medium text-neutral-500">Loading your build plan…</p>
      </div>
    );
  }

  if (status.kind === "not-found") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mb-4 text-5xl">🔍</div>
        <h1 className="mb-2 text-2xl font-bold">Plan not found</h1>
        <p className="mb-6 text-sm text-neutral-600">
          We couldn&apos;t find a build plan with that id. It may have been removed.
        </p>
        <Link
          href="/"
          className="inline-block rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          ← New plan
        </Link>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mb-4 text-5xl">⚠️</div>
        <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
        <p className="mb-6 text-sm text-neutral-600">{status.message}</p>
        <Link
          href="/"
          className="inline-block rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          ← New plan
        </Link>
      </div>
    );
  }

  const { plan } = status;
  const included = plan.materials.filter((m) => m.badge === "included");
  const toBuy = plan.materials.filter((m) => m.badge === "purchase");

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center text-sm font-semibold hover:underline"
        style={{ color: "var(--ikeafy-blue)" }}
      >
        ← New plan
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">
            {plan.origin}
          </span>
          <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">
            {plan.sourceType}
          </span>
        </div>
        <h1 className="text-3xl font-black leading-tight">{plan.title}</h1>

        {plan.origin === "generated" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <span className="font-bold">Heads up:</span> this plan was AI-generated
            from a name. Part counts and the final render may be fictional — verify
            against the official instructions.
          </div>
        )}

        {plan.instructions && (
          <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-800">Your instructions: </span>
            {plan.instructions}
          </div>
        )}
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        <section className="space-y-5">
          <Tabs
            tabs={[
              { id: "steps", label: "Instructions", badge: plan.steps.length },
              { id: "materials", label: "Materials", badge: plan.materials.length },
              { id: "help", label: "Reviews & Spare parts" },
            ]}
            active={active}
            onChange={(next) => setActive(next as TabId)}
          />

          {active === "steps" && (
            <div className="space-y-4">
              {plan.steps.length === 0 ? (
                <p className="text-sm text-neutral-500">No steps in this plan yet.</p>
              ) : (
                plan.steps.map((step) => <StepCard key={step.number} step={step} />)
              )}
            </div>
          )}

          {active === "materials" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Included in box</h2>
                  <Badge kind="included" />
                </div>
                {included.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nothing listed as included.</p>
                ) : (
                  <ul className="space-y-3">
                    {included.map((material) => (
                      <li key={material.name}>
                        <MaterialItem material={material} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {toBuy.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">You&apos;ll need to buy</h2>
                    <Badge kind="purchase" />
                  </div>
                  <ul className="space-y-3">
                    {toBuy.map((material) => (
                      <li key={material.name}>
                        <MaterialItem material={material} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg font-bold">Tools required</h2>
                {plan.tools.length === 0 ? (
                  <p className="text-sm text-neutral-500">No tools needed.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {plan.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm font-medium text-neutral-700"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {active === "help" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <h2 className="mb-2 text-lg font-bold">Possible difficulties</h2>
                {plan.difficulties.length === 0 ? (
                  <p className="text-sm text-neutral-500">No difficulties flagged.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                    {plan.difficulties.map((difficulty) => (
                      <li key={difficulty}>{difficulty}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-neutral-500">
                  Difficulty tips are heuristic; live review-mining (customer reviews)
                  is a planned integration.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <h2 className="mb-2 text-lg font-bold">Spare parts</h2>
                <p className="text-sm text-neutral-700">{plan.sparePartsHint}</p>
                <p className="mt-3 text-xs text-neutral-500">
                  Tip: you&apos;ll be able to attach a damage photo to any step to help
                  identify the right spare part (coming soon).
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit">
          <ChatPanel planId={id} />
        </aside>
      </div>
    </div>
  );
}
