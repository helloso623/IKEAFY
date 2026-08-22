"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import type { BuildPlan } from "@/lib/types";
import { Tabs } from "@/components/Tabs";
import { StepCard } from "@/components/StepCard";
import { MaterialItem } from "@/components/MaterialItem";
import { ChatPanel } from "@/components/ChatPanel";

type TabId = "steps" | "materials" | "help";

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; plan: BuildPlan };

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();

  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [activeTab, setActiveTab] = useState<TabId>("steps");

  useEffect(() => {
    let active = true;

    async function loadPlan() {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/plans/${id}`);
        if (!res.ok) {
          if (!active) return;
          setState({
            status: "error",
            message: res.status === 404 ? "Plan not found" : "Couldn't load this plan.",
          });
          return;
        }
        const data: { plan?: BuildPlan } = await res.json();
        if (!active) return;
        if (!data.plan) {
          setState({ status: "error", message: "Plan not found" });
          return;
        }
        setState({ status: "loaded", plan: data.plan });
      } catch {
        if (active) {
          setState({ status: "error", message: "Couldn't load this plan." });
        }
      }
    }

    if (id) {
      void loadPlan();
    }

    return () => {
      active = false;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200"
          style={{ borderTopColor: "var(--ikeafy-blue)" }}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-neutral-600">
          Loading your build plan…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900">{state.message}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          We couldn&apos;t find the plan you were looking for.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          ← New plan
        </Link>
      </div>
    );
  }

  const { plan } = state;

  const includedMaterials = plan.materials.filter((m) => m.badge === "included");
  const purchaseMaterials = plan.materials.filter((m) => m.badge === "purchase");

  const tabs = [
    { id: "steps", label: "Instructions", badge: plan.steps.length },
    { id: "materials", label: "Materials", badge: plan.materials.length },
    { id: "help", label: "Reviews & spares" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800"
        >
          ← New plan
        </Link>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          {plan.title}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 font-medium capitalize text-neutral-600">
            {plan.sourceType}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide text-black"
            style={{ background: "var(--ikeafy-yellow)" }}
          >
            {plan.origin}
          </span>
        </div>

        {plan.origin === "generated" ? (
          <div
            className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
            role="alert"
          >
            <p className="font-semibold">Heads up — this plan was AI-generated</p>
            <p className="mt-1 text-amber-800">
              This plan was AI-generated from the product name and may not match
              the real product. Measurements and steps could be fictional; verify
              against the official instructions before building.
            </p>
          </div>
        ) : null}

        {plan.instructions ? (
          <p className="mt-4 text-sm text-neutral-500">
            <span className="font-semibold text-neutral-600">Your instructions:</span>{" "}
            {plan.instructions}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Tabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

          <div className="mt-6">
            {activeTab === "steps" ? (
              <div className="space-y-4">
                {plan.steps.map((step) => (
                  <StepCard key={step.number} step={step} />
                ))}
              </div>
            ) : null}

            {activeTab === "materials" ? (
              <div className="space-y-8">
                <section>
                  <h2 className="mb-3 text-lg font-bold text-neutral-900">
                    Tools you&apos;ll need
                  </h2>
                  {plan.tools.length ? (
                    <div className="flex flex-wrap gap-2">
                      {plan.tools.map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm font-medium text-neutral-700 shadow-sm"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">No special tools listed</p>
                  )}
                </section>

                {includedMaterials.length ? (
                  <section>
                    <h2 className="mb-3 text-lg font-bold text-neutral-900">Included</h2>
                    <div className="space-y-2">
                      {includedMaterials.map((material) => (
                        <MaterialItem key={material.name} material={material} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {purchaseMaterials.length ? (
                  <section>
                    <h2 className="mb-3 text-lg font-bold text-neutral-900">To buy</h2>
                    <div className="space-y-2">
                      {purchaseMaterials.map((material) => (
                        <MaterialItem key={material.name} material={material} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            {activeTab === "help" ? (
              <div className="space-y-8">
                <section>
                  <h2 className="mb-3 text-lg font-bold text-neutral-900">
                    Common difficulties
                  </h2>
                  {plan.difficulties.length ? (
                    <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
                      {plan.difficulties.map((difficulty, index) => (
                        <li key={index}>{difficulty}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No common difficulties noted for this build.
                    </p>
                  )}
                </section>

                <section>
                  <h2 className="mb-3 text-lg font-bold text-neutral-900">Spare parts</h2>
                  <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <p className="text-sm text-neutral-700">{plan.sparePartsHint}</p>
                    <p className="mt-3 text-sm text-neutral-500">
                      Tip: attach a photo of the broken part to identify the part
                      number. (Review mining &amp; auto spare-part requests are
                      coming soon.)
                    </p>
                  </div>
                </section>

                <p className="text-xs italic text-neutral-400">
                  Review scraping is a planned integration (Tavily).
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <ChatPanel planId={Number(id)} />
        </aside>
      </div>
    </div>
  );
}
