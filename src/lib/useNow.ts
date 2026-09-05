"use client";

import { useEffect, useState } from "react";

/**
 * Shared "current time" tick for client components (live clock, due-state
 * badges, elapsed-duration timers). Returns `null` on the very first render
 * (server + pre-hydration client) so callers can render a fixed, SSR-safe
 * placeholder instead of ever calling `new Date()` during render.
 */
export function useNow(intervalMs: number = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial tick after mount, replacing the SSR-safe null placeholder
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
