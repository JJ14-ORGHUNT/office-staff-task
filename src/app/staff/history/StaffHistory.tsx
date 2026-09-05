"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { SkeletonCardList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

type DaySummary = { date: string; total: number; done: number };

type DayTask = {
  id: string;
  title: string;
  icon: string;
  time: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_DONE";
  startedAt: string | null;
  completedAt: string | null;
  durationSec: number | null;
  notDoneReason: string | null;
  notDoneNote: string | null;
  selfAdded: boolean;
};

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// Local (not UTC) date formatting, to match the server's todayStr().
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(dateStr: string, lang: Lang): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === localDateStr(today)) return t(lang, "today");
  if (dateStr === localDateStr(yesterday)) return t(lang, "yesterday");

  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" });
}

function statusLabel(status: DayTask["status"], lang: Lang) {
  switch (status) {
    case "DONE":
      return { emoji: "🟢", label: t(lang, "done"), classes: "bg-brand-success/10 text-brand-success" };
    case "IN_PROGRESS":
      return { emoji: "🟡", label: t(lang, "inProgress"), classes: "bg-brand-warning/15 text-[#8a5a00]" };
    case "NOT_DONE":
      return { emoji: "🔴", label: t(lang, "notDone"), classes: "bg-brand-critical/10 text-brand-critical" };
    default:
      return { emoji: "⚪", label: "—", classes: "bg-brand-ink2/10 text-brand-ink2" };
  }
}

export default function StaffHistory() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DayTask[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/tasks/history");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      setDays(json.days ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("lang") as Lang | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a client-only value after mount
    if (stored) setLang(stored);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDay(date: string) {
    if (expanded === date) {
      setExpanded(null);
      return;
    }
    setExpanded(date);
    if (!detailCache[date]) {
      setDetailLoading(date);
      try {
        const res = await fetch(`/api/tasks/history?date=${encodeURIComponent(date)}`);
        const json = await res.json();
        setDetailCache((prev) => ({ ...prev, [date]: json.tasks ?? [] }));
      } finally {
        setDetailLoading(null);
      }
    }
  }

  return (
    <main className="flex-1 bg-brand-surface pb-10">
      <header className="bg-brand-darker text-white px-5 pt-8 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">{t(lang, "history")}</h1>
          <Link
            href="/staff"
            className="text-xs font-bold uppercase tracking-wide bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-lg"
          >
            {t(lang, "backToToday")}
          </Link>
        </div>
      </header>

      <div className="px-4 mt-5 space-y-3 max-w-lg mx-auto">
        {loading && <SkeletonCardList count={4} />}

        {loadError && !loading && (
          <div className="bg-white rounded-2xl p-6 text-center" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
            <p className="text-brand-darker font-medium mb-4">{t(lang, "somethingWrong")}</p>
            <button
              onClick={load}
              className="bg-brand hover:bg-brand-dark transition-colors text-white text-sm font-extrabold uppercase tracking-wide px-6 py-3 rounded-xl active:scale-[0.98]"
            >
              {t(lang, "tryAgain")}
            </button>
          </div>
        )}

        {!loading && !loadError && days && days.length === 0 && (
          <EmptyState title={t(lang, "noHistory")} hint={t(lang, "noHistoryHint")} />
        )}

        {!loading &&
          !loadError &&
          days?.map((day) => {
            const isOpen = expanded === day.date;
            return (
              <div
                key={day.date}
                className="bg-white rounded-2xl overflow-hidden"
                style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
              >
                <button
                  onClick={() => toggleDay(day.date)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left"
                >
                  <div>
                    <p className="text-[15px] font-extrabold text-brand-darker tracking-tight">
                      {dayLabel(day.date, lang)}
                    </p>
                    <p className="text-brand-ink2 text-xs font-semibold">{day.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-brand/10 text-brand tabular-nums">
                      {day.done} / {day.total} {t(lang, "tasksCompletedOf")}
                    </span>
                    <span className="text-brand-ink2">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-black/5 divide-y divide-black/5">
                    {detailLoading === day.date && (
                      <div className="p-4 space-y-2 animate-pulse">
                        <div className="h-4 w-3/4 rounded-full bg-black/[0.06]" />
                        <div className="h-4 w-1/2 rounded-full bg-black/[0.06]" />
                      </div>
                    )}
                    {detailLoading !== day.date && (detailCache[day.date]?.length ?? 0) === 0 && (
                      <EmptyState title={t(lang, "noTasks")} compact />
                    )}
                    {detailLoading !== day.date &&
                      detailCache[day.date]?.map((task) => {
                        const status = statusLabel(task.status, lang);
                        return (
                          <div key={task.id} className="p-4 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-lg shrink-0">{task.icon}</span>
                                <p className="text-sm font-bold text-brand-darker truncate">{task.title}</p>
                              </div>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${status.classes}`}
                              >
                                {status.emoji} {status.label}
                              </span>
                            </div>
                            <p className="text-xs text-brand-ink2 font-medium pl-7">
                              {task.time}
                              {task.startedAt &&
                                ` · ${t(lang, "startedLabel")}: ${formatClockTime(task.startedAt)}`}
                              {task.completedAt &&
                                ` · ${t(lang, "completedLabel")}: ${formatClockTime(task.completedAt)}`}
                              {task.durationSec != null &&
                                ` · ${t(lang, "durationLabel")}: ${Math.round(task.durationSec / 60)} ${t(lang, "minutesShort")}`}
                            </p>
                            {task.notDoneReason && (
                              <p className="text-xs text-brand-critical font-semibold pl-7">
                                {t(lang, "notDoneReasonLabel")}: {task.notDoneReason}
                                {task.notDoneNote ? ` — ${task.notDoneNote}` : ""}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </main>
  );
}
