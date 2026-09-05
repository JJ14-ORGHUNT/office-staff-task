"use client";

import { useEffect, useState } from "react";
import { SkeletonRowList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

type TaskRow = {
  id: string;
  title: string;
  icon: string;
  type: string;
  priority: string;
  scheduledTimes: string;
  recurrenceDays: string | null;
  recurrenceDayOfMonth: number | null;
  specialDate: string | null;
  reminderMinutesBefore: number;
  durationTrackingEnabled: boolean;
  active: boolean;
  department: string | null;
  location: string | null;
  assignees: { id: string; name: string }[];
};

type Employee = { id: string; name: string; role: string; active: boolean };

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const emptyForm = {
  title: "",
  icon: "📋",
  type: "DAILY",
  priority: "NORMAL",
  scheduledTimes: "09:00",
  recurrenceDays: [] as number[],
  recurrenceDayOfMonth: 1,
  specialDate: "",
  reminderMinutesBefore: 15,
  durationTrackingEnabled: false,
  assigneeIds: [] as string[],
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  async function loadAll() {
    setLoading(true);
    setLoadError(false);
    try {
      const [taskRes, empRes] = await Promise.all([
        fetch("/api/admin/tasks"),
        fetch("/api/admin/employees"),
      ]);
      if (!taskRes.ok || !empRes.ok) throw new Error("Request failed");
      const t = await taskRes.json();
      const e = await empRes.json();
      setTasks(t.tasks ?? []);
      setEmployees((e.users ?? []).filter((u: Employee) => u.active));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadAll();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEdit(task: TaskRow) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      icon: task.icon,
      type: task.type,
      priority: task.priority,
      scheduledTimes: task.scheduledTimes,
      recurrenceDays: task.recurrenceDays ? task.recurrenceDays.split(",").map(Number) : [],
      recurrenceDayOfMonth: task.recurrenceDayOfMonth ?? 1,
      specialDate: task.specialDate ? task.specialDate.slice(0, 10) : "",
      reminderMinutesBefore: task.reminderMinutesBefore,
      durationTrackingEnabled: task.durationTrackingEnabled,
      assigneeIds: task.assignees.map((a) => a.id),
    });
    setError("");
    setShowForm(true);
  }

  function toggleWeekday(day: number) {
    setForm((f) => ({
      ...f,
      recurrenceDays: f.recurrenceDays.includes(day)
        ? f.recurrenceDays.filter((d) => d !== day)
        : [...f.recurrenceDays, day],
    }));
  }

  function toggleAssignee(id: string) {
    setForm((f) => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(id)
        ? f.assigneeIds.filter((a) => a !== id)
        : [...f.assigneeIds, id],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const payload = {
      title: form.title,
      icon: form.icon,
      type: form.type,
      priority: form.priority,
      scheduledTimes: form.scheduledTimes,
      recurrenceDays: form.type === "WEEKLY" ? form.recurrenceDays.join(",") : null,
      recurrenceDayOfMonth: form.type === "MONTHLY" ? form.recurrenceDayOfMonth : null,
      specialDate: form.type === "ONE_TIME" || form.type === "SPECIAL" ? form.specialDate : null,
      reminderMinutesBefore: form.reminderMinutesBefore,
      durationTrackingEnabled: form.durationTrackingEnabled,
      assigneeIds: form.assigneeIds,
    };

    const url = editingId ? `/api/admin/tasks/${editingId}` : "/api/admin/tasks";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Could not save task.");
      return;
    }

    setShowForm(false);
    loadAll();
  }

  async function archiveTask(id: string) {
    await fetch(`/api/admin/tasks/${id}`, { method: "DELETE" });
    loadAll();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-extrabold text-brand-darker tracking-tight">Tasks</h1>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark transition-colors text-white font-extrabold uppercase tracking-wide text-sm px-4 py-2.5 rounded-xl active:scale-[0.98] shrink-0"
        >
          + Add Task
        </button>
      </div>

      <div className="bg-white rounded-2xl" style={{ boxShadow: "0 1px 2px rgba(22,19,42,0.06)" }}>
        {loading ? (
          <SkeletonRowList count={5} />
        ) : loadError ? (
          <div className="py-10 text-center">
            <p className="text-brand-darker font-medium mb-4">Something went wrong. Please try again.</p>
            <button
              onClick={loadAll}
              className="bg-brand hover:bg-brand-dark transition-colors text-white text-sm font-extrabold uppercase tracking-wide px-6 py-3 rounded-xl active:scale-[0.98]"
            >
              Try Again
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks yet" hint="Add your first task to start building the daily checklist." />
        ) : (
          <>
            {/* Desktop/tablet: full table. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left min-w-[720px]">
                <thead className="text-brand-ink2 text-xs font-bold uppercase tracking-wide border-b border-black/5">
                  <tr>
                    <th className="px-5 py-3">Task</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Priority</th>
                    <th className="px-5 py-3">Assigned To</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-brand-surface/70 transition-colors">
                      <td className="px-5 py-3 font-bold text-brand-darker">
                        {task.icon} {task.title}
                        {task.durationTrackingEnabled && (
                          <span
                            title="Duration tracking enabled"
                            className="ml-2 text-[11px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand/10 text-brand align-middle"
                          >
                            ⏱ Timed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-brand-ink2 font-medium">{task.type}</td>
                      <td className="px-5 py-3 text-brand-ink2">{task.scheduledTimes}</td>
                      <td className="px-5 py-3">
                        {task.priority === "URGENT" ? (
                          <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-critical/10 text-brand-critical">Urgent</span>
                        ) : task.priority === "HIGH" ? (
                          <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-warning/15 text-[#8a5a00]">High</span>
                        ) : (
                          <span className="text-brand-ink2 text-sm font-medium">Normal</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-brand-ink2">
                        {task.assignees.map((a) => a.name).join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3 text-right space-x-3 whitespace-nowrap">
                        <button onClick={() => openEdit(task)} className="text-brand hover:text-brand-dark font-bold text-sm transition-colors">
                          Edit
                        </button>
                        <button onClick={() => archiveTask(task.id)} className="text-brand-ink2 hover:text-brand-darker font-bold text-sm transition-colors">
                          Archive
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards, same data, no horizontal scrolling. */}
            <div className="md:hidden divide-y divide-black/5">
              {tasks.map((task) => (
                <div key={task.id} className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="font-extrabold text-brand-darker truncate">
                      {task.icon} {task.title}
                    </p>
                    {task.priority === "URGENT" ? (
                      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-critical/10 text-brand-critical">Urgent</span>
                    ) : task.priority === "HIGH" ? (
                      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-warning/15 text-[#8a5a00]">High</span>
                    ) : null}
                  </div>
                  {task.durationTrackingEnabled && (
                    <span className="inline-block mb-2 text-[11px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand/10 text-brand">
                      ⏱ Timed
                    </span>
                  )}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm mb-3">
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Type</dt>
                    <dd className="text-brand-darker font-medium">{task.type}</dd>
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Time</dt>
                    <dd className="text-brand-darker font-medium">{task.scheduledTimes}</dd>
                    <dt className="text-brand-ink2 text-[11px] font-bold uppercase tracking-wide">Assigned To</dt>
                    <dd className="text-brand-darker font-medium">
                      {task.assignees.map((a) => a.name).join(", ") || "—"}
                    </dd>
                  </dl>
                  <div className="flex gap-4">
                    <button onClick={() => openEdit(task)} className="text-brand hover:text-brand-dark font-bold text-sm transition-colors">
                      Edit
                    </button>
                    <button onClick={() => archiveTask(task.id)} className="text-brand-ink2 hover:text-brand-darker font-bold text-sm transition-colors">
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
          <form
            onSubmit={submit}
            className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-extrabold text-brand-darker tracking-tight mb-4">
              {editingId ? "Edit Task" : "Add Task"}
            </h2>

            {error && (
              <div className="mb-3 rounded-lg bg-brand-critical/10 text-brand-critical px-3 py-2 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-20">
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Icon</label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 text-center text-xl border-2 border-transparent focus:border-brand focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Task Title</label>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Repeat</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                  >
                    <option value="DAILY">Every day</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="ONE_TIME">One time</option>
                    <option value="SPECIAL">Special day</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                  Time(s) — 24h, comma separated (e.g. 09:00,14:00)
                </label>
                <input
                  required
                  value={form.scheduledTimes}
                  onChange={(e) => setForm({ ...form, scheduledTimes: e.target.value })}
                  className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                />
              </div>

              {form.type === "WEEKLY" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">On these days</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => (
                      <button
                        type="button"
                        key={d.value}
                        onClick={() => toggleWeekday(d.value)}
                        className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                          form.recurrenceDays.includes(d.value)
                            ? "bg-brand text-white"
                            : "bg-brand-surface text-brand-ink2 hover:bg-brand/10"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.type === "MONTHLY" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Day of month</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.recurrenceDayOfMonth}
                    onChange={(e) =>
                      setForm({ ...form, recurrenceDayOfMonth: Number(e.target.value) })
                    }
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                  />
                </div>
              )}

              {(form.type === "ONE_TIME" || form.type === "SPECIAL") && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Date</label>
                  <input
                    type="date"
                    required
                    value={form.specialDate}
                    onChange={(e) => setForm({ ...form, specialDate: e.target.value })}
                    className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                  Reminder (minutes before)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.reminderMinutesBefore}
                  onChange={(e) =>
                    setForm({ ...form, reminderMinutesBefore: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-brand-surface px-3 py-2.5 border-2 border-transparent focus:border-brand focus:outline-none transition-colors font-medium"
                />
              </div>

              <label className="flex items-center gap-2.5 bg-brand-surface rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-darker cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.durationTrackingEnabled}
                  onChange={(e) => setForm({ ...form, durationTrackingEnabled: e.target.checked })}
                  className="accent-brand"
                />
                Track START → DONE duration for this task
              </label>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">Assign To</label>
                <div className="bg-brand-surface rounded-lg max-h-40 overflow-y-auto divide-y divide-black/5">
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-darker">
                      <input
                        type="checkbox"
                        checked={form.assigneeIds.includes(emp.id)}
                        onChange={() => toggleAssignee(emp.id)}
                        className="accent-brand"
                      />
                      {emp.name}
                      <span className="text-brand-ink2">({emp.role})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl bg-brand-surface font-bold uppercase tracking-wide text-sm text-brand-ink2 hover:bg-brand/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold uppercase tracking-wide text-sm transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
