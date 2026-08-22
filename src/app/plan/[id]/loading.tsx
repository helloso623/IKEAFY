export default function Loading() {
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
