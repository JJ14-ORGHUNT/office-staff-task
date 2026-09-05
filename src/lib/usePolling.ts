"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` on a fixed interval while `enabled` is true. Automatically
 * pauses when the browser tab is hidden (Page Visibility API) so background
 * tabs don't burn requests, and fires one immediate catch-up call when the
 * tab becomes visible again. Used for the low-scale polling refresh pattern
 * this app uses instead of WebSockets/SSE (single-server SQLite, no need for
 * push transport) -- e.g. the admin dashboard and the calendar day-detail
 * view for "today".
 */
export function usePolling(callback: () => void, intervalMs: number, enabled: boolean = true): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    function tick() {
      savedCallback.current();
    }

    function start() {
      if (id != null) return;
      id = setInterval(tick, intervalMs);
    }

    function stop() {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    }

    if (typeof document !== "undefined" && !document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs, enabled]);
}
