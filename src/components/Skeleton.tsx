// Minimal shared skeleton building block -- a single pulsing placeholder
// block, composed into a few shapes below. Deliberately not a heavy system:
// every loading state in the app should be built from these three pieces so
// the "shape" of a loading screen always matches the shape of its real
// content (a card, a table row, or a KPI-style tile), never a bare
// "Loading..." string.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-black/[0.06] ${className}`.trim()} />;
}

/** Placeholder for a white rounded-2xl card with an icon + two lines + a full-width action row (task cards, list rows). */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-white rounded-2xl p-4 ${className}`.trim()}
      style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
      aria-hidden
    >
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  );
}

/** Placeholder for one table/list row (an admin table body, a history entry). */
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 px-5 py-4 ${className}`.trim()} aria-hidden>
      <Skeleton className="h-3.5 w-1/5" />
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="h-3.5 w-16 shrink-0" />
    </div>
  );
}

/** A stack of SkeletonCards, for list-style loading screens. */
export function SkeletonCardList({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** A stack of SkeletonRows, for table/list-style loading screens. */
export function SkeletonRowList({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`divide-y divide-black/5 ${className}`.trim()}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
