import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { TaskTemplateModel } from "@/generated/prisma/models";

// Single source of truth for "what timezone does this business run on". All
// "what day is it" / "what date does this belong to" computations must go
// through this (via todayStr below), not through the server process's local
// timezone (which may not match the business at all, e.g. in production
// hosting). Overridable via env for future multi-region support; defaults to
// this app's India-context seed data (Ramesh Kumar, Suresh Babu, ...).
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Asia/Kolkata";

/**
 * Returns the current (or given) instant's calendar date, as "YYYY-MM-DD", in
 * BUSINESS_TIMEZONE -- not the server process's local timezone. This is the
 * one place "today" is computed for all business-logic purposes (task
 * generation, snapshot caching, etc). Client-side "now vs. scheduled time"
 * due-state badges (src/lib/dueState.ts) are a deliberately different,
 * correct concern -- those compare against the *visitor's* own clock -- and
 * must not be routed through this function.
 */
export function todayStr(d: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD directly, so no manual arithmetic
  // (and no local-timezone getters) is needed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Parses a plain "YYYY-MM-DD" string into an explicit UTC-midnight Date for
 * that calendar date. Use this (never the ambiguous `new Date(str)`) when a
 * date-only string needs to be stored in a DateTime column, so the stored
 * instant is unambiguous regardless of server timezone. Pairs with reading
 * the value back out via UTC getters (see the SPECIAL/ONE_TIME branch below).
 */
export function parseDateOnlyUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function templateAppliesOnDate(template: TaskTemplateModel, dateStr: string): boolean {
  const date = new Date(`${dateStr}T00:00:00`);
  const weekday = date.getDay(); // 0=Sun..6=Sat
  const dayOfMonth = date.getDate();

  switch (template.type) {
    case "DAILY": {
      if (!template.recurrenceDays) return true;
      const days = template.recurrenceDays.split(",").map(Number);
      return days.includes(weekday);
    }
    case "WEEKLY": {
      if (!template.recurrenceDays) return false;
      const days = template.recurrenceDays.split(",").map(Number);
      return days.includes(weekday);
    }
    case "MONTHLY": {
      if (template.recurrenceDayOfMonth == null) return false;
      // Clamp to the month's last day so a template configured for e.g. day
      // 31 still fires in shorter months (September has 30, February has
      // 28/29) instead of silently never matching that month at all. Do NOT
      // "simplify" this back to a plain equality check.
      const daysInThisMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const effectiveDay = Math.min(template.recurrenceDayOfMonth, daysInThisMonth);
      return dayOfMonth === effectiveDay;
    }
    case "ONE_TIME":
    case "SPECIAL": {
      if (!template.specialDate) return false;
      // specialDate is written via parseDateOnlyUTC as an explicit
      // UTC-midnight instant, so it must be read back with UTC getters to
      // match -- local getters would shift the calendar date whenever the
      // server's local offset is negative. This is deliberately NOT run
      // through the BUSINESS_TIMEZONE-aware todayStr(): the stored value is
      // a UTC-anchored calendar date, not a business-local "now".
      const sd = template.specialDate;
      const y = sd.getUTCFullYear();
      const m = String(sd.getUTCMonth() + 1).padStart(2, "0");
      const day = String(sd.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}` === dateStr;
    }
    default:
      return false;
  }
}

/** Ensures TaskInstance rows exist for every applicable, assigned task for this user on this date. */
export async function ensureTaskInstancesForUser(userId: string, dateStr: string) {
  const assignments = await prisma.taskAssignment.findMany({
    where: { userId, taskTemplate: { active: true, archived: false } },
    include: { taskTemplate: true },
  });

  const applicable = assignments
    .map((a) => a.taskTemplate)
    .filter((t) => templateAppliesOnDate(t, dateStr));
  if (applicable.length === 0) return;

  const wanted: { template: TaskTemplateModel; time: string }[] = [];
  for (const template of applicable) {
    const times = template.scheduledTimes.split(",").map((t) => t.trim()).filter(Boolean);
    for (const time of times) wanted.push({ template, time });
  }

  // Diff against what already exists in a single query instead of one
  // findUnique per (template, time) pair -- that was an N+1 read fired on
  // almost every page load (staff checklist, admin dashboard/board polling)
  // even in the steady-state case where nothing actually needs creating.
  // Also select enough to detect stale instances below (Bug 5).
  const existing = await prisma.taskInstance.findMany({
    where: { userId, date: dateStr, taskTemplateId: { in: applicable.map((t) => t.id) } },
    select: {
      id: true,
      taskTemplateId: true,
      scheduledTime: true,
      status: true,
      startedAt: true,
      completedAt: true,
      notDoneReason: true,
    },
  });
  const existingKeys = new Set(existing.map((e) => `${e.taskTemplateId}|${e.scheduledTime}`));
  const wantedKeys = new Set(wanted.map(({ template, time }) => `${template.id}|${time}`));

  const missing = wanted.filter(({ template, time }) => !existingKeys.has(`${template.id}|${time}`));

  // A template edit (e.g. changing scheduledTimes) can leave instances
  // behind at times the template no longer schedules. Clean those up, but
  // ONLY when they're still fully untouched (NOT_STARTED, never started,
  // completed, or marked not-done) -- an instance with any real work history
  // is never deleted, even once it's "stale" per the current template
  // definition, because this app treats TaskInstance history as immutable
  // once work has begun. A stale-but-touched instance is left behind as a
  // harmless historical artifact rather than a live duplicate -- an
  // acceptable tradeoff given the immutability constraint.
  const staleIds = existing
    .filter(
      (e) =>
        !wantedKeys.has(`${e.taskTemplateId}|${e.scheduledTime}`) &&
        e.status === "NOT_STARTED" &&
        !e.startedAt &&
        !e.completedAt &&
        !e.notDoneReason,
    )
    .map((e) => e.id);

  if (missing.length === 0 && staleIds.length === 0) return;

  // Copy each template's *current* title/icon onto the instance at creation
  // time so later edits to the template never rewrite already-created,
  // possibly-completed, historical records (immutability requirement). IDs
  // are generated up front so the instance rows and their opening status
  // events can both be bulk-inserted (createMany) inside one transaction
  // instead of N sequential create-then-create round trips.
  const instanceRows = missing.map(({ template, time }) => ({
    id: randomUUID(),
    taskTemplateId: template.id,
    userId,
    date: dateStr,
    scheduledTime: time,
    title: template.title,
    icon: template.icon,
  }));
  const eventRows = instanceRows.map((row) => ({
    id: randomUUID(),
    taskInstanceId: row.id,
    fromStatus: null,
    toStatus: "NOT_STARTED",
  }));

  try {
    await prisma.$transaction([
      ...(staleIds.length > 0 ? [prisma.taskInstance.deleteMany({ where: { id: { in: staleIds } } })] : []),
      ...(instanceRows.length > 0
        ? [
            prisma.taskInstance.createMany({ data: instanceRows }),
            prisma.taskStatusEvent.createMany({ data: eventRows }),
          ]
        : []),
    ]);
  } catch (error) {
    // Benign race: the existence check above and this insert aren't atomic,
    // so two concurrent calls for the same user/date (e.g. many clients
    // refreshing at once right at midnight rollover) can both decide the
    // same instance is missing and both try to create it. The loser hits a
    // unique-constraint violation on (taskTemplateId, userId, date,
    // scheduledTime) -- but the row it wanted now exists, which is exactly
    // the desired end state, so just swallow this one specific error code.
    // Any other error type is a real failure and must still propagate.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

/** Ensures instances exist for every active staff member on this date. Used by admin/supervisor views. */
export async function ensureTaskInstancesForAllUsers(dateStr: string) {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true },
  });
  await Promise.all(users.map((u) => ensureTaskInstancesForUser(u.id, dateStr)));
}

export const NOT_DONE_REASONS = [
  "No time",
  "Material not available",
  "Someone else was using the area",
  "Could not complete",
  "Other",
] as const;
