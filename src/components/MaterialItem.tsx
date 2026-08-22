import type { Material } from "@/lib/types";
import { Badge } from "./Badge";

export function MaterialItem({ material }: { material: Material }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex shrink-0 items-center rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-sm font-bold text-neutral-700">
          ×{material.quantity}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-neutral-900">{material.name}</p>
          {material.note ? (
            <p className="mt-0.5 text-xs text-neutral-500">{material.note}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge kind={material.badge} />
        {material.badge === "purchase"
          ? material.retailers.map((retailer) => (
              <a
                key={retailer.url}
                href={retailer.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-900"
              >
                {retailer.name}
              </a>
            ))
          : null}
      </div>
    </div>
  );
}
