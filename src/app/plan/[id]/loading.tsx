export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 space-y-3">
        <div className="h-4 w-24 rounded bg-neutral-200" />
        <div className="h-9 w-2/3 rounded bg-neutral-200" />
        <div className="flex gap-2">
          <div className="h-6 w-28 rounded-full bg-neutral-200" />
          <div className="h-6 w-20 rounded-full bg-neutral-200" />
          <div className="h-6 w-16 rounded-full bg-neutral-200" />
        </div>
      </div>

      <div className="h-10 w-full max-w-md rounded bg-neutral-200" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-neutral-200" />
          <div className="h-40 rounded-xl bg-neutral-200" />
          <div className="h-40 rounded-xl bg-neutral-200" />
        </div>
        <div className="h-80 rounded-xl bg-neutral-200" />
      </div>
    </div>
  );
}
