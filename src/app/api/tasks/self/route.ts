import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { todayStr } from "@/lib/tasks";

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  const icon = typeof body?.icon === "string" && body.icon.trim() ? body.icon.trim() : "📌";

  if (!title) {
    return NextResponse.json({ error: "Please enter what you want to add." }, { status: 400 });
  }

  const instance = await prisma.taskInstance.create({
    data: {
      userId: session.userId,
      title,
      icon,
      selfAdded: true,
      date: todayStr(),
      scheduledTime: nowHHMM(),
    },
  });

  await prisma.taskStatusEvent.create({
    data: { taskInstanceId: instance.id, fromStatus: null, toStatus: "NOT_STARTED" },
  });

  await logAudit({
    userId: session.userId,
    action: "SELF_TASK_ADDED",
    entityType: "TaskInstance",
    entityId: instance.id,
    detail: title,
  });

  return NextResponse.json({
    ok: true,
    task: {
      id: instance.id,
      title: instance.title,
      icon: instance.icon,
      priority: "NORMAL",
      time: instance.scheduledTime,
      status: instance.status,
      notDoneReason: null,
      selfAdded: true,
    },
  });
}
