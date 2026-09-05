// Daily rollups for the admin calendar and per-employee timeline.
//
// "Today" is always recomputed live (its TaskInstance rows can still change
// during the day). Any past date is computed once from its (immutable)
// TaskInstance rows and cached in DailySnapshot — subsequent reads for that
// date are served straight from the cache. Future dates simply have no
// TaskInstance rows yet, so they come back empty/neutral without hitting the
// TaskInstance table at all.
import { prisma } from "@/lib/prisma";
import { todayStr, ensureTaskInstancesForAllUsers, ensureTaskInstancesForUser } from "@/lib/tasks";
import type { TaskStatus } from "@/generated/prisma/enums";

export type EmployeeDaySnapshot = {
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

export type DayTaskBreakdown = {
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

export type OrgDaySummary = {
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

export type CalendarCell = {
  date: string;
  hasTasks: boolean;
  totalTasks: number;
  completed: number;
  overdueCount: number;
  completionPct: number;
};

type RawInstance = {
  id: string;
  taskTemplateId: string | null;
  userId: string;
  title: string | null;
  icon: string | null;
  scheduledTime: string;
  status: TaskStatus;
  durationSec: number | null;
  user: { id: string; name: string };
};

// Same "how far into the day are we" cutoff dashboard.ts uses: live wall-clock
// time for today, end-of-day for any other date so an unfinished task on a
// past day always counts as overdue.
function overdueCutoff(date: string): string {
  if (date !== todayStr()) return "23:59";
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function emptyEmployeeBucket(userId: string, name: string): EmployeeDaySnapshot {
  return {
    userId,
    name,
    totalTasks: 0,
    completed: 0,
    inProgress: 0,
    notDone: 0,
    overdueCount: 0,
    totalDurationSec: 0,
    completionPct: 0,
  };
}

function aggregateByEmployee(date: string, instances: RawInstance[]): EmployeeDaySnapshot[] {
  const cutoff = overdueCutoff(date);
  const map = new Map<string, EmployeeDaySnapshot>();

  for (const i of instances) {
    if (!map.has(i.userId)) map.set(i.userId, emptyEmployeeBucket(i.userId, i.user.name));
    const bucket = map.get(i.userId)!;
    bucket.totalTasks += 1;

    if (i.status === "DONE") {
      bucket.completed += 1;
      bucket.totalDurationSec += i.durationSec ?? 0;
    } else if (i.status === "IN_PROGRESS") {
      bucket.inProgress += 1;
    } else if (i.status === "NOT_DONE") {
      bucket.notDone += 1;
    }

    const isOpen = i.status === "NOT_STARTED" || i.status === "IN_PROGRESS";
    if (isOpen && i.scheduledTime < cutoff) bucket.overdueCount += 1;
  }

  for (const bucket of map.values()) {
    bucket.completionPct = bucket.totalTasks ? Math.round((bucket.completed / bucket.totalTasks) * 100) : 0;
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function aggregateByTask(instances: RawInstance[]): DayTaskBreakdown[] {
  const map = new Map<string, DayTaskBreakdown>();

  for (const i of instances) {
    const key = i.taskTemplateId ?? `self:${i.title ?? i.id}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: i.title ?? "Task",
        icon: i.icon ?? "📋",
        total: 0,
        completed: 0,
        inProgress: 0,
        notDone: 0,
        notStarted: 0,
        completionPct: 0,
      });
    }
    const bucket = map.get(key)!;
    bucket.total += 1;
    if (i.status === "DONE") bucket.completed += 1;
    else if (i.status === "IN_PROGRESS") bucket.inProgress += 1;
    else if (i.status === "NOT_DONE") bucket.notDone += 1;
    else bucket.notStarted += 1;
  }

  for (const bucket of map.values()) {
    bucket.completionPct = bucket.total ? Math.round((bucket.completed / bucket.total) * 100) : 0;
  }

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

async function fetchInstances(date: string, userId?: string): Promise<RawInstance[]> {
  return prisma.taskInstance.findMany({
    where: userId ? { date, userId } : { date },
    select: {
      id: true,
      taskTemplateId: true,
      userId: true,
      title: true,
      icon: true,
      scheduledTime: true,
      status: true,
      durationSec: true,
      user: { select: { id: true, name: true } },
    },
  });
}

async function cacheEmployeeSnapshots(date: string, rows: EmployeeDaySnapshot[]) {
  await Promise.all(
    rows.map((r) =>
      prisma.dailySnapshot.upsert({
        where: { userId_date: { userId: r.userId, date } },
        create: {
          userId: r.userId,
          date,
          totalTasks: r.totalTasks,
          completed: r.completed,
          inProgress: r.inProgress,
          notDone: r.notDone,
          overdueCount: r.overdueCount,
          totalDurationSec: r.totalDurationSec,
          completionPct: r.completionPct,
        },
        update: {
          totalTasks: r.totalTasks,
          completed: r.completed,
          inProgress: r.inProgress,
          notDone: r.notDone,
          overdueCount: r.overdueCount,
          totalDurationSec: r.totalDurationSec,
          completionPct: r.completionPct,
          computedAt: new Date(),
        },
      }),
    ),
  );
}

/** Per-employee daily aggregates for a date, with caching per the module doc above. */
export async function getEmployeeSnapshotsForDate(date: string): Promise<EmployeeDaySnapshot[]> {
  const today = todayStr();
  if (date > today) return []; // future: nothing scheduled yet

  if (date === today) {
    // Never cache "today" -- its TaskInstance rows can still change for the
    // rest of the day, so every read must be computed live. Writing a
    // DailySnapshot row here would freeze whatever the state happened to be
    // at the moment of this call and serve that stale snapshot for the rest
    // of the day once the date rolls into the past-date cache-trusting
    // branch below (see the module doc comment at the top of this file).
    await ensureTaskInstancesForAllUsers(date);
    const instances = await fetchInstances(date);
    return aggregateByEmployee(date, instances);
  }

  const cached = await prisma.dailySnapshot.findMany({
    where: { date },
    include: { user: { select: { name: true } } },
  });
  if (cached.length > 0) {
    return cached
      .map((c) => ({
        userId: c.userId,
        name: c.user.name,
        totalTasks: c.totalTasks,
        completed: c.completed,
        inProgress: c.inProgress,
        notDone: c.notDone,
        overdueCount: c.overdueCount,
        totalDurationSec: c.totalDurationSec,
        completionPct: c.completionPct,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const instances = await fetchInstances(date);
  const rows = aggregateByEmployee(date, instances);
  if (rows.length > 0) await cacheEmployeeSnapshots(date, rows);
  return rows;
}

/**
 * Single-employee version of getEmployeeSnapshotsForDate, for the staff mini
 * dashboard — avoids triggering ensureTaskInstancesForAllUsers (which walks
 * every active employee) just to read one person's rollup for one day.
 * Returns null when the employee had no task instances at all that day
 * (distinct from "had tasks but completed zero of them").
 */
export async function getUserDaySnapshot(userId: string, date: string): Promise<EmployeeDaySnapshot | null> {
  const today = todayStr();
  if (date > today) return null; // future: nothing scheduled yet

  if (date === today) {
    // Never cache "today" -- see the identical note in
    // getEmployeeSnapshotsForDate above.
    await ensureTaskInstancesForUser(userId, date);
    const instances = await fetchInstances(date, userId);
    if (instances.length === 0) return null;
    const rows = aggregateByEmployee(date, instances);
    return rows[0] ?? null;
  }

  const cached = await prisma.dailySnapshot.findUnique({
    where: { userId_date: { userId, date } },
    include: { user: { select: { name: true } } },
  });
  if (cached) {
    return {
      userId: cached.userId,
      name: cached.user.name,
      totalTasks: cached.totalTasks,
      completed: cached.completed,
      inProgress: cached.inProgress,
      notDone: cached.notDone,
      overdueCount: cached.overdueCount,
      totalDurationSec: cached.totalDurationSec,
      completionPct: cached.completionPct,
    };
  }

  const instances = await fetchInstances(date, userId);
  if (instances.length === 0) return null;
  const rows = aggregateByEmployee(date, instances);
  const row = rows[0] ?? null;
  if (row) await cacheEmployeeSnapshots(date, [row]);
  return row;
}

/**
 * Invalidates (deletes) the cached DailySnapshot row for one user+date, so
 * the next read of that user/date recomputes fresh from live TaskInstance
 * data instead of serving a stale cached rollup.
 *
 * MUST be called by any code path that writes to a TaskInstance for a date
 * that is already in the past (`date < todayStr()`) -- e.g. an admin
 * correcting a historical task's status well after the fact. A write to a
 * TaskInstance for *today* does NOT need this: today's snapshot is never
 * cached in the first place (see getEmployeeSnapshotsForDate /
 * getUserDaySnapshot above), so it's always computed live already. It's only
 * a past date's frozen cache that can go stale, and only a call here after
 * the write fixes it.
 *
 * DailySnapshot is keyed per user+date (see prisma/schema.prisma), so there
 * is no separate org-wide row to invalidate -- getOrgDaySummary's totals are
 * derived by aggregating per-user snapshots, so invalidating the affected
 * user's row is sufficient to fix the org view too.
 */
export async function invalidateSnapshotForDate(userId: string, date: string): Promise<void> {
  await prisma.dailySnapshot.deleteMany({ where: { userId, date } });
}

/** Full org-wide detail for one date: totals, employee breakdown, task breakdown. */
export async function getOrgDaySummary(date: string): Promise<OrgDaySummary> {
  const byEmployee = await getEmployeeSnapshotsForDate(date);

  let totalTasks = 0;
  let completed = 0;
  let inProgress = 0;
  let notDone = 0;
  let overdueCount = 0;
  let totalDurationSec = 0;
  for (const e of byEmployee) {
    totalTasks += e.totalTasks;
    completed += e.completed;
    inProgress += e.inProgress;
    notDone += e.notDone;
    overdueCount += e.overdueCount;
    totalDurationSec += e.totalDurationSec;
  }

  // Task-wise breakdown is always read live from TaskInstance rather than
  // from a cache -- it's cheap (one query) so there's no real need for a
  // separate cache on top of DailySnapshot. This is safe to disagree with
  // `byEmployee` in neither the today case (byEmployee is also live, per the
  // note above) nor the past-date case: any write to a past date's
  // TaskInstance rows is now required to call invalidateSnapshotForDate,
  // which busts byEmployee's cache, so a past date's cached byEmployee is
  // guaranteed to already reflect the same TaskInstance state this query
  // would read live. That guarantee is what makes it safe for byTask to keep
  // querying live unconditionally instead of branching on cached-vs-today.
  const byTask = byEmployee.length > 0 ? aggregateByTask(await fetchInstances(date)) : [];

  return {
    date,
    hasTasks: byEmployee.length > 0,
    totalTasks,
    completed,
    inProgress,
    notDone,
    overdueCount,
    totalDurationSec,
    completionPct: totalTasks ? Math.round((completed / totalTasks) * 100) : 0,
    byEmployee,
    byTask,
  };
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Compact per-day rollups for a whole month, for the admin calendar grid. */
export async function getMonthCalendarCells(year: number, month0: number): Promise<CalendarCell[]> {
  const count = daysInMonth(year, month0);
  const dates: string[] = [];
  for (let d = 1; d <= count; d++) {
    dates.push(`${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  return Promise.all(
    dates.map(async (date) => {
      const rows = await getEmployeeSnapshotsForDate(date);
      let totalTasks = 0;
      let completed = 0;
      let overdueCount = 0;
      for (const r of rows) {
        totalTasks += r.totalTasks;
        completed += r.completed;
        overdueCount += r.overdueCount;
      }
      return {
        date,
        hasTasks: rows.length > 0,
        totalTasks,
        completed,
        overdueCount,
        completionPct: totalTasks ? Math.round((completed / totalTasks) * 100) : 0,
      };
    }),
  );
}
