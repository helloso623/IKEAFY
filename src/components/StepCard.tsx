import type { BuildStep } from "@/lib/types";

export function StepCard({ step }: { step: BuildStep }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: "var(--ikeafy-blue)" }}
        >
          {step.number}
        </span>
        <h3 className="font-bold text-neutral-900">{step.title}</h3>
      </div>

      <p className="mt-3 text-sm text-neutral-700">{step.action}</p>

      {step.parts.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500">Parts</span>
          {step.parts.map((part) => (
            <span
              key={part}
              className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
            >
              {part}
            </span>
          ))}
        </div>
      ) : null}

      {step.tools.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500">Tools</span>
          {step.tools.map((tool) => (
            <span
              key={tool}
              className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
            >
              {tool}
            </span>
          ))}
        </div>
      ) : null}

      {step.note ? (
        <p className="mt-2 text-xs italic text-amber-700">{step.note}</p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 text-center">
            <span className="text-2xl text-neutral-400" aria-hidden="true">
              ▶
            </span>
            <span className="text-xs text-neutral-500">Step tutorial video</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled
              title="Requires VEED_API_KEY"
              className="cursor-not-allowed rounded-md bg-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-500"
            >
              Generate video (Veed)
            </button>
            <a
              href="https://www.ikea.com/us/en/customer-service/product-support/"
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-900"
            >
              See actual guide
            </a>
          </div>
        </div>

        <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 text-center">
          <span className="text-2xl text-neutral-400" aria-hidden="true">
            🧊
          </span>
          <span className="text-xs text-neutral-500">
            Interactive 3D step scheme (planned)
          </span>
        </div>
      </div>
    </div>
  );
}
