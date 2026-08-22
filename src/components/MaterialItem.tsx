import { Badge } from "@/components/Badge";
import type { Material } from "@/lib/types";

export function MaterialItem({ material }: { material: Material }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-900">
          <span className="font-semibold text-neutral-500">
            {material.quantity}×
          </span>{" "}
          <span className="font-bold">{material.name}</span>
        </p>
        <Badge kind={material.badge} />
      </div>

      {material.note ? (
        <p className="mt-1 text-sm text-neutral-500">{material.note}</p>
      ) : null}

      {material.retailers.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {material.retailers.map((retailer) => (
            <a
              key={retailer.url}
              href={retailer.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-900"
            >
              {retailer.name} ↗
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
