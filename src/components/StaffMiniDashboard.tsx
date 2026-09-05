"use client";

import { useEffect, useState } from "react";
import { t, type Lang } from "@/lib/i18n";

type TrendDay = { date: string; total: number; completed: number; completionPct: number };

type MiniDashboardData = {
  trend: TrendDay[];
  streak: number;
  week: { totalTasks: number; completed: number; trackedSec: number; hasTrackedWork: boolean };
};

function formatTracked(sec: number): string {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Compact, glance-able "how's my week going" card — a supplement to the
// primary open->see->tap->done checklist flow, not a competing destination.
// Fetched client-side after mount only; nothing here reads Date/localStorage
// during render, so there's no hydration-safety concern.
export default function StaffMiniDashboard({ lang }: { lang: Lang }) {
  const [data, setData] = useState<MiniDashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks/mini-dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => {
        // Silent — this is a supplementary widget, not the primary job of the screen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const pct = data.week.totalTasks ? Math.round((data.week.completed / data.week.totalTasks) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-ink2 mb-3">{t(lang, "yourWeek")}</p>

      <div className="flex items-end gap-1.5 h-9 mb-3">
        {data.trend.map((d) => {
          const heightPct = d.total > 0 ? Math.max(10, d.completionPct) : 5;
          const opacity = d.total > 0 ? 0.25 + 0.75 * (d.completionPct / 100) : 0.12;
          return (
            <div key={d.date} className="flex-1 h-full flex items-end">
              <div
                className="w-full rounded-sm bg-brand"
                style={{ height: `${heightPct}%`, opacity }}
                title={`${d.date}: ${d.total ? `${d.completionPct}%` : "—"}`}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-brand-surface rounded-xl py-2 px-1">
          <p className="text-base font-extrabold text-brand-darker tabular-nums">{data.streak}</p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-brand-ink2 leading-tight">
            {t(lang, "dayStreakLabel")}
          </p>
        </div>
        <div className="bg-brand-surface rounded-xl py-2 px-1">
          <p className="text-base font-extrabold text-brand-darker tabular-nums">
            {data.week.completed}/{data.week.totalTasks}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-brand-ink2 leading-tight">
            {t(lang, "thisWeek")}
          </p>
        </div>
        <div className="bg-brand-surface rounded-xl py-2 px-1">
          {data.week.hasTrackedWork ? (
            <>
              <p className="text-base font-extrabold text-brand-darker tabular-nums">
                {formatTracked(data.week.trackedSec)}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-brand-ink2 leading-tight">
                {t(lang, "trackedThisWeek")}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-extrabold text-brand-darker tabular-nums">{pct}%</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-brand-ink2 leading-tight">
                {t(lang, "completionRate")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
