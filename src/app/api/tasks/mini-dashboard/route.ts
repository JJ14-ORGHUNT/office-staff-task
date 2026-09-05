import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/tasks";
import { getUserDaySnapshot, type EmployeeDaySnapshot } from "@/lib/snapshot";

// Bounds how far back the streak walk will look before giving up, so a very
// long-tenured employee with an unbroken streak can't turn this into an
// unbounded scan.
const STREAK_LOOKBACK_CAP = 60;
const TREND_DAYS = 7;

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayStr(d);
}

function prevDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}

function dayIsComplete(snapshot: EmployeeDaySnapshot | null): boolean {
  return !!snapshot && snapshot.totalTasks > 0 && snapshot.completed === snapshot.totalTasks;
}

async function computeStreak(userId: string, todaySnapshot: EmployeeDaySnapshot | null): Promise<number> {
  let streak = dayIsComplete(todaySnapshot) ? 1 : 0;
  let cursor = prevDay(todayStr());

  for (let i = 0; i < STREAK_LOOKBACK_CAP; i++) {
    const snapshot = await getUserDaySnapshot(userId, cursor);
    if (!dayIsComplete(snapshot)) break;
    streak += 1;
    cursor = prevDay(cursor);
  }

  return streak;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const today = todayStr();
  const trendDates = Array.from({ length: TREND_DAYS }, (_, i) => dateNDaysAgo(TREND_DAYS - 1 - i));

  const snapshots = await Promise.all(trendDates.map((date) => getUserDaySnapshot(session.userId, date)));

  const trend = trendDates.map((date, idx) => {
    const s = snapshots[idx];
    const total = s?.totalTasks ?? 0;
    const completed = s?.completed ?? 0;
    return {
      date,
      total,
      completed,
      completionPct: total ? Math.round((completed / total) * 100) : 0,
    };
  });

  const weekTotalTasks = trend.reduce((sum, d) => sum + d.total, 0);
  const weekCompleted = trend.reduce((sum, d) => sum + d.completed, 0);

  // Tracked work time: only sum durationSec for instances whose *template*
  // has duration tracking enabled, so a manually toggled IN_PROGRESS->DONE
  // on an ordinary task doesn't get counted as "tracked" work.
  const trackedInstances = await prisma.taskInstance.findMany({
    where: {
      userId: session.userId,
      date: { gte: trendDates[0], lte: today },
      status: "DONE",
      durationSec: { not: null },
      taskTemplate: { durationTrackingEnabled: true },
    },
    select: { durationSec: true },
  });
  const trackedSec = trackedInstances.reduce((sum, r) => sum + (r.durationSec ?? 0), 0);

  const todaySnapshot = snapshots[snapshots.length - 1];
  const streak = await computeStreak(session.userId, todaySnapshot);

  return NextResponse.json({
    trend,
    streak,
    week: {
      totalTasks: weekTotalTasks,
      completed: weekCompleted,
      trackedSec,
      hasTrackedWork: trackedInstances.length > 0,
    },
  });
}
