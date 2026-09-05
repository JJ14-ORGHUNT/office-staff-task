import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/tasks";

const HISTORY_DAYS = 21;

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayStr(d);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  // Day-detail view: full immutable task list for one date.
  if (date) {
    const instances = await prisma.taskInstance.findMany({
      where: { userId: session.userId, date },
      orderBy: { scheduledTime: "asc" },
    });

    return NextResponse.json({
      date,
      tasks: instances.map((i) => ({
        id: i.id,
        // Immutable snapshot — never a live template join.
        title: i.title ?? "Task",
        icon: i.icon ?? "📌",
        time: i.scheduledTime,
        status: i.status,
        startedAt: i.startedAt ? i.startedAt.toISOString() : null,
        completedAt: i.completedAt ? i.completedAt.toISOString() : null,
        durationSec: i.durationSec,
        notDoneReason: i.notDoneReason,
        notDoneNote: i.notDoneNote,
        selfAdded: i.selfAdded,
      })),
    });
  }

  // Day-list view: last HISTORY_DAYS days, most recent first.
  const today = todayStr();
  const oldest = dateNDaysAgo(HISTORY_DAYS - 1);

  const instances = await prisma.taskInstance.findMany({
    where: { userId: session.userId, date: { gte: oldest, lte: today } },
    select: { date: true, status: true },
  });

  const byDate = new Map<string, { total: number; done: number }>();
  for (const i of instances) {
    const bucket = byDate.get(i.date) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (i.status === "DONE") bucket.done += 1;
    byDate.set(i.date, bucket);
  }

  // Always include today, even with zero tasks, so the list never looks empty
  // right after login.
  if (!byDate.has(today)) byDate.set(today, { total: 0, done: 0 });

  const days = Array.from(byDate.entries())
    .map(([d, bucket]) => ({ date: d, total: bucket.total, done: bucket.done }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({ days });
}
