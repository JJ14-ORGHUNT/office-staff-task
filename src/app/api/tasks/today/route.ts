import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTaskInstancesForUser, todayStr } from "@/lib/tasks";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const date = todayStr();
  await ensureTaskInstancesForUser(session.userId, date);

  const instances = await prisma.taskInstance.findMany({
    where: { userId: session.userId, date },
    select: {
      id: true,
      title: true,
      icon: true,
      scheduledTime: true,
      status: true,
      notDoneReason: true,
      selfAdded: true,
      startedAt: true,
      completedAt: true,
      durationSec: true,
      taskTemplate: { select: { priority: true, durationTrackingEnabled: true } },
    },
    orderBy: { scheduledTime: "asc" },
  });

  const tasks = instances.map((i) => ({
    id: i.id,
    // Title/icon are immutable snapshots taken at instance-creation time —
    // never live-joined from the template, so editing a template later
    // cannot silently rewrite what past (or already-completed) records show.
    title: i.title ?? "Task",
    icon: i.icon ?? "📌",
    priority: i.taskTemplate?.priority ?? "NORMAL",
    time: i.scheduledTime,
    status: i.status,
    notDoneReason: i.notDoneReason,
    selfAdded: i.selfAdded,
    durationTrackingEnabled: i.taskTemplate?.durationTrackingEnabled ?? false,
    startedAt: i.startedAt ? i.startedAt.toISOString() : null,
    completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    durationSec: i.durationSec,
  }));

  const done = tasks.filter((t) => t.status === "DONE").length;

  return NextResponse.json({
    date,
    name: session.name,
    tasks,
    total: tasks.length,
    done,
  });
}
