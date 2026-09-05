"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LANGUAGES, REASON_KEYS, t, type Lang } from "@/lib/i18n";
import ExtraWorkPanel from "./ExtraWorkPanel";
import LiveClock from "@/components/LiveClock";
import StaffMiniDashboard from "@/components/StaffMiniDashboard";
import { useNow } from "@/lib/useNow";
import { computeDueState, formatElapsed } from "@/lib/dueState";
import { SkeletonCard } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_DONE";
type ViewMode = "list" | "grid" | "board";

type Task = {
  id: string;
  title: string;
  icon: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  time: string;
  status: TaskStatus;
  notDoneReason: string | null;
  selfAdded?: boolean;
  durationTrackingEnabled?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  durationSec?: number | null;
};

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

type TodayResponse = {
  date: string;
  name: string;
  tasks: Task[];
  total: number;
  done: number;
};

const CANONICAL_REASONS = [
  "No time",
  "Material not available",
  "Someone else was using the area",
  "Could not complete",
  "Other",
];

const QUICK_ICONS = ["📌", "🧹", "🧺", "🪣", "🧽", "🔧", "📦", "🌿"];

type GreetingKey = "goodMorning" | "goodAfternoon" | "goodEvening";

function greetingKey(): GreetingKey {
  const hour = new Date().getHours();
  if (hour < 12) return "goodMorning";
  if (hour < 17) return "goodAfternoon";
  return "goodEvening";
}

// Badge for DONE/IN_PROGRESS/NOT_DONE never depends on the clock -- only the
// NOT_STARTED due-state badge does, so that's the only piece that needs to
// live in a self-ticking leaf component (<DueBadge> below). Keeping this half
// static/clock-free means the task list itself never has to re-render on a
// tick just to redraw a badge that hasn't changed.
function staticBadge(task: Task, lang: Lang): { emoji: string; label: string; classes: string } | null {
  switch (task.status) {
    case "DONE":
      return { emoji: "🟢", label: t(lang, "done"), classes: "bg-brand-success/10 text-brand-success" };
    case "IN_PROGRESS":
      return { emoji: "🟡", label: t(lang, "inProgress"), classes: "bg-brand-warning/15 text-[#8a5a00]" };
    case "NOT_DONE":
      return { emoji: "🔴", label: t(lang, "notDone"), classes: "bg-brand-critical/10 text-brand-critical" };
    default:
      return null;
  }
}

// Self-ticking leaf for the NOT_STARTED due-state pill -- owns its own
// useNow() tick (same "owns its own interval" pattern as LiveClock) so a
// countdown crossing into DUE_NOW/OVERDUE re-renders just this pill, never
// the surrounding task list/page. Due-state buckets are minute-grained (see
// dueState.ts's 15-minute grace window), so a 30s tick is plenty here.
function DueBadge({ task, lang, className }: { task: Task; lang: Lang; className: string }) {
  const now = useNow(30000);
  if (!now) return null;
  const due = computeDueState({ scheduledTime: task.time, status: task.status, now });
  if (due === "OVERDUE") {
    return <span className={`${className} bg-brand-critical/10 text-brand-critical`}>⏰ {t(lang, "overdue")}</span>;
  }
  if (due === "DUE_NOW") {
    return <span className={`${className} bg-brand-warning/15 text-[#8a5a00]`}>🔔 {t(lang, "dueNow")}</span>;
  }
  if (due === "UPCOMING") {
    return <span className={`${className} bg-brand-ink2/10 text-brand-ink2`}>🕒 {t(lang, "upcoming")}</span>;
  }
  return null;
}

// Self-ticking leaf for the in-progress elapsed-time readout -- same
// reasoning as <DueBadge>, but this one does need per-second precision (it's
// a running stopwatch), so it owns its own 1s tick independent of the page.
function ElapsedTimer({ startedAt, className }: { startedAt: string | null | undefined; className: string }) {
  const now = useNow(1000);
  const elapsedSec = startedAt && now ? (now.getTime() - new Date(startedAt).getTime()) / 1000 : 0;
  return <p className={className}>⏱ {formatElapsed(elapsedSec)}</p>;
}

export default function StaffTaskList() {
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<ViewMode>("list");
  const [greeting, setGreeting] = useState<GreetingKey>("goodMorning");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [reasonTask, setReasonTask] = useState<Task | null>(null);
  const [note, setNote] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [showNotDone, setShowNotDone] = useState(false);

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskIcon, setNewTaskIcon] = useState(QUICK_ICONS[0]);
  const [addingTask, setAddingTask] = useState(false);
  const [addTaskError, setAddTaskError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/tasks/today");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      setData(json);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("lang") as Lang | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a client-only value after mount, not a render-time branch
    if (stored) setLang(stored);
    const storedView = window.localStorage.getItem("taskView");
    if (storedView === "list" || storedView === "grid" || storedView === "board") setView(storedView);
    setGreeting(greetingKey());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    window.localStorage.setItem("lang", next);
  }

  function changeView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem("taskView", next);
  }

  async function updateStatus(taskId: string, status: TaskStatus, reason?: string, noteText?: string) {
    setBusyTaskId(taskId);
    try {
      const res = await fetch("/api/tasks/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: taskId, status, reason, note: noteText }),
      });
      if (res.ok) {
        const json = await res.json();
        setActionError(false);
        setData((prev) =>
          prev
            ? {
                ...prev,
                tasks: prev.tasks.map((task) =>
                  task.id === taskId
                    ? {
                        ...task,
                        status,
                        notDoneReason: reason ?? task.notDoneReason,
                        startedAt: json.startedAt,
                        completedAt: json.completedAt,
                        durationSec: json.durationSec,
                      }
                    : task,
                ),
                done: prev.tasks.filter((task) =>
                  task.id === taskId ? status === "DONE" : task.status === "DONE",
                ).length,
              }
            : prev,
        );
      } else {
        setActionError(true);
      }
    } catch {
      setActionError(true);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openNotDone(task: Task) {
    setNote("");
    setReasonTask(task);
  }

  async function confirmNotDone(reasonKeyIndex: number) {
    if (!reasonTask) return;
    const reason = CANONICAL_REASONS[reasonKeyIndex];
    const task = reasonTask;
    setReasonTask(null);
    await updateStatus(task.id, "NOT_DONE", reason, note);
  }

  function openAddTask() {
    setNewTaskTitle("");
    setNewTaskIcon(QUICK_ICONS[0]);
    setAddTaskError("");
    setShowAddTask(true);
  }

  async function submitNewTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    setAddTaskError("");
    try {
      const res = await fetch("/api/tasks/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle.trim(), icon: newTaskIcon }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddTaskError(json.error || t(lang, "couldNotSave"));
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              tasks: [...prev.tasks, json.task].sort((a, b) => a.time.localeCompare(b.time)),
              total: prev.total + 1,
            }
          : prev,
      );
      setShowAddTask(false);
    } catch {
      setAddTaskError(t(lang, "couldNotSave"));
    } finally {
      setAddingTask(false);
    }
  }

  async function removeSelfTask(taskId: string) {
    setBusyTaskId(taskId);
    try {
      const res = await fetch(`/api/tasks/self/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                tasks: prev.tasks.filter((task) => task.id !== taskId),
                total: prev.total - 1,
                done: prev.tasks.find((task) => task.id === taskId)?.status === "DONE"
                  ? prev.done - 1
                  : prev.done,
              }
            : prev,
        );
      } else {
        setActionError(true);
      }
    } catch {
      setActionError(true);
    } finally {
      setBusyTaskId(null);
    }
  }

  const progressPct = useMemo(() => {
    if (!data || data.total === 0) return 0;
    return Math.round((data.done / data.total) * 100);
  }, [data]);

  function renderListCard(task: Task) {
    const pill = staticBadge(task, lang);
    const isBusy = busyTaskId === task.id;
    const isUrgent = task.priority === "URGENT";
    const timed = task.durationTrackingEnabled === true;
    return (
      <div
        key={task.id}
        data-task-id={task.id}
        data-task-status={task.status}
        className={`bg-white rounded-2xl p-4 ${
          isUrgent ? "border-2 border-brand-critical" : "border border-transparent"
        }`}
        style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl shrink-0 w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              {task.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-brand-darker truncate tracking-tight">
                {task.title}
              </p>
              <p className="text-brand-ink2 text-xs font-semibold">{task.time}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {task.status === "NOT_STARTED" ? (
              <DueBadge
                task={task}
                lang={lang}
                className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
              />
            ) : (
              pill && (
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${pill.classes}`}>
                  {pill.emoji} {pill.label}
                </span>
              )
            )}
            {task.selfAdded && (
              <button
                disabled={isBusy}
                onClick={() => removeSelfTask(task.id)}
                aria-label={t(lang, "removeTask")}
                className="text-brand-ink2/60 hover:text-brand-ink2 transition-colors text-lg leading-none px-1"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {timed && task.status === "DONE" ? (
          <p className="text-xs font-semibold text-brand-ink2">
            {task.startedAt && `${t(lang, "startedLabel")}: ${formatClockTime(task.startedAt)}`}
            {task.startedAt && task.completedAt && " · "}
            {task.completedAt && `${t(lang, "completedLabel")}: ${formatClockTime(task.completedAt)}`}
            {task.durationSec != null &&
              ` · ${t(lang, "durationLabel")}: ${Math.round(task.durationSec / 60)} ${t(lang, "minutesShort")}`}
          </p>
        ) : timed && task.status === "IN_PROGRESS" ? (
          <>
            <ElapsedTimer startedAt={task.startedAt} className="mb-2 text-sm font-extrabold text-brand tabular-nums" />
            <div className="grid grid-cols-2 gap-1.5">
              <button
                disabled={isBusy}
                onClick={() => updateStatus(task.id, "DONE")}
                className="py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] bg-brand-success/10 text-brand-success hover:bg-brand-success/20"
              >
                {t(lang, "done")}
              </button>
              <button
                disabled={isBusy}
                onClick={() => openNotDone(task)}
                className="py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] bg-brand-critical/10 text-brand-critical hover:bg-brand-critical/20"
              >
                {t(lang, "notDone")}
              </button>
            </div>
          </>
        ) : timed ? (
          <div className="grid grid-cols-3 gap-1.5">
            <button
              disabled={isBusy}
              onClick={() => updateStatus(task.id, "IN_PROGRESS")}
              className="col-span-2 py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] bg-brand text-white hover:bg-brand-dark"
            >
              ▶ {t(lang, "startTask")}
            </button>
            <button
              disabled={isBusy}
              onClick={() => openNotDone(task)}
              className={`py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] ${
                task.status === "NOT_DONE"
                  ? "bg-brand-critical text-white"
                  : "bg-brand-critical/10 text-brand-critical hover:bg-brand-critical/20"
              }`}
            >
              {t(lang, "notDone")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            <button
              disabled={isBusy}
              onClick={() => updateStatus(task.id, "IN_PROGRESS")}
              className={`py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] ${
                task.status === "IN_PROGRESS"
                  ? "bg-brand-warning text-[#3a2a00]"
                  : "bg-brand-warning/10 text-[#8a5a00] hover:bg-brand-warning/20"
              }`}
            >
              {t(lang, "inProgress")}
            </button>
            <button
              disabled={isBusy}
              onClick={() => updateStatus(task.id, "DONE")}
              className={`py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] ${
                task.status === "DONE"
                  ? "bg-brand-success text-white"
                  : "bg-brand-success/10 text-brand-success hover:bg-brand-success/20"
              }`}
            >
              {t(lang, "done")}
            </button>
            <button
              disabled={isBusy}
              onClick={() => openNotDone(task)}
              className={`py-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] ${
                task.status === "NOT_DONE"
                  ? "bg-brand-critical text-white"
                  : "bg-brand-critical/10 text-brand-critical hover:bg-brand-critical/20"
              }`}
            >
              {t(lang, "notDone")}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderGridCard(task: Task) {
    const pill = staticBadge(task, lang);
    const isBusy = busyTaskId === task.id;
    const isUrgent = task.priority === "URGENT";
    const timed = task.durationTrackingEnabled === true;
    const notDoneClasses = (active: boolean) =>
      `w-full py-2 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all active:scale-[0.96] ${
        active ? "bg-brand-critical text-white" : "bg-brand-critical/10 text-brand-critical hover:bg-brand-critical/20"
      }`;

    return (
      <div
        key={task.id}
        data-task-id={task.id}
        data-task-status={task.status}
        className={`relative bg-white rounded-xl p-3 flex flex-col gap-2 ${
          isUrgent ? "border-2 border-brand-critical" : "border border-transparent"
        }`}
        style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
      >
        {task.selfAdded && (
          <button
            disabled={isBusy}
            onClick={() => removeSelfTask(task.id)}
            aria-label={t(lang, "removeTask")}
            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center text-brand-ink2/60 hover:text-brand-ink2 transition-colors text-base leading-none"
          >
            ×
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0 pr-4">
          <span className="text-lg shrink-0 w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
            {task.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-extrabold text-brand-darker truncate tracking-tight leading-tight">
              {task.title}
            </p>
            <p className="text-brand-ink2 text-[10px] font-semibold">{task.time}</p>
          </div>
        </div>

        {task.status === "NOT_STARTED" ? (
          <DueBadge
            task={task}
            lang={lang}
            className="self-start max-w-full truncate text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
          />
        ) : (
          pill && (
            <span
              className={`self-start max-w-full truncate text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${pill.classes}`}
            >
              {pill.emoji} {pill.label}
            </span>
          )
        )}

        {timed && task.status === "DONE" ? (
          task.durationSec != null && (
            <p className="text-[10px] font-semibold text-brand-ink2">
              {t(lang, "durationLabel")}: {Math.round(task.durationSec / 60)} {t(lang, "minutesShort")}
            </p>
          )
        ) : timed && task.status === "IN_PROGRESS" ? (
          <>
            <ElapsedTimer startedAt={task.startedAt} className="text-[11px] font-extrabold text-brand tabular-nums" />
            <div className="flex flex-col gap-1.5">
              <button
                disabled={isBusy}
                onClick={() => updateStatus(task.id, "DONE")}
                className="w-full py-2 rounded-full text-[10px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] bg-brand-success text-white hover:bg-brand-success/90"
              >
                {t(lang, "done")}
              </button>
              <button disabled={isBusy} onClick={() => openNotDone(task)} className={notDoneClasses(false)}>
                {t(lang, "notDone")}
              </button>
            </div>
          </>
        ) : timed ? (
          <div className="flex flex-col gap-1.5">
            <button
              disabled={isBusy}
              onClick={() => updateStatus(task.id, "IN_PROGRESS")}
              className="w-full py-2 rounded-full text-[10px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] bg-brand text-white hover:bg-brand-dark"
            >
              ▶ {t(lang, "startTask")}
            </button>
            <button
              disabled={isBusy}
              onClick={() => openNotDone(task)}
              className={notDoneClasses(task.status === "NOT_DONE")}
            >
              {t(lang, "notDone")}
            </button>
          </div>
        ) : task.status === "DONE" ? null : (
          <div className="flex flex-col gap-1.5">
            <button
              disabled={isBusy}
              onClick={() => updateStatus(task.id, "DONE")}
              className="w-full py-2 rounded-full text-[10px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.96] bg-brand-success text-white hover:bg-brand-success/90"
            >
              {t(lang, "done")}
            </button>
            <button
              disabled={isBusy}
              onClick={() => openNotDone(task)}
              className={notDoneClasses(task.status === "NOT_DONE")}
            >
              {t(lang, "notDone")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Board view: the same tap-based cards as the list view (Start/Done/Not
  // Done, duration timer, reason picker -- nothing new to learn), just split
  // into swipeable columns by status. Kept to three primary columns per the
  // "stay extremely simple" rule for the phone-first staff surface -- Not
  // Done tasks are a terminal state with nothing left to act on, so they're
  // surfaced as a small tap-to-expand count instead of a fourth column.
  function renderBoardView() {
    const tasks = data!.tasks;
    const columns: { status: TaskStatus; label: string }[] = [
      { status: "NOT_STARTED", label: t(lang, "notStarted") },
      { status: "IN_PROGRESS", label: t(lang, "inProgress") },
      { status: "DONE", label: t(lang, "done") },
    ];
    const notDoneTasks = tasks.filter((task) => task.status === "NOT_DONE");

    return (
      <div>
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1">
          {columns.map((col) => {
            const colTasks = tasks.filter((task) => task.status === col.status);
            return (
              <div key={col.status} className="min-w-[86%] sm:min-w-[320px] snap-start shrink-0">
                <div className="flex items-center gap-2 px-1 mb-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-brand-ink2">{col.label}</h3>
                  <span className="text-xs font-extrabold text-brand-ink2 tabular-nums">{colTasks.length}</span>
                </div>
                <div className="space-y-3">
                  {colTasks.length === 0 && (
                    <p className="text-center text-brand-ink2/60 text-sm py-8">{t(lang, "noTasks")}</p>
                  )}
                  {colTasks.map((task) => renderListCard(task))}
                </div>
              </div>
            );
          })}
        </div>

        {notDoneTasks.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowNotDone((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-brand-critical/10 text-brand-critical font-bold text-sm"
              aria-expanded={showNotDone}
            >
              <span>
                🔴 {notDoneTasks.length} {t(lang, "notDone")}
              </span>
              <span>{showNotDone ? "▲" : "▼"}</span>
            </button>
            {showNotDone && <div className="space-y-3 mt-3">{notDoneTasks.map((task) => renderListCard(task))}</div>}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <main className="flex-1 bg-brand-surface pb-10">
        <header className="bg-brand-darker px-5 pt-8 pb-6">
          <div className="max-w-lg mx-auto animate-pulse">
            <div className="h-3 w-24 rounded-full bg-white/10 mb-2" />
            <div className="h-7 w-40 rounded-full bg-white/10" />
            <div className="h-2 w-full rounded-full bg-white/10 mt-8" />
          </div>
        </header>
        <div className="px-4 mt-5 space-y-3 max-w-lg mx-auto">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </main>
    );
  }

  if (loadError || !data) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-brand-surface px-6 text-center">
        <div className="text-5xl mb-4">📶</div>
        <p className="text-xl text-brand-darker mb-6 max-w-xs font-medium">{t(lang, "somethingWrong")}</p>
        <button
          onClick={load}
          className="bg-brand hover:bg-brand-dark transition-colors text-white text-base font-extrabold uppercase tracking-wide px-8 py-4 rounded-xl active:scale-[0.98]"
        >
          {t(lang, "tryAgain")}
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-brand-surface pb-10">
      <header className="bg-brand-darker text-white px-5 pt-8 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-brand-ink2 text-xs font-bold uppercase tracking-wider">
                {t(lang, greeting)}
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight mt-0.5">{data.name}</h1>
            </div>
            <LiveClock variant="dark" />
          </div>

          <div className="flex items-center justify-between gap-2 mt-4">
            <Link
              href="/staff/history"
              className="text-xs font-bold uppercase tracking-wide bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-lg"
            >
              📅 {t(lang, "history")}
            </Link>
            <button
              onClick={signOut}
              className="text-xs font-bold uppercase tracking-wide bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-lg"
            >
              {t(lang, "signOut")}
            </button>
          </div>

          <div className="flex gap-2 mt-4">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => changeLang(l.code)}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  lang === l.code
                    ? "bg-white text-brand-darker border-white font-bold"
                    : "border-white/20 text-white/70 hover:border-white/40"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-xs font-bold uppercase tracking-wide mb-2 text-brand-ink2">
              <span>{t(lang, "todaysWork")}</span>
              <span className="text-white">
                {data.done} / {data.total} {t(lang, "completed")}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-success rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 mt-5 max-w-lg mx-auto">
        <StaffMiniDashboard lang={lang} />
      </div>

      <div className="px-4 mt-4 space-y-3 max-w-lg mx-auto">
        {actionError && (
          <div className="flex items-center justify-between gap-3 bg-white border-l-4 border-brand-critical text-brand-darker rounded-xl px-4 py-3">
            <span className="text-sm font-medium">{t(lang, "couldNotSave")}</span>
            <button onClick={() => setActionError(false)} className="font-bold text-lg leading-none">
              ×
            </button>
          </div>
        )}

        <div className="flex items-center justify-end">
          <div
            className="flex gap-1 bg-white rounded-full p-1"
            style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
          >
            <button
              type="button"
              onClick={() => changeView("list")}
              aria-label={t(lang, "viewList")}
              aria-pressed={view === "list"}
              className={`w-9 h-8 rounded-full text-sm flex items-center justify-center transition-colors ${
                view === "list" ? "bg-brand text-white" : "text-brand-ink2 hover:bg-brand/10"
              }`}
            >
              ☰
            </button>
            <button
              type="button"
              onClick={() => changeView("grid")}
              aria-label={t(lang, "viewGrid")}
              aria-pressed={view === "grid"}
              className={`w-9 h-8 rounded-full text-sm flex items-center justify-center transition-colors ${
                view === "grid" ? "bg-brand text-white" : "text-brand-ink2 hover:bg-brand/10"
              }`}
            >
              ▦
            </button>
            <button
              type="button"
              onClick={() => changeView("board")}
              aria-label={t(lang, "viewBoard")}
              aria-pressed={view === "board"}
              className={`w-9 h-8 rounded-full text-sm flex items-center justify-center transition-colors ${
                view === "board" ? "bg-brand text-white" : "text-brand-ink2 hover:bg-brand/10"
              }`}
            >
              🗂
            </button>
          </div>
        </div>

        {data.tasks.length === 0 && (
          <EmptyState title={t(lang, "noTasks")} hint={t(lang, "noTasksHint")} />
        )}

        {view === "board" ? (
          data.tasks.length > 0 && renderBoardView()
        ) : (
          <div className={view === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" : "space-y-3"}>
            {data.tasks.map((task) => (view === "grid" ? renderGridCard(task) : renderListCard(task)))}
          </div>
        )}

        <button
          onClick={openAddTask}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-brand hover:bg-brand-dark transition-colors text-white font-extrabold uppercase tracking-wide text-sm active:scale-[0.98]"
        >
          ➕ {t(lang, "addTask")}
        </button>
      </div>

      <ExtraWorkPanel lang={lang} />

      {showAddTask && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4">
          <form
            onSubmit={submitNewTask}
            className="bg-white rounded-2xl w-full max-w-sm p-5"
          >
            <h2 className="text-xl font-extrabold text-brand-darker mb-1 tracking-tight">{t(lang, "addTask")}</h2>
            <p className="text-brand-ink2 text-sm mb-4 font-medium">{t(lang, "addTaskPrompt")}</p>

            {addTaskError && (
              <div className="mb-3 rounded-lg bg-brand-critical/10 text-brand-critical px-3 py-2 text-sm font-medium">
                {addTaskError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewTaskIcon(icon)}
                  className={`text-xl w-11 h-11 rounded-xl flex items-center justify-center border-2 transition-colors ${
                    newTaskIcon === icon
                      ? "border-brand bg-brand/10"
                      : "border-transparent bg-brand-surface hover:bg-brand/5"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>

            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={t(lang, "taskTitlePlaceholder")}
              className="w-full rounded-xl bg-brand-surface px-4 py-3 mb-4 text-base font-medium border-2 border-transparent focus:border-brand focus:outline-none transition-colors"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddTask(false)}
                className="flex-1 py-3 rounded-xl bg-brand-surface font-bold uppercase tracking-wide text-sm text-brand-ink2 transition-colors hover:bg-brand/5"
              >
                {t(lang, "cancel")}
              </button>
              <button
                type="submit"
                disabled={!newTaskTitle.trim() || addingTask}
                className="flex-1 py-3 rounded-xl bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold uppercase tracking-wide text-sm transition-colors"
              >
                {addingTask ? t(lang, "saving") : t(lang, "submit")}
              </button>
            </div>
          </form>
        </div>
      )}

      {reasonTask && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h2 className="text-xl font-extrabold text-brand-darker mb-4 tracking-tight">{t(lang, "whyNotDone")}</h2>
            <div className="space-y-2 mb-4">
              {REASON_KEYS.map((key, idx) => (
                <button
                  key={key}
                  onClick={() => confirmNotDone(idx)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-brand-surface hover:bg-brand/10 transition-colors text-base font-semibold text-brand-darker"
                >
                  {t(lang, key)}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(lang, "addNote")}
              className="w-full rounded-xl bg-brand-surface px-4 py-3 mb-3 text-base font-medium border-2 border-transparent focus:border-brand focus:outline-none transition-colors"
            />
            <button
              onClick={() => setReasonTask(null)}
              className="w-full py-3 rounded-xl font-bold uppercase tracking-wide text-sm text-brand-ink2 hover:bg-brand-surface transition-colors"
            >
              {t(lang, "cancel")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
