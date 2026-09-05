"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

const POLL_INTERVAL_MS = 10000;

type CalendarCell = {
  date: string;
  hasTasks: boolean;
  totalTasks: number;
  completed: number;
  overdueCount: number;
  completionPct: number;
};

type EmployeeDaySnapshot = {
  userId: string;
  name: string;
  totalTasks: number;
  completed: number;
  inProgress: number;
  notDone: number;
  overdueCount: number;
  totalDurationSec: number;
  completionPct: number;
};

type DayTaskBreakdown = {
  key: string;
  title: string;
  icon: string;
  total: number;
  completed: number;
  inProgress: number;
  notDone: number;
  notStarted: number;
  completionPct: number;
};

type OrgDaySummary = {
  date: string;
  hasTasks: boolean;
  totalTasks: number;
  completed: number;
  inProgress: number;
  notDone: number;
  overdueCount: number;
  totalDurationSec: number;
  completionPct: number;
  byEmployee: EmployeeDaySnapshot[];
  byTask: DayTaskBreakdown[];
};

type TimelineEvent = {
  id: string;
  at: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  taskInstanceId: string;
  title: string;
  icon: string;
  scheduledTime: string;
  selfAdded: boolean;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(year: number, month0: number, day: number): string {
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

function indicator(cell: CalendarCell | undefined, isFuture: boolean) {
  if (isFuture || !cell || !cell.hasTasks) {
    return { emoji: "–", classes: "bg-brand-surface text-brand-ink2" };
  }
  if (cell.completionPct >= 90) return { emoji: "🟢", classes: "bg-brand-success/10 text-brand-success" };
  if (cell.completionPct >= 60) return { emoji: "🟡", classes: "bg-brand-warning/15 text-[#8a5a00]" };
  return { emoji: "🔴", classes: "bg-brand-critical/10 text-brand-critical" };
}

function pctBadgeClasses(pct: number): string {
  if (pct >= 90) return "bg-brand-success/10 text-brand-success";
  if (pct >= 60) return "bg-brand-warning/15 text-[#8a5a00]";
  return "bg-brand-critical/10 text-brand-critical";
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function statusMeta(status: string): { emoji: string; label: string } {
  switch (status) {
    case "DONE":
      return { emoji: "🟢", label: "Done" };
    case "IN_PROGRESS":
      return { emoji: "🟡", label: "In Progress" };
    case "NOT_DONE":
      return { emoji: "🔴", label: "Not Done" };
    default:
      return { emoji: "⚪", label: "Not Started" };
  }
}

function StatTile({ label, value, valueColor }: { label: string; value: number | string; valueColor?: string }) {
  return (
    <div className="bg-brand-surface rounded-xl p-3 text-center">
      <p className={`text-xl font-extrabold tabular-nums ${valueColor ?? "text-brand-darker"}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-ink2 mt-0.5">{label}</p>
    </div>
  );
}

export default function AdminCalendarPage() {
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);
  const [cells, setCells] = useState<CalendarCell[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<OrgDaySummary | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [dayDetailError, setDayDetailError] = useState(false);

  const [timelineUserId, setTimelineUserId] = useState<string | null>(null);
  const [timelineName, setTimelineName] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Mirrors of selectedDate/timelineUserId, kept in sync synchronously
  // alongside the state itself (see the effect below). Async fetch
  // resolutions compare against these -- rather than the state values
  // captured in their own closures -- so a response for a day/employee the
  // admin has since navigated away from is detected and dropped instead of
  // silently overwriting what's now on screen.
  const selectedDateRef = useRef<string | null>(null);
  const timelineUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);
  useEffect(() => {
    timelineUserIdRef.current = timelineUserId;
  }, [timelineUserId]);

  // Current month/today can only be known post-mount (never call `new Date()`
  // during render) — SSR and the first client paint both show the loading
  // state below until this effect runs.
  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial "current month" derived once after mount; SSR/first paint render the loading state above
    setView({ year: now.getFullYear(), month: now.getMonth() });
    setTodayDate(dateStr(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);

  const loadMonth = useCallback(async () => {
    if (!view) return;
    try {
      const res = await fetch(`/api/admin/calendar?year=${view.year}&month=${view.month}`);
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      setCells(json.cells ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (!view) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous "start spinner" flag before the async loadMonth() fetch below settles it
    setLoading(true);
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function changeMonth(delta: number) {
    setView((v) => {
      if (!v) return v;
      let month = v.month + delta;
      let year = v.year;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
      return { year, month };
    });
  }

  function goToToday() {
    if (!todayDate) return;
    setView({ year: Number(todayDate.slice(0, 4)), month: Number(todayDate.slice(5, 7)) - 1 });
  }

  async function openDay(date: string) {
    setSelectedDate(date);
    setDayDetail(null);
    setDayDetailError(false);
    setTimelineUserId(null);
    setTimelineEvents(null);
    setDayDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/calendar/day?date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      // Only apply if `date` is still the open day when this resolves --
      // otherwise a slow response for a day the admin has since clicked away
      // from would land after (and overwrite) the newly-opened day's data.
      if (selectedDateRef.current === date) setDayDetail(json);
    } catch {
      if (selectedDateRef.current === date) setDayDetailError(true);
    } finally {
      if (selectedDateRef.current === date) setDayDetailLoading(false);
    }
  }

  function closeDay() {
    setSelectedDate(null);
    setDayDetail(null);
    setTimelineUserId(null);
    setTimelineEvents(null);
  }

  async function toggleTimeline(userId: string, name: string) {
    if (!selectedDate) return;
    if (timelineUserId === userId) {
      setTimelineUserId(null);
      setTimelineEvents(null);
      return;
    }
    const forDate = selectedDate;
    setTimelineUserId(userId);
    setTimelineName(name);
    setTimelineEvents(null);
    setTimelineLoading(true);
    try {
      const res = await fetch(
        `/api/admin/timeline?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(forDate)}`,
      );
      const json = await res.json();
      // Only apply if this employee/day is still selected when the response
      // arrives -- guards against a slow response for a previously-toggled
      // employee overwriting whichever timeline is now open.
      if (timelineUserIdRef.current === userId && selectedDateRef.current === forDate) {
        setTimelineEvents(json.events ?? []);
      }
    } catch {
      if (timelineUserIdRef.current === userId && selectedDateRef.current === forDate) {
        setTimelineEvents([]);
      }
    } finally {
      if (timelineUserIdRef.current === userId) setTimelineLoading(false);
    }
  }

  // Silent background refresh for the open day-detail modal -- only wired up
  // when it's showing *today*. Past dates are immutable snapshots (see the
  // Phase 1/2 model), so there's nothing to poll for once a historical day is
  // open; today's numbers can change any time staff act on their checklist.
  const refreshOpenDay = useCallback(async () => {
    if (!selectedDate || selectedDate !== todayDate) return;
    const forDate = selectedDate;
    try {
      const res = await fetch(`/api/admin/calendar/day?date=${encodeURIComponent(forDate)}`);
      if (res.ok) {
        const json = await res.json();
        // Only apply if `forDate` is still the open day when this poll
        // resolves -- otherwise a stale response for a previously-open day
        // could land after (and overwrite) a newly-opened day's data.
        if (selectedDateRef.current === forDate) setDayDetail(json);
      }
    } catch {
      // Silent: background refresh, keep showing the last-known-good detail.
    }
    const forUserId = timelineUserId;
    if (forUserId) {
      try {
        const res = await fetch(
          `/api/admin/timeline?userId=${encodeURIComponent(forUserId)}&date=${encodeURIComponent(forDate)}`,
        );
        if (res.ok) {
          const json = await res.json();
          if (selectedDateRef.current === forDate && timelineUserIdRef.current === forUserId) {
            setTimelineEvents(json.events ?? []);
          }
        }
      } catch {
        // Silent, same reasoning as above.
      }
    }
  }, [selectedDate, todayDate, timelineUserId]);

  usePolling(refreshOpenDay, POLL_INTERVAL_MS, selectedDate != null && selectedDate === todayDate);

  const cellsByDate = new Map((cells ?? []).map((c) => [c.date, c]));

  const grid: (string | null)[] = [];
  if (view) {
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const numDays = new Date(view.year, view.month + 1, 0).getDate();
    for (let i = 0; i < firstWeekday; i++) grid.push(null);
    for (let d = 1; d <= numDays; d++) grid.push(dateStr(view.year, view.month, d));
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight">Calendar</h1>
        {view && (
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
              className="w-9 h-9 rounded-lg bg-white hover:bg-brand/10 transition-colors text-brand-darker font-bold shrink-0"
              style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
            >
              ‹
            </button>
            <span className="text-sm font-extrabold uppercase tracking-wide text-brand-darker w-32 sm:w-40 text-center shrink-0">
              {MONTH_NAMES[view.month]} {view.year}
            </span>
            <button
              onClick={() => changeMonth(1)}
              aria-label="Next month"
              className="w-9 h-9 rounded-lg bg-white hover:bg-brand/10 transition-colors text-brand-darker font-bold shrink-0"
              style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
            >
              ›
            </button>
            {todayDate && (
              <button
                onClick={goToToday}
                className="text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 transition-colors active:scale-[0.97] shrink-0"
              >
                Today
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs font-semibold text-brand-ink2">
        <span className="flex items-center gap-1.5">
          <span>🟢</span> ≥90% complete
        </span>
        <span className="flex items-center gap-1.5">
          <span>🟡</span> 60–89% complete
        </span>
        <span className="flex items-center gap-1.5">
          <span>🔴</span> &lt;60% complete
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-surface border border-black/10 inline-block" /> No tasks / future
        </span>
      </div>

      <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        {(!view || loading) && (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        )}
        {view && !loading && loadError && (
          <div className="text-center py-10">
            <p className="text-brand-darker font-medium mb-4">Something went wrong. Please try again.</p>
            <button
              onClick={loadMonth}
              className="bg-brand hover:bg-brand-dark transition-colors text-white text-sm font-extrabold uppercase tracking-wide px-6 py-3 rounded-xl active:scale-[0.98]"
            >
              Try Again
            </button>
          </div>
        )}

        {view && !loading && !loadError && (
          <>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-center text-[11px] font-bold uppercase tracking-wide text-brand-ink2 py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((date, idx) => {
                if (!date) return <div key={`empty-${idx}`} />;
                const cell = cellsByDate.get(date);
                const isFuture = todayDate != null && date > todayDate;
                const ind = indicator(cell, isFuture);
                const isToday = date === todayDate;
                const dayNum = Number(date.slice(8, 10));
                return (
                  <button
                    key={date}
                    onClick={() => openDay(date)}
                    disabled={isFuture}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${ind.classes} ${
                      isFuture ? "opacity-40 cursor-default" : "hover:brightness-95 cursor-pointer"
                    } ${isToday ? "ring-2 ring-brand" : ""}`}
                  >
                    <span className="text-[11px] font-bold tabular-nums">{dayNum}</span>
                    <span className="text-base leading-none">{ind.emoji}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {selectedDate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={closeDay}>
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-extrabold text-brand-darker tracking-tight">{selectedDate}</h2>
              <button
                onClick={closeDay}
                aria-label="Close"
                className="text-brand-ink2 hover:text-brand-darker font-bold text-xl leading-none"
              >
                ×
              </button>
            </div>

            {dayDetailLoading && (
              <div className="py-2 space-y-3 animate-pulse">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            )}
            {dayDetailError && !dayDetailLoading && (
              <EmptyState title="Something went wrong" hint="Please try again." />
            )}

            {dayDetail && !dayDetailLoading && !dayDetailError && (
              <>
                {!dayDetail.hasTasks ? (
                  <EmptyState title="No tasks were scheduled for this day" />
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
                      <StatTile label="Total" value={dayDetail.totalTasks} />
                      <StatTile label="Done" value={dayDetail.completed} valueColor="text-brand-success" />
                      <StatTile label="In Progress" value={dayDetail.inProgress} valueColor="text-brand-warning" />
                      <StatTile label="Not Done" value={dayDetail.notDone} valueColor="text-brand-critical" />
                      <StatTile label="Overdue" value={dayDetail.overdueCount} valueColor="text-brand-critical" />
                      <StatTile label="Completion" value={`${dayDetail.completionPct}%`} valueColor="text-brand" />
                    </div>

                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-brand-ink2 mb-2">
                      Employee Breakdown
                    </h3>
                    <div className="rounded-xl border border-black/5 divide-y divide-black/5 mb-6">
                      {dayDetail.byEmployee.map((e) => (
                        <div key={e.userId}>
                          <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <p className="font-bold text-brand-darker text-sm flex-1 min-w-[8rem] basis-full sm:basis-auto truncate">
                              {e.name}
                            </p>
                            <span className="text-xs font-semibold text-brand-ink2 tabular-nums shrink-0">
                              {e.completed}/{e.totalTasks}
                            </span>
                            <span
                              className={`text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full tabular-nums shrink-0 ${pctBadgeClasses(e.completionPct)}`}
                            >
                              {e.completionPct}%
                            </span>
                            <button
                              onClick={() => toggleTimeline(e.userId, e.name)}
                              className="text-brand hover:text-brand-dark font-bold text-xs uppercase tracking-wide transition-colors shrink-0"
                            >
                              {timelineUserId === e.userId ? "Hide" : "Timeline"}
                            </button>
                          </div>
                          {timelineUserId === e.userId && (
                            <div className="px-4 pb-4 bg-brand-surface/50">
                              <p className="text-[11px] font-extrabold uppercase tracking-wide text-brand-ink2 mb-2 pt-3">
                                {timelineName}&apos;s Timeline — {selectedDate}
                              </p>
                              {timelineLoading && (
                                <div className="space-y-1.5 animate-pulse">
                                  <div className="h-3.5 w-2/3 rounded-full bg-black/[0.06]" />
                                  <div className="h-3.5 w-1/2 rounded-full bg-black/[0.06]" />
                                </div>
                              )}
                              {!timelineLoading && (timelineEvents?.length ?? 0) === 0 && (
                                <EmptyState title="No events recorded" compact />
                              )}
                              {!timelineLoading && timelineEvents && timelineEvents.length > 0 && (
                                <ul className="space-y-1.5">
                                  {timelineEvents.map((ev) => {
                                    const meta = statusMeta(ev.toStatus);
                                    return (
                                      <li key={ev.id} className="text-sm text-brand-darker font-medium flex items-center gap-2">
                                        <span className="text-xs text-brand-ink2 font-bold tabular-nums w-16 shrink-0">
                                          {formatClockTime(ev.at)}
                                        </span>
                                        <span className="shrink-0">{meta.emoji}</span>
                                        <span className="truncate">
                                          {ev.icon} {ev.title}
                                        </span>
                                        <span className="text-brand-ink2 shrink-0">— {meta.label}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-brand-ink2 mb-2">
                      Task Breakdown
                    </h3>
                    <div className="rounded-xl border border-black/5 divide-y divide-black/5">
                      {dayDetail.byTask.map((task) => (
                        <div key={task.key} className="px-4 py-3 flex items-center gap-3">
                          <span className="text-lg shrink-0">{task.icon}</span>
                          <p className="font-bold text-brand-darker text-sm flex-1 min-w-0 truncate">{task.title}</p>
                          <span className="text-xs font-semibold text-brand-ink2 tabular-nums shrink-0">
                            {task.completed}/{task.total} done
                          </span>
                          <span
                            className={`text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full tabular-nums shrink-0 ${pctBadgeClasses(task.completionPct)}`}
                          >
                            {task.completionPct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
