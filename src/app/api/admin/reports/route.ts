import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, MANAGER_ROLES } from "@/lib/require-role";
import { todayStr } from "@/lib/tasks";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const auth = await requireRole(MANAGER_ROLES);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || todayStr();
  const to = searchParams.get("to") || from;

  const instances = await prisma.taskInstance.findMany({
    where: { date: { gte: from, lte: to } },
    select: {
      date: true,
      title: true,
      scheduledTime: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationSec: true,
      notDoneReason: true,
      user: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { scheduledTime: "asc" }],
  });

  const header = [
    "Date",
    "Employee",
    "Task",
    "Scheduled Time",
    "Status",
    "Started At",
    "Completed At",
    "Duration (min)",
    "Reason (if not done)",
  ];

  const rows = instances.map((i) =>
    [
      i.date,
      i.user.name,
      // Immutable snapshot taken at creation time — never the live template
      // join — so editing a template later doesn't rewrite past reports.
      i.title ?? "Task",
      i.scheduledTime,
      i.status,
      i.startedAt ? i.startedAt.toISOString() : "",
      i.completedAt ? i.completedAt.toISOString() : "",
      i.durationSec != null ? String(Math.round(i.durationSec / 60)) : "",
      i.notDoneReason ?? "",
    ]
      .map((v) => csvEscape(String(v)))
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="task-report-${from}-to-${to}.csv"`,
    },
  });
}
