import { NextResponse } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { prisma } from "@/lib/prisma";
import { ensureTaskInstancesForAllUsers, todayStr } from "@/lib/tasks";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Org-wide task instances for one date, with employee/department attached --
// backs the admin Kanban board. Supports optional employeeId/departmentId
// filters via query params; defaults to today, all employees.
export async function GET(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : todayStr();
  const employeeId = searchParams.get("employeeId") || undefined;
  const departmentId = searchParams.get("departmentId") || undefined;

  await ensureTaskInstancesForAllUsers(date);

  const instances = await prisma.taskInstance.findMany({
    where: {
      date,
      ...(employeeId ? { userId: employeeId } : {}),
      ...(departmentId ? { user: { departmentId } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      taskTemplate: { select: { durationTrackingEnabled: true, priority: true } },
    },
    orderBy: { scheduledTime: "asc" },
  });

  const tasks = instances.map((i) => ({
    id: i.id,
    title: i.title ?? "Task",
    icon: i.icon ?? "📋",
    priority: i.taskTemplate?.priority ?? "NORMAL",
    scheduledTime: i.scheduledTime,
    status: i.status,
    notDoneReason: i.notDoneReason,
    selfAdded: i.selfAdded,
    durationTrackingEnabled: i.taskTemplate?.durationTrackingEnabled ?? false,
    startedAt: i.startedAt ? i.startedAt.toISOString() : null,
    completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    durationSec: i.durationSec,
    userId: i.userId,
    userName: i.user.name,
    departmentId: i.user.departmentId,
    departmentName: i.user.department?.name ?? null,
  }));

  return NextResponse.json({ date, tasks });
}
