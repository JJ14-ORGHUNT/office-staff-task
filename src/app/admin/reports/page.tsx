"use client";

import { useEffect, useState } from "react";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReportsPage() {
  // Empty until mount -- SSR and the first client paint must agree, and
  // `new Date()` can only be read safely inside an effect (see AGENTS.md /
  // README hydration-safety rule). The date inputs render blank for one tick,
  // then fill in with today's date.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const t = today();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a render-unsafe value (new Date()) after mount, not a render-time branch
    setFrom(t);
    setTo(t);
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight mb-6">Reports</h1>

      <div className="bg-white rounded-2xl p-5 sm:p-6" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        <p className="text-brand-ink2 mb-5 text-sm leading-relaxed font-medium">
          Export a task-by-task report for any date range, including who completed what and why any
          task was not done.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
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

        <a
          href={`/api/admin/reports?from=${from}&to=${to}`}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-brand hover:bg-brand-dark transition-colors text-white font-extrabold uppercase tracking-wide text-sm px-5 py-3 sm:py-2.5 rounded-xl active:scale-[0.98]"
        >
          ⬇ Download CSV
        </a>
      </div>
    </div>
  );
}
