import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, MANAGER_ROLES, ADMIN_ROLES } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";
import { parseDateOnlyUTC } from "@/lib/tasks";

export async function GET() {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const templates = await prisma.taskTemplate.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      icon: true,
      type: true,
      priority: true,
      scheduledTimes: true,
      recurrenceDays: true,
      recurrenceDayOfMonth: true,
      specialDate: true,
      reminderMinutesBefore: true,
      durationTrackingEnabled: true,
      active: true,
      department: { select: { name: true } },
      location: { select: { name: true } },
      assignments: { select: { user: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({
    tasks: templates.map((t) => ({
      id: t.id,
      title: t.title,
      icon: t.icon,
      type: t.type,
      priority: t.priority,
      scheduledTimes: t.scheduledTimes,
      recurrenceDays: t.recurrenceDays,
      recurrenceDayOfMonth: t.recurrenceDayOfMonth,
      specialDate: t.specialDate,
      reminderMinutesBefore: t.reminderMinutesBefore,
      durationTrackingEnabled: t.durationTrackingEnabled,
      active: t.active,
      department: t.department?.name ?? null,
      location: t.location?.name ?? null,
      assignees: t.assignments.map((a) => a.user),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const icon = typeof body?.icon === "string" && body.icon.trim() ? body.icon.trim() : "📋";
  const type = typeof body?.type === "string" ? body.type : "DAILY";
  const priority = typeof body?.priority === "string" ? body.priority : "NORMAL";
  const scheduledTimes = typeof body?.scheduledTimes === "string" ? body.scheduledTimes.trim() : "";
  const recurrenceDays = typeof body?.recurrenceDays === "string" && body.recurrenceDays ? body.recurrenceDays : null;
  const recurrenceDayOfMonth =
    typeof body?.recurrenceDayOfMonth === "number" ? body.recurrenceDayOfMonth : null;
  // Parse the incoming "YYYY-MM-DD" as an explicit UTC-midnight instant
  // (never the ambiguous `new Date(str)`, which is UTC-midnight per spec but
  // gets misread against local-timezone getters elsewhere) so the stored
  // value round-trips consistently regardless of server timezone -- see
  // templateAppliesOnDate in src/lib/tasks.ts, which reads it back via UTC
  // getters to match.
  const specialDate =
    typeof body?.specialDate === "string" && body.specialDate ? parseDateOnlyUTC(body.specialDate) : null;
  const reminderMinutesBefore =
    typeof body?.reminderMinutesBefore === "number" ? body.reminderMinutesBefore : 15;
  const durationTrackingEnabled = body?.durationTrackingEnabled === true;
  const departmentId = typeof body?.departmentId === "string" && body.departmentId ? body.departmentId : null;
  const locationId = typeof body?.locationId === "string" && body.locationId ? body.locationId : null;
  const assigneeIds: string[] = Array.isArray(body?.assigneeIds) ? body.assigneeIds : [];

  if (!title || !scheduledTimes) {
    return NextResponse.json({ error: "Title and at least one time are required." }, { status: 400 });
  }
  if (assigneeIds.length === 0) {
    return NextResponse.json({ error: "Please assign this task to at least one employee." }, { status: 400 });
  }

  const template = await prisma.taskTemplate.create({
    data: {
      title,
      icon,
      type: type as never,
      priority: priority as never,
      scheduledTimes,
      recurrenceDays,
      recurrenceDayOfMonth,
      specialDate,
      reminderMinutesBefore,
      durationTrackingEnabled,
      departmentId,
      locationId,
      createdById: auth.session.userId,
      assignments: {
        create: assigneeIds.map((userId) => ({ userId })),
      },
    },
  });

  await logAudit({
    userId: auth.session.userId,
    action: "TASK_CREATED",
    entityType: "TaskTemplate",
    entityId: template.id,
    detail: title,
  });

  return NextResponse.json({ ok: true, id: template.id });
}
