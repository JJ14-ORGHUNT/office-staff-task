"use client";

import { useNow } from "@/lib/useNow";

type Variant = "dark" | "light";

function formatParts(now: Date) {
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const dayAndDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
  return { time, dayAndDate };
}

// SSR-safe placeholder — identical on server and first client render so
// hydration never mismatches. The real ticking clock takes over on mount.
const PLACEHOLDER = { time: "--:--:-- --", dayAndDate: "—" };

export default function LiveClock({ variant = "dark" }: { variant?: Variant }) {
  const now = useNow(1000);
  const { time, dayAndDate } = now ? formatParts(now) : PLACEHOLDER;

  const isDark = variant === "dark";

  return (
    <div className="flex flex-col items-end">
      <span
        className={`text-xl font-extrabold tabular-nums tracking-tight leading-none ${
          isDark ? "text-white" : "text-brand-darker"
        }`}
      >
        {time}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wide mt-1 text-brand-ink2">
        {dayAndDate}
      </span>
    </div>
  );
}
