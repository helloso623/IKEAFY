import type { BuildStep } from "@/lib/types";

export function StepCard({ step }: { step: BuildStep }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: "var(--ikeafy-blue)" }}
          aria-hidden="true"
        >
          {step.number}
        </span>
        <h3 className="font-bold text-neutral-900">{step.title}</h3>
      </div>

      <p className="mt-3 text-sm text-neutral-700">{step.action}</p>

      {step.note ? (
        <p className="mt-2 text-xs italic text-neutral-500">{step.note}</p>
      ) : null}

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
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-500"
            >
              {tool}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-white"
            style={{ background: "var(--ikeafy-blue)" }}
            aria-hidden="true"
          >
            ▶
          </span>
          <p className="text-sm text-neutral-600">
            Tutorial video — generate with Veed
          </p>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md bg-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-500"
          >
            Generate video
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          <a
            href="https://www.ikea.com/us/en/customer-service/product-support/"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium"
            style={{ color: "var(--ikeafy-blue)" }}
          >
            See actual guide ↗
          </a>
        </div>
      </div>

      <div className="mt-3">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500">
          <span aria-hidden="true">🧊</span>
          3D scheme (coming soon)
        </span>
      </div>
    </div>
  );
}
