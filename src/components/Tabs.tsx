"use client";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; badge?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap items-center gap-1 border-b border-neutral-200"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
              isActive
                ? "font-semibold"
                : "border-transparent font-medium text-neutral-500 hover:text-neutral-800"
            }`}
            style={
              isActive
                ? {
                    borderBottomColor: "var(--ikeafy-blue)",
                    color: "var(--ikeafy-blue)",
                  }
                : undefined
            }
          >
            <span>{tab.label}</span>
            {typeof tab.badge === "number" ? (
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  isActive ? "text-white" : "bg-neutral-200 text-neutral-600"
                }`}
                style={isActive ? { background: "var(--ikeafy-blue)" } : undefined}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
