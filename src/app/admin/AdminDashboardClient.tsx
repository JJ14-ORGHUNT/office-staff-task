"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import LiveClock from "@/components/LiveClock";
import { useNow } from "@/lib/useNow";
import { usePolling } from "@/lib/usePolling";
import { EmptyState } from "@/components/EmptyState";
import type { DashboardStats, EmployeeBucket, ActivityEvent, AttentionRequired } from "@/lib/dashboard";

const POLL_INTERVAL_MS = 10000;

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function activityVerb(toStatus: string): string {
  switch (toStatus) {
    case "DONE":
      return "completed";
    case "IN_PROGRESS":
      return "started";
    case "NOT_DONE":
      return "marked not done on";
    default:
      return "updated";
  }
}

function formatOverdue(minutes: number): string {
  if (minutes < 60) return `${minutes}m overdue`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m overdue` : `${h}h overdue`;
}

// Self-ticking leaf for the "Updated Xs ago" caption -- owns its own
// useNow() tick (same pattern as LiveClock) so the tick re-renders just this
// one line, never the whole dashboard (KPI tiles, team status rows, activity
// feed) that would otherwise re-render every second for no reason.
function UpdatedAgo({ lastUpdated }: { lastUpdated: Date | null }) {
  const now = useNow(1000);
  const updatedSecondsAgo =
    lastUpdated && now ? Math.max(0, Math.floor((now.getTime() - lastUpdated.getTime()) / 1000)) : null;
  return (
    <p className="text-brand-ink2/70 text-xs font-semibold mt-0.5" aria-live="polite">
      {updatedSecondsAgo == null ? " " : updatedSecondsAgo <= 1 ? "Updated just now" : `Updated ${updatedSecondsAgo}s ago`}
    </p>
  );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
      <div className="px-5 py-4 border-b border-black/5">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-brand-ink2">Recent Activity</h2>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-black/5">
        {events.length === 0 && (
          <EmptyState title="No activity yet today" hint="Status changes will appear here as staff work through their lists." compact />
        )}
        {events.map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-start gap-3">
            <span className="text-xs font-bold text-brand-ink2 tabular-nums shrink-0 w-14 pt-0.5">
              {formatClockTime(e.at)}
            </span>
            <p className="text-sm text-brand-darker font-medium min-w-0">
              <span className="font-extrabold">{e.employeeName}</span> {activityVerb(e.toStatus)}{" "}
              <span className="font-semibold">
                {e.taskIcon} {e.taskTitle}
              </span>
              {e.overriddenByName && (
                <span className="block text-xs text-brand-ink2 font-semibold mt-0.5">
                  ↳ overridden by {e.overriddenByName}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionPanel({ attention }: { attention: AttentionRequired }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
      <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-brand-ink2">Attention Required</h2>
        {attention.count > 0 && (
          <span className="text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-critical/10 text-brand-critical shrink-0">
            ⏰ {attention.count} overdue
          </span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-black/5">
        {attention.items.length === 0 && (
          <EmptyState title="Nothing overdue right now" hint="Everything is on track. 🎉" compact />
        )}
        {attention.items.map((item) => (
          <Link
            key={item.instanceId}
            href={`/admin/board?employeeId=${encodeURIComponent(item.employeeId)}`}
            className="px-5 py-3 flex items-center gap-3 hover:bg-brand-surface transition-colors"
          >
            <span className="text-lg shrink-0">{item.taskIcon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-brand-darker truncate">{item.employeeName}</p>
              <p className="text-xs text-brand-ink2 font-semibold truncate">
                {item.taskTitle} · due {item.scheduledTime}
              </p>
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-critical/10 text-brand-critical shrink-0 tabular-nums">
              ⏰ {formatOverdue(item.overdueMinutes)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const RING_SIZE = 120;
const RING_STROKE = 12;

function completionColor(pct: number): string {
  if (pct >= 80) return "#1fbf85"; // brand-success
  if (pct >= 50) return "#ffb020"; // brand-warning
  return "#ff4d5e"; // brand-critical
}

function CompletionRing({ pct }: { pct: number }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(pct, 100) / 100);
  const color = completionColor(pct);

  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-white tracking-tight tabular-nums">{pct}%</span>
        <span className="text-[10px] text-brand-ink2 font-bold uppercase tracking-wide">done</span>
      </div>
    </div>
  );
}

function KpiTile({
  icon,
  iconBg,
  label,
  value,
  valueColor,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: number | string;
  valueColor?: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-4 flex items-center gap-3"
      style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">{label}</p>
        <p
          className={`text-2xl font-extrabold leading-tight tabular-nums ${valueColor ?? "text-brand-darker"}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

const LEGEND: { key: keyof EmployeeBucket; label: string; dot: string; bar: string }[] = [
  { key: "done", label: "Done", dot: "bg-brand-success", bar: "bg-brand-success" },
  { key: "inProgress", label: "In progress", dot: "bg-brand-warning", bar: "bg-brand-warning" },
  { key: "notDone", label: "Not done", dot: "bg-brand-critical", bar: "bg-brand-critical" },
  { key: "notStarted", label: "Not started", dot: "bg-brand-surface border border-black/5", bar: "bg-brand-surface" },
];

function EmployeeBar({ employee }: { employee: EmployeeBucket }) {
  const total = employee.total || 1;
  return (
    <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-brand-surface gap-[2px]">
      {LEGEND.map((segment) => {
        const count = employee[segment.key] as number;
        if (!count) return null;
        return (
          <div
            key={segment.key}
            className={segment.bar}
            style={{ width: `${(count / total) * 100}%`, transition: "width 500ms ease" }}
            title={`${segment.label}: ${count}`}
          />
        );
      })}
    </div>
  );
}

type DashboardApiResponse = DashboardStats & {
  extraWorkCount: number;
  recentActivity: ActivityEvent[];
  attentionRequired: AttentionRequired;
};

export default function AdminDashboardClient({
  initialStats,
  initialExtraWorkCount,
  initialRecentActivity,
  initialAttentionRequired,
}: {
  initialStats: DashboardStats;
  initialExtraWorkCount: number;
  initialRecentActivity: ActivityEvent[];
  initialAttentionRequired: AttentionRequired;
}) {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [extraWorkCount, setExtraWorkCount] = useState(initialExtraWorkCount);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>(initialRecentActivity);
  const [attentionRequired, setAttentionRequired] = useState<AttentionRequired>(initialAttentionRequired);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
      if (!res.ok) return;
      const json: DashboardApiResponse = await res.json();
      setStats(json);
      setExtraWorkCount(json.extraWorkCount);
      setRecentActivity(json.recentActivity);
      setAttentionRequired(json.attentionRequired);
      setLastUpdated(new Date());
    } catch {
      // Silent: this is a background refresh -- keep showing the last-known-good
      // stats rather than surfacing a transient network error over the dashboard.
    }
  }, []);

  // Today's dashboard only ever shows "today" -- past days don't change under
  // the immutability model, so polling is always safe/meaningful here.
  usePolling(refresh, POLL_INTERVAL_MS, true);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight">Today&apos;s Overview</h1>
          <p className="text-brand-ink2 text-sm font-medium">{stats.date}</p>
          <UpdatedAgo lastUpdated={lastUpdated} />
        </div>
        <LiveClock variant="light" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 mb-4">
        <div className="bg-brand-darker rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
          <CompletionRing pct={stats.completionPct} />
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <p className="text-sm text-brand-ink2 -mb-1 font-medium">
              {stats.completed} of {stats.totalTasks} tasks completed today
            </p>
            {LEGEND.map((segment) => {
              const count = stats.byEmployee.reduce(
                (sum, e) => sum + (e[segment.key] as number),
                0,
              );
              return (
                <div key={segment.key} className="flex items-center gap-2 text-sm">
                  <span className={`w-2.5 h-2.5 rounded-full ${segment.dot}`} />
                  <span className="text-brand-ink2 font-semibold">{segment.label}</span>
                  <span className="ml-auto font-extrabold text-white tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <KpiTile icon="👥" iconBg="bg-brand/10" label="Employees" value={stats.employees} />
          <KpiTile icon="📋" iconBg="bg-brand-surface" label="Total tasks" value={stats.totalTasks} />
          <KpiTile
            icon="⏰"
            iconBg="bg-brand-critical/10"
            label="Overdue"
            value={stats.overdue}
            valueColor="text-brand-critical"
          />
          <Link href="/admin/extra-work">
            <KpiTile
              icon="🎙️"
              iconBg="bg-brand/10"
              label="Extra work logged"
              value={extraWorkCount}
              valueColor="text-brand"
            />
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-brand-ink2">Team Status</h2>
          <div className="flex items-center gap-3 text-xs text-brand-ink2 font-semibold">
            {LEGEND.map((segment) => (
              <span key={segment.key} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${segment.dot}`} />
                {segment.label}
              </span>
            ))}
          </div>
        </div>
        <div className="divide-y divide-black/5">
          {stats.byEmployee.length === 0 && (
            <EmptyState title="No employees with tasks today" hint="Assign a task from the Tasks page to see activity here." compact />
          )}
          {stats.byEmployee.map((e) => (
            <div key={e.id} className="px-5 py-4 flex items-center gap-4">
              <div className="w-32 shrink-0">
                <p className="font-extrabold text-brand-darker truncate text-sm">{e.name}</p>
                <p className="text-xs text-brand-ink2 font-semibold tabular-nums">
                  {e.done}/{e.total} done
                </p>
              </div>
              <div className="flex-1">
                <EmployeeBar employee={e} />
              </div>
              {e.overdue > 0 && (
                <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-critical/10 text-brand-critical">
                  ⏰ {e.overdue} overdue
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ActivityFeed events={recentActivity} />
        <AttentionPanel attention={attentionRequired} />
      </div>
    </div>
  );
}
