// Computes a task's live due-state badge from its scheduled time, current
// status, and the current wall-clock time. Pure function — callers must
// supply `now` (from the shared `useNow()` tick), never read `new Date()`
// here so this stays safe to call during render.

export type DueState = "UPCOMING" | "DUE_NOW" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";

const GRACE_MINUTES = 15;

export function computeDueState(params: {
  scheduledTime: string | null | undefined; // "HH:MM"
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_DONE";
  now: Date;
}): DueState | null {
  const { scheduledTime, status, now } = params;

  if (status === "DONE") return "COMPLETED";
  if (status === "NOT_DONE") return null; // uses its own dedicated pill
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (!scheduledTime) return null;

  const [h, m] = scheduledTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);

  const diffMin = (now.getTime() - scheduled.getTime()) / 60000;
  if (diffMin > GRACE_MINUTES) return "OVERDUE";
  if (diffMin >= -GRACE_MINUTES) return "DUE_NOW";
  return "UPCOMING";
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
