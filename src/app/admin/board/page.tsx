"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePolling } from "@/lib/usePolling";
import { useNow } from "@/lib/useNow";
import { computeDueState, formatElapsed } from "@/lib/dueState";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

const POLL_INTERVAL_MS = 10000;

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_DONE";

type BoardTask = {
  id: string;
  title: string;
  icon: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  scheduledTime: string;
  status: TaskStatus;
  notDoneReason: string | null;
  selfAdded: boolean;
  durationTrackingEnabled: boolean;
  startedAt: string | null;
  completedAt: string | null;
  durationSec: number | null;
  userId: string;
  userName: string;
  departmentId: string | null;
  departmentName: string | null;
};

type Employee = { id: string; name: string; active: boolean };
type Department = { id: string; name: string };

// Kept local rather than imported from src/lib/tasks -- that module also
// exports the (server-only, better-sqlite3-backed) prisma client, which must
// never end up in a client bundle. StaffTaskList.tsx duplicates the same list
// for the same reason.
const REASONS = [
  "No time",
  "Material not available",
  "Someone else was using the area",
  "Could not complete",
  "Other",
];

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: "NOT_STARTED", label: "Not Started", accent: "bg-brand-ink2" },
  { key: "IN_PROGRESS", label: "In Progress", accent: "bg-brand-warning" },
  { key: "DONE", label: "Done", accent: "bg-brand-success" },
  { key: "NOT_DONE", label: "Not Done", accent: "bg-brand-critical" },
];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Self-ticking card -- owns its own useNow() tick (same "owns its own
// interval" pattern as LiveClock) instead of reading a `now` lifted into the
// page's own state, so a clock tick re-renders just this one card, never the
// whole board (filters, drag state, all sibling columns). Only NOT_STARTED/
// IN_PROGRESS cards need the tick at all (for due-state/elapsed), and only a
// running timed task needs per-second precision -- everything else ticks
// slowly enough (30s) to be effectively free.
function BoardCard({
  task,
  draggedId,
  onDragStart,
  onDragEnd,
  onRequestMove,
}: {
  task: BoardTask;
  draggedId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRequestMove: (id: string, status: TaskStatus) => void;
}) {
  const isRunningTimer = task.durationTrackingEnabled && task.status === "IN_PROGRESS";
  const needsDueTick = task.status === "NOT_STARTED" || task.status === "IN_PROGRESS";
  const now = useNow(isRunningTimer ? 1000 : needsDueTick ? 30000 : 86400000);

  const isUrgent = task.priority === "URGENT";
  const due =
    now && needsDueTick ? computeDueState({ scheduledTime: task.scheduledTime, status: task.status, now }) : null;
  const isOverdue = due === "OVERDUE";
  const elapsedSec =
    isRunningTimer && task.startedAt && now ? (now.getTime() - new Date(task.startedAt).getTime()) / 1000 : 0;

  return (
    <div
      key={task.id}
      data-task-id={task.id}
      data-task-status={task.status}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-xl p-3 cursor-grab active:cursor-grabbing transition-opacity ${
        draggedId === task.id ? "opacity-40" : "opacity-100"
      } ${isUrgent ? "border-2 border-brand-critical" : isOverdue ? "border-2 border-brand-critical/60" : "border border-transparent"}`}
      style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0 w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
            {task.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-brand-darker truncate tracking-tight leading-tight">
              {task.title}
            </p>
            <p className="text-brand-ink2 text-[11px] font-semibold">{task.scheduledTime}</p>
          </div>
        </div>
        <span className="text-brand-ink2/50 text-sm leading-none shrink-0" aria-hidden>
          ⠿
        </span>
      </div>

      <p className="text-[11px] font-bold text-brand truncate mb-1.5">👤 {task.userName}</p>

      {isOverdue && (
        <span className="inline-block text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand-critical/10 text-brand-critical mb-1.5">
          ⏰ Overdue
        </span>
      )}

      {task.status === "IN_PROGRESS" && task.durationTrackingEnabled && (
        <p className="text-[11px] font-extrabold text-brand tabular-nums mb-1.5">
          ⏱ {formatElapsed(elapsedSec)}
        </p>
      )}

      {task.status === "DONE" && task.durationSec != null && (
        <p className="text-[10px] font-semibold text-brand-ink2 mb-1.5">
          Took {Math.round(task.durationSec / 60)} min
        </p>
      )}

      {task.status === "NOT_DONE" && task.notDoneReason && (
        <p className="text-[10px] font-semibold text-brand-critical mb-1.5 truncate">
          Reason: {task.notDoneReason}
        </p>
      )}

      <select
        aria-label={`Move ${task.title}`}
        value={task.status}
        onChange={(e) => onRequestMove(task.id, e.target.value as TaskStatus)}
        className="w-full text-[10px] font-bold uppercase tracking-wide rounded-lg bg-brand-surface px-2 py-1.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors"
      >
        {COLUMNS.map((c) => (
          <option key={c.key} value={c.key}>
            Move to: {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function AdminBoardPage() {
  const [date, setDate] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [pendingNotDone, setPendingNotDone] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Filters (and "today") can only be known post-mount -- see the
  // hydration-safety rule in AGENTS.md/README. Also picks up a `?employeeId=`
  // link from the dashboard's Attention Required panel.
  useEffect(() => {
    const t = today();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial "today" derived once after mount (new Date() is render-unsafe); SSR/first paint render the loading state
    setDate(t);
    setTodayDate(t);
    const fromQuery = new URLSearchParams(window.location.search).get("employeeId");
    if (fromQuery) setEmployeeId(fromQuery);
  }, []);

  useEffect(() => {
    async function loadFilters() {
      const [empRes, deptRes] = await Promise.all([
        fetch("/api/admin/employees"),
        fetch("/api/admin/departments"),
      ]);
      const emp = await empRes.json().catch(() => ({}));
      const dept = await deptRes.json().catch(() => ({}));
      setEmployees((emp.users ?? []).filter((u: Employee) => u.active));
      setDepartments(dept.departments ?? []);
    }
    loadFilters();
  }, []);

  // Guards against a slow response for a previously-selected date/employee/
  // department landing after a newer filter change and silently overwriting
  // the board with stale data: each call aborts whatever fetch is still in
  // flight before starting its own, and a response for an aborted request
  // never touches state.
  const loadBoardAbortRef = useRef<AbortController | null>(null);

  const loadBoard = useCallback(async () => {
    if (!date) return;
    loadBoardAbortRef.current?.abort();
    const controller = new AbortController();
    loadBoardAbortRef.current = controller;
    try {
      const params = new URLSearchParams({ date });
      if (employeeId) params.set("employeeId", employeeId);
      if (departmentId) params.set("departmentId", departmentId);
      const res = await fetch(`/api/admin/board?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      setTasks(json.tasks ?? []);
      setLoadError(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoadError(true);
    } finally {
      if (loadBoardAbortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [date, employeeId, departmentId]);

  useEffect(() => {
    if (!date) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous "start spinner" flag before the async loadBoard() fetch below settles it
    setLoading(true);
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, employeeId, departmentId]);

  // Only worth polling live when the board is showing today -- past dates are
  // immutable once created (see TaskInstance/DailySnapshot comments) so
  // there's nothing that could change under a historical view.
  usePolling(loadBoard, POLL_INTERVAL_MS, date !== "" && date === todayDate);

  async function applyStatusChange(taskId: string, status: TaskStatus, reason?: string, noteText?: string) {
    const prevTasks = tasks;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/admin/tasks/instance/${taskId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason, note: noteText }),
      });
      if (!res.ok) {
        setTasks(prevTasks);
        setActionError("Could not update that task. Please try again.");
        return;
      }
      const json = await res.json();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: json.status,
                startedAt: json.startedAt,
                completedAt: json.completedAt,
                durationSec: json.durationSec,
                notDoneReason: status === "NOT_DONE" ? reason ?? "Other" : t.notDoneReason,
              }
            : t,
        ),
      );
      setActionError("");
    } catch {
      setTasks(prevTasks);
      setActionError("Could not update that task. Please try again.");
    }
  }

  function requestMove(taskId: string, targetStatus: TaskStatus) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;
    if (targetStatus === "NOT_DONE") {
      setNote("");
      setPendingNotDone(taskId);
      return;
    }
    applyStatusChange(taskId, targetStatus);
  }

  function confirmNotDone(reason: string) {
    if (!pendingNotDone) return;
    const taskId = pendingNotDone;
    setPendingNotDone(null);
    applyStatusChange(taskId, "NOT_DONE", reason, note);
  }

  function handleDrop(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault();
    setDragOverColumn(null);
    const id = e.dataTransfer.getData("text/plain") || draggedId;
    if (id) requestMove(id, targetStatus);
    setDraggedId(null);
  }

  const grouped: Record<TaskStatus, BoardTask[]> = {
    NOT_STARTED: [],
    IN_PROGRESS: [],
    DONE: [],
    NOT_DONE: [],
  };
  for (const task of tasks) grouped[task.status].push(task);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight">Task Board</h1>
          <p className="text-brand-ink2 text-sm font-medium">Drag a card between columns, or use its menu.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white rounded-2xl p-3" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-brand-ink2 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg bg-brand-surface px-3 py-2 text-sm border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-brand-ink2 mb-1">Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg bg-brand-surface px-3 py-2 text-sm border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-brand-ink2 mb-1">Department</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded-lg bg-brand-surface px-3 py-2 text-sm border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {(employeeId || departmentId) && (
          <button
            onClick={() => {
              setEmployeeId("");
              setDepartmentId("");
            }}
            className="self-end text-xs font-bold uppercase tracking-wide text-brand hover:text-brand-dark transition-colors px-2 py-2"
          >
            Clear filters
          </button>
        )}
        <Link
          href="/admin"
          className="self-end ml-auto text-xs font-bold uppercase tracking-wide text-brand-ink2 hover:text-brand-darker transition-colors px-2 py-2"
        >
          ← Dashboard
        </Link>
      </div>

      {actionError && (
        <div className="flex items-center justify-between gap-3 bg-white border-l-4 border-brand-critical text-brand-darker rounded-xl px-4 py-3 mb-4">
          <span className="text-sm font-medium">{actionError}</span>
          <button onClick={() => setActionError("")} className="font-bold text-lg leading-none">
            ×
          </button>
        </div>
      )}

      {loading && (
        <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="grid grid-cols-4 gap-3 min-w-[900px] sm:min-w-0">
            {COLUMNS.map((col) => (
              <div key={col.key} className="rounded-2xl p-2.5 bg-brand-surface min-h-[200px]">
                <Skeleton className="h-3 w-20 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && loadError && (
        <div className="bg-white rounded-2xl py-10 text-center" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
          <p className="text-brand-darker font-medium mb-4">Something went wrong. Please try again.</p>
          <button
            onClick={loadBoard}
            className="bg-brand hover:bg-brand-dark transition-colors text-white text-sm font-extrabold uppercase tracking-wide px-6 py-3 rounded-xl active:scale-[0.98]"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="grid grid-cols-4 gap-3 min-w-[900px] sm:min-w-0">
            {COLUMNS.map((col) => {
              const columnTasks = grouped[col.key];
              return (
                <div
                  key={col.key}
                  data-column={col.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverColumn(col.key);
                  }}
                  onDragLeave={() => setDragOverColumn((c) => (c === col.key ? null : c))}
                  onDrop={(e) => handleDrop(e, col.key)}
                  className={`rounded-2xl p-2.5 min-h-[200px] transition-colors ${
                    dragOverColumn === col.key ? "bg-brand/10" : "bg-brand-surface"
                  }`}
                >
                  <div className="flex items-center gap-2 px-1.5 py-1.5 mb-2">
                    <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                    <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-brand-ink2">
                      {col.label}
                    </h2>
                    <span className="ml-auto text-[11px] font-extrabold text-brand-ink2 tabular-nums">
                      {columnTasks.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {columnTasks.length === 0 && <EmptyState title="No tasks" compact />}
                    {columnTasks.map((task) => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        draggedId={draggedId}
                        onDragStart={setDraggedId}
                        onDragEnd={() => setDraggedId(null)}
                        onRequestMove={requestMove}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingNotDone && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h2 className="text-xl font-extrabold text-brand-darker mb-4 tracking-tight">Why was this not completed?</h2>
            <div className="space-y-2 mb-4">
              {REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => confirmNotDone(reason)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-brand-surface hover:bg-brand/10 transition-colors text-base font-semibold text-brand-darker"
                >
                  {reason}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a short note (optional)"
              className="w-full rounded-xl bg-brand-surface px-4 py-3 mb-3 text-base font-medium border-2 border-transparent focus:border-brand focus:outline-none transition-colors"
            />
            <button
              onClick={() => setPendingNotDone(null)}
              className="w-full py-3 rounded-xl font-bold uppercase tracking-wide text-sm text-brand-ink2 hover:bg-brand-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
