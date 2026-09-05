"use client";

import { useEffect, useState } from "react";
import { SkeletonRowList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

type Entry = {
  id: string;
  date: string;
  description: string | null;
  hasAudio: boolean;
  durationSec: number | null;
  createdAt: string;
  employee: string;
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AdminExtraWorkPage() {
  // Empty until mount -- see the hydration-safety note in admin/reports/page.tsx.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = today();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a render-unsafe value (new Date()) after mount, not a render-time branch
    setFrom(t);
    setTo(t);
    setReady(true);
  }, []);

  async function load(fromDate: string, toDate: string) {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/extra-work?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      setEntries(json.entries ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount/on-change
    load(from, to);
  }, [ready, from, to]);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight mb-2">Extra Work</h1>
      <p className="text-brand-ink2 mb-6 font-medium">
        Work employees reported outside their regular checklist — typed or recorded by voice.
      </p>

      <div className="bg-white rounded-2xl p-5 mb-6" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl divide-y divide-black/5" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        {loading ? (
          <SkeletonRowList count={4} />
        ) : loadError ? (
          <div className="py-10 text-center">
            <p className="text-brand-darker font-medium mb-4">Something went wrong. Please try again.</p>
            <button
              onClick={() => load(from, to)}
              className="bg-brand hover:bg-brand-dark transition-colors text-white text-sm font-extrabold uppercase tracking-wide px-6 py-3 rounded-xl active:scale-[0.98]"
            >
              Try Again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState title="No extra work logged in this range" hint="Try widening the date range above." />
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="p-5 hover:bg-brand-surface/70 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-2 mb-2">
                <p className="font-extrabold text-brand-darker">{entry.employee}</p>
                <p className="text-sm text-brand-ink2 font-semibold">
                  {entry.date} · {new Date(entry.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {entry.description && <p className="text-brand-darker mb-2 font-medium">{entry.description}</p>}
              {entry.hasAudio && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-brand-ink2 font-semibold whitespace-nowrap">
                    🎤 Voice note{entry.durationSec ? ` · ${formatTime(entry.durationSec)}` : ""}
                  </span>
                  <audio controls src={`/api/extra-work/${entry.id}/audio`} className="h-8 flex-1 min-w-0" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
