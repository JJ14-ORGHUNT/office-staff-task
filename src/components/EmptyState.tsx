// Minimal shared "nothing here yet" building block -- a short primary line
// plus one line of context, deliberately icon/illustration-free (the app
// already leans on emoji for status/nav; a bare empty state reads calmer).
// Every empty list/panel in the app should render this instead of a single
// bare sentence, so the "considered, not lazy" bar is the same everywhere.

export function EmptyState({
  title,
  hint,
  className = "",
  compact = false,
}: {
  title: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? "py-6" : "py-10"} ${className}`.trim()}>
      <p className={`font-bold text-brand-darker ${compact ? "text-sm" : "text-base"}`}>{title}</p>
      {hint && <p className="text-brand-ink2 text-xs font-medium mt-1">{hint}</p>}
    </div>
  );
}
