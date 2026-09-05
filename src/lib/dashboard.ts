import { prisma } from "@/lib/prisma";
import { ensureTaskInstancesForAllUsers, todayStr } from "@/lib/tasks";

export type ActivityEvent = {
  id: string;
  at: string; // ISO
  employeeId: string;
  employeeName: string;
  taskTitle: string;
  taskIcon: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  overriddenByName: string | null; // set when an admin/supervisor made the change, not the task's own owner
};

export type AttentionItem = {
  instanceId: string;
  employeeId: string;
  employeeName: string;
  taskTitle: string;
  taskIcon: string;
  scheduledTime: string;
  overdueMinutes: number;
};

export type AttentionRequired = {
  count: number;
  items: AttentionItem[];
};

/**
 * Most recent real status transitions org-wide (for the admin "Recent
 * Activity" feed) -- excludes the silent NOT_STARTED creation events that
 * ensureTaskInstancesForUser writes for every instance, since those aren't
 * staff activity, just bookkeeping.
 */
export async function getRecentActivity(date: string = todayStr(), limit = 20): Promise<ActivityEvent[]> {
  const events = await prisma.taskStatusEvent.findMany({
    where: { taskInstance: { date }, toStatus: { not: "NOT_STARTED" } },
    include: {
      taskInstance: { select: { title: true, icon: true, userId: true, user: { select: { name: true } } } },
      changedByUser: { select: { name: true } },
    },
    orderBy: { at: "desc" },
    take: limit,
  });

  return events.map((e) => ({
    id: e.id,
    at: e.at.toISOString(),
    employeeId: e.taskInstance.userId,
    employeeName: e.taskInstance.user.name,
    taskTitle: e.taskInstance.title ?? "Task",
    taskIcon: e.taskInstance.icon ?? "📋",
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    note: e.note,
    overriddenByName: e.changedByUser?.name ?? null,
  }));
}

/**
 * Overdue-right-now tasks org-wide (open status + scheduled time already
 * passed), worst offenders first, for the admin "Attention Required" panel.
 * Uses the same open-status + scheduled-time-vs-now rule as getDashboardStats.
 */
export async function getAttentionRequired(
  date: string = todayStr(),
  limit = 8,
  skipEnsure = false,
): Promise<AttentionRequired> {
  if (!skipEnsure) await ensureTaskInstancesForAllUsers(date);

  const instances = await prisma.taskInstance.findMany({
    where: { date, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    select: {
      id: true,
      title: true,
      icon: true,
      scheduledTime: true,
      user: { select: { id: true, name: true } },
    },
  });

  const now = new Date();
  const nowMinutes =
    date === todayStr() ? now.getHours() * 60 + now.getMinutes() : 23 * 60 + 59;

  const overdue: AttentionItem[] = [];
  for (const i of instances) {
    const [h, m] = i.scheduledTime.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    const scheduledMinutes = h * 60 + m;
    const overdueMinutes = nowMinutes - scheduledMinutes;
    if (overdueMinutes > 0) {
      overdue.push({
        instanceId: i.id,
        employeeId: i.user.id,
        employeeName: i.user.name,
        taskTitle: i.title ?? "Task",
        taskIcon: i.icon ?? "📋",
        scheduledTime: i.scheduledTime,
        overdueMinutes,
      });
    }
  }

  overdue.sort((a, b) => b.overdueMinutes - a.overdueMinutes);

  return { count: overdue.length, items: overdue.slice(0, limit) };
}

export type EmployeeBucket = {
  id: string;
  name: string;
  total: number;
  done: number;
  inProgress: number;
  notStarted: number;
  notDone: number;
  overdue: number;
};

export type DashboardStats = {
  date: string;
  employees: number;
  totalTasks: number;
  completed: number;
  inProgress: number;
  notDone: number;
  overdue: number;
  completionPct: number;
  byEmployee: EmployeeBucket[];
};

export async function getDashboardStats(date: string = todayStr(), skipEnsure = false): Promise<DashboardStats> {
  if (!skipEnsure) await ensureTaskInstancesForAllUsers(date);

  const instances = await prisma.taskInstance.findMany({
    where: { date },
    select: {
      userId: true,
      status: true,
      scheduledTime: true,
      user: { select: { name: true } },
    },
  });

  const now = new Date();
  const nowTime =
    date === todayStr()
      ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      : "23:59";

  let completed = 0;
  let inProgress = 0;
  let notDone = 0;
  let overdue = 0;

  const byEmployee = new Map<string, EmployeeBucket>();

  for (const i of instances) {
    if (!byEmployee.has(i.userId)) {
      byEmployee.set(i.userId, {
        id: i.userId,
        name: i.user.name,
        total: 0,
        done: 0,
        inProgress: 0,
        notStarted: 0,
        notDone: 0,
        overdue: 0,
      });
    }
    const bucket = byEmployee.get(i.userId)!;
    bucket.total += 1;

    if (i.status === "DONE") {
      completed += 1;
      bucket.done += 1;
    } else if (i.status === "IN_PROGRESS") {
      inProgress += 1;
      bucket.inProgress += 1;
    } else if (i.status === "NOT_DONE") {
      notDone += 1;
      bucket.notDone += 1;
    } else {
      bucket.notStarted += 1;
    }

    const isOpen = i.status === "NOT_STARTED" || i.status === "IN_PROGRESS";
    if (isOpen && i.scheduledTime < nowTime) {
      overdue += 1;
      bucket.overdue += 1;
    }
  }

  const employees = await prisma.user.count({ where: { active: true } });

  return {
    date,
    employees,
    totalTasks: instances.length,
    completed,
    inProgress,
    notDone,
    overdue,
    completionPct: instances.length ? Math.round((completed / instances.length) * 100) : 0,
    byEmployee: Array.from(byEmployee.values()).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
