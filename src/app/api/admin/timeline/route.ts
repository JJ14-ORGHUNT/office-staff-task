import { NextResponse } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { prisma } from "@/lib/prisma";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Read-only chronological list of every status transition (creation, START,
// DONE, NOT DONE) a given employee's task instances went through on a given
// date — backs the admin timeline view. Sourced from TaskStatusEvent, which
// is append-only, so this is safe to read for any past date without
// recomputation.
export async function GET(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const date = searchParams.get("date") ?? "";

  if (!userId || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const events = await prisma.taskStatusEvent.findMany({
    where: { taskInstance: { userId, date } },
    include: {
      taskInstance: {
        select: { id: true, title: true, icon: true, scheduledTime: true, selfAdded: true },
      },
    },
    orderBy: { at: "asc" },
  });

  return NextResponse.json({
    userId: user.id,
    userName: user.name,
    date,
    events: events.map((e) => ({
      id: e.id,
      at: e.at.toISOString(),
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      taskInstanceId: e.taskInstance.id,
      title: e.taskInstance.title ?? "Task",
      icon: e.taskInstance.icon ?? "📋",
      scheduledTime: e.taskInstance.scheduledTime,
      selfAdded: e.taskInstance.selfAdded,
    })),
  });
}
