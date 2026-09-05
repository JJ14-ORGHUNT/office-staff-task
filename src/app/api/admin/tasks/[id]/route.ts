import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";
import { parseDateOnlyUTC } from "@/lib/tasks";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const data: Record<string, unknown> = {};

  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body?.icon === "string" && body.icon.trim()) data.icon = body.icon.trim();
  if (typeof body?.type === "string") data.type = body.type;
  if (typeof body?.priority === "string") data.priority = body.priority;
  if (typeof body?.scheduledTimes === "string" && body.scheduledTimes.trim())
    data.scheduledTimes = body.scheduledTimes.trim();
  if ("recurrenceDays" in (body ?? {})) data.recurrenceDays = body.recurrenceDays || null;
  if ("recurrenceDayOfMonth" in (body ?? {}))
    data.recurrenceDayOfMonth = typeof body.recurrenceDayOfMonth === "number" ? body.recurrenceDayOfMonth : null;
  // Same unambiguous UTC-midnight parsing as the create route (see
  // src/app/api/admin/tasks/route.ts) -- never the ambiguous `new Date(str)`.
  if ("specialDate" in (body ?? {}))
    data.specialDate = typeof body.specialDate === "string" && body.specialDate ? parseDateOnlyUTC(body.specialDate) : null;
  if (typeof body?.reminderMinutesBefore === "number") data.reminderMinutesBefore = body.reminderMinutesBefore;
  if (typeof body?.durationTrackingEnabled === "boolean")
    data.durationTrackingEnabled = body.durationTrackingEnabled;
  if (typeof body?.active === "boolean") data.active = body.active;
  if ("departmentId" in (body ?? {})) data.departmentId = body.departmentId || null;
  if ("locationId" in (body ?? {})) data.locationId = body.locationId || null;

  await prisma.taskTemplate.update({ where: { id }, data });

  if (Array.isArray(body?.assigneeIds)) {
    const assigneeIds: string[] = body.assigneeIds;
    await prisma.taskAssignment.deleteMany({ where: { taskTemplateId: id } });
    if (assigneeIds.length > 0) {
      await prisma.taskAssignment.createMany({
        data: assigneeIds.map((userId) => ({ taskTemplateId: id, userId })),
      });
    }
  }

  await logAudit({
    userId: auth.session.userId,
    action: "TASK_UPDATED",
    entityType: "TaskTemplate",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  // Archive instead of hard delete so historical records/reports stay intact.
  await prisma.taskTemplate.update({ where: { id }, data: { archived: true, active: false } });
  await logAudit({
    userId: auth.session.userId,
    action: "TASK_ARCHIVED",
    entityType: "TaskTemplate",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
